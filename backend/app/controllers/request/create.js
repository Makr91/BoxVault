import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import { notifyJoinRequestCreated } from './notifications.js';
const { Request, UserOrg, organization: Organization, user: User } = db;

const badRequest = (req, res, key) =>
  problem(res, req, { status: 400, type: 'bad-request', title: req.__(key) });

/**
 * @swagger
 * /api/organization/{organization}/requests:
 *   post:
 *     summary: Create a join request for an organization
 *     description: Submit a request to join an organization that has 'request_to_join' access mode
 *     tags: [Join Requests]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name to request to join
 *         example: acme-corp
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 description: Optional message explaining why you want to join
 *                 example: "I would like to contribute to this organization's boxes"
 *     responses:
 *       201:
 *         description: Join request created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Join request submitted successfully!"
 *                 request:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     organizationName:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "pending"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid request - already a member or already has pending request
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       403:
 *         description: Organization does not allow join requests
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Organization not found
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
 */
export const createJoinRequest = async (req, res) => {
  try {
    const { organization: orgName } = req.params;
    const message = req.body?.message;
    const { userId } = req;

    // Find the organization
    const organization = await Organization.findOne({ where: { name: orgName } });
    if (!organization) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('requests.organizationNotFound'),
      });
    }

    // Check if organization allows join requests
    if (organization.access_mode !== 'request_to_join') {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('requests.joinRequestsNotAllowed'),
      });
    }

    // Check if user is already a member
    const existingMembership = await UserOrg.findUserOrgRole(userId, organization.id);
    if (existingMembership) {
      return badRequest(req, res, 'requests.alreadyMember');
    }

    // Check if user already has a pending request
    const hasPending = await Request.hasPendingRequest(userId, organization.id);
    if (hasPending) {
      return badRequest(req, res, 'requests.alreadyPending');
    }

    // Create the join request
    const joinRequest = await Request.createJoinRequest(userId, organization.id, message);

    log.api.info('Join request created', {
      userId,
      organizationName: orgName,
      requestId: joinRequest.id,
    });

    const requester = await User.findByPk(userId);
    if (requester) {
      await notifyJoinRequestCreated(organization, requester, joinRequest.id);
    }

    return res.status(201).send({
      message: req.__('requests.submitted'),
      request: {
        id: joinRequest.id,
        organizationName: orgName,
        status: 'pending',
        createdAt: joinRequest.created_at,
      },
    });
  } catch (err) {
    log.error.error('Error creating join request:', {
      error: err.message,
      userId: req.userId,
      organization: req.params.organization,
    });
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('requests.create.error'),
    });
  }
};
