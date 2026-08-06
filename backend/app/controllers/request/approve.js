import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { createExternalInvite, resolveInviterUuid } from '../../utils/externalInvites.js';
const { Request, organization: Organization, user: User } = db;

/**
 * Approve a join request on an SSO-managed org: membership is IdP-truth, so
 * instead of a local membership row the approval delegates an invite to the
 * auth server as boxvault_s2s — the membership then arrives via SCIM once the
 * user accepts at the provider. The request row is finalized as approved
 * (locally the approval is complete; the IdP owns the rest of the journey).
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
  if (!requester) {
    return res.status(404).send({ message: req.__('requests.notFound') });
  }

  try {
    const invitedByUserUuid = await resolveInviterUuid(reviewerId, organization.external_issuer);
    await createExternalInvite(organization, requester.email, assignedRole, invitedByUserUuid);
  } catch (delegationErr) {
    // Surface the auth server's own 400 (e.g. approver has no account there)
    // instead of masking it behind a generic transport error.
    const upstreamStatus = delegationErr.response?.status;
    const upstreamMessage =
      delegationErr.response?.data?.message || delegationErr.response?.data?.error;
    if (upstreamStatus === 400 && upstreamMessage) {
      return res.status(400).send({ message: upstreamMessage });
    }
    log.error.error('Failed to delegate join-request approval to auth server:', delegationErr);
    return res.status(502).send({ message: req.__('requests.approve.externalError') });
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
 *               assignedRole:
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
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Requires admin or owner role in organization
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Join request not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const approveJoinRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const assignedRoleInput = req.body?.assignedRole;
    const { userId: reviewerId, organizationId } = req;

    // Default to 'member' if not provided
    const assignedRole = assignedRoleInput || 'member';

    // Validate assigned role
    const validRoles = ['member', 'admin'];
    if (!validRoles.includes(assignedRole)) {
      return res.status(400).send({
        message: req.__('requests.invalidRole'),
      });
    }

    // Verify request belongs to this organization
    const request = await Request.findByPk(requestId);
    if (!request || request.organization_id !== organizationId) {
      return res.status(404).send({ message: req.__('requests.notFound') });
    }

    if (request.status !== 'pending') {
      return res.status(400).send({ message: req.__('requests.alreadyProcessed') });
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
    return res.status(500).send({ message: req.__('requests.approve.error') });
  }
};
