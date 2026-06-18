import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
const { Request } = db;

/**
 * @swagger
 * /api/organization/{organization}/requests/{requestId}/approve:
 *   post:
 *     summary: Approve a join request
 *     description: Approve a pending join request and add the user to the organization (moderator/admin only)
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
 *                 enum: [user, moderator]
 *                 description: Role to assign to the user (defaults to 'user')
 *                 example: "user"
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
 *                   example: "user"
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
 *         description: Requires moderator or admin role in organization
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

    // Default to 'user' if not provided
    const assignedRole = assignedRoleInput || 'user';

    // Validate assigned role
    const validRoles = ['user', 'moderator'];
    if (!validRoles.includes(assignedRole)) {
      return res.status(400).send({
        message: 'Invalid role. Must be user or moderator.',
      });
    }

    // Verify request belongs to this organization
    const request = await Request.findByPk(requestId);
    if (!request || request.organization_id !== organizationId) {
      return res.status(404).send({ message: 'Join request not found!' });
    }

    if (request.status !== 'pending') {
      return res.status(400).send({ message: 'Request has already been processed!' });
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
      message: 'Join request approved successfully!',
      assignedRole,
    });
  } catch (err) {
    log.error.error('Error approving join request:', {
      error: err.message,
      requestId: req.params.requestId,
      reviewerId: req.userId,
    });
    return res.status(500).send({ message: 'Error approving join request' });
  }
};
