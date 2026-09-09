import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import { createExternalInvite } from '../../utils/externalInvites.js';
import { extractOidcAccessToken } from '../favorites/helpers.js';
const { Request, organization: Organization, user: User } = db;

const RETRY_AFTER_SECONDS = '60';
const UPSTREAM_TYPES = { 400: 'bad-request', 403: 'forbidden' };

const badRequest = (req, res, key) =>
  problem(res, req, { status: 400, type: 'bad-request', title: req.__(key) });

/**
 * Approve a join request on an SSO-managed org: membership is IdP-truth, so
 * instead of a local membership row the approval delegates an invite to the
 * auth server as the APPROVING USER (contract v2 Mode B, their token carries
 * the actor) — the membership then arrives via SCIM once the user accepts at
 * the provider. The request row is finalized as approved (locally the
 * approval is complete; the IdP owns the rest of the journey).
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Object} params - { request, organization, assignedRole, reviewerId }
 * @returns {Promise<Object>} The response
 */
const approveViaIdpInvite = async (
  req,
  res,
  { request, organization, assignedRole, reviewerId }
) => {
  const requester = await User.findByPk(request.user_id);

  const oidcAccessToken = extractOidcAccessToken(req);
  if (!oidcAccessToken) {
    return badRequest(req, res, 'invitations.requiresIdpAccount');
  }

  try {
    await createExternalInvite(organization, requester.email, assignedRole, oidcAccessToken);
  } catch (delegationErr) {
    // Surface the auth server's own 400/403 (validation, Mode B RBAC) instead
    // of masking it behind a generic transport error.
    const upstreamStatus = delegationErr.response?.status;
    const upstreamMessage =
      delegationErr.response?.data?.message ||
      delegationErr.response?.data?.detail ||
      delegationErr.response?.data?.error;
    if (UPSTREAM_TYPES[upstreamStatus] && upstreamMessage) {
      return problem(res, req, {
        status: upstreamStatus,
        type: UPSTREAM_TYPES[upstreamStatus],
        title: upstreamMessage,
      });
    }
    log.error.error('Failed to delegate join-request approval to auth server:', delegationErr);
    res.set('Retry-After', RETRY_AFTER_SECONDS);
    return problem(res, req, {
      status: 503,
      type: 'send-failed',
      title: req.__('requests.approve.externalError'),
    });
  }

  await request.update({
    status: 'approved',
    reviewed_by: reviewerId,
    reviewed_at: new Date(),
  });

  log.api.info('Join request approved via IdP invite delegation', {
    requestId: request.id,
    reviewerId,
    organizationId: organization.id,
    assignedRole,
  });

  return res.send({
    message: req.__('requests.approvedDelegated'),
    assignedRole,
  });
};

/**
 * @swagger
 * /api/organization/{organization}/requests/{requestId}/approve:
 *   post:
 *     summary: Approve a join request
 *     description: Approve a pending join request and add the user to the organization (admin/owner only)
 *     tags: [Join Requests]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *         example: acme-corp
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Join request ID to approve
 *         example: 1
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               assigned_role:
 *                 type: string
 *                 enum: [member, admin]
 *                 description: Role to assign to the user (defaults to 'member')
 *                 example: "member"
 *     responses:
 *       200:
 *         description: Join request approved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Join request approved successfully!"
 *                 assignedRole:
 *                   type: string
 *                   example: "member"
 *       400:
 *         description: Invalid role or request already processed
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       403:
 *         description: Requires admin or owner role in organization
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Join request not found
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       503:
 *         description: The identity provider could not take the invite the approval delegates; Retry-After names when to try again
 *         headers:
 *           Retry-After:
 *             schema:
 *               type: integer
 *             description: Seconds to wait before retrying
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const approveJoinRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const assignedRoleInput = req.body?.assigned_role;
    const { userId: reviewerId, organizationId } = req;

    // Default to 'member' if not provided
    const assignedRole = assignedRoleInput || 'member';

    // Validate assigned role
    const validRoles = ['member', 'admin'];
    if (!validRoles.includes(assignedRole)) {
      return badRequest(req, res, 'requests.invalidRole');
    }

    // Verify request belongs to this organization
    const request = await Request.findByPk(requestId);
    if (!request || request.organization_id !== organizationId) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('requests.notFound'),
      });
    }

    if (request.status !== 'pending') {
      return badRequest(req, res, 'requests.alreadyProcessed');
    }

    // SSO-managed orgs never get local membership rows — delegate to the IdP.
    const organization = await Organization.findByPk(organizationId);
    if (organization?.external_issuer) {
      return approveViaIdpInvite(req, res, {
        request,
        organization,
        assignedRole,
        reviewerId,
      });
    }

    // Approve the request
    await Request.approveRequest(requestId, reviewerId, assignedRole);

    log.api.info('Join request approved', {
      requestId,
      reviewerId,
      organizationId,
      assignedRole,
    });

    return res.send({
      message: req.__('requests.approved'),
      assignedRole,
    });
  } catch (err) {
    log.error.error('Error approving join request:', {
      error: err.message,
      requestId: req.params.requestId,
      reviewerId: req.userId,
    });
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('requests.approve.error'),
    });
  }
};
