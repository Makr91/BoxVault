import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
const { Request } = db;

/**
 * @swagger
 * /api/organization/{organization}/requests/{requestId}/deny:
 *   post:
 *     summary: Deny a join request
 *     description: Deny a pending join request (moderator/admin only)
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
 *         description: Join request ID to deny
 *         example: 1
 *     responses:
 *       200:
 *         description: Join request denied successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Join request denied."
 *       400:
 *         description: Request already processed
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
export const denyJoinRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { userId: reviewerId, organizationId } = req;

    // Verify request belongs to this organization
    const request = await Request.findByPk(requestId);
    if (!request || request.organization_id !== organizationId) {
      return res.status(404).send({ message: 'Join request not found!' });
    }

    if (request.status !== 'pending') {
      return res.status(400).send({ message: 'Request has already been processed!' });
    }

    // Deny the request
    await Request.denyRequest(requestId, reviewerId);

    log.api.info('Join request denied', {
      requestId,
      reviewerId,
      organizationId,
    });

    return res.send({ message: 'Join request denied.' });
  } catch (err) {
    log.error.error('Error denying join request:', {
      error: err.message,
      requestId: req.params.requestId,
      reviewerId: req.userId,
    });
    return res.status(500).send({ message: 'Error denying join request' });
  }
};
