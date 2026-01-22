import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
const { Request } = db;

/**
 * @swagger
 * /api/user/requests/{requestId}:
 *   delete:
 *     summary: Cancel a join request
 *     description: Cancel the user's own pending join request
 *     tags: [Join Requests]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Join request ID to cancel
 *         example: 1
 *     responses:
 *       200:
 *         description: Join request cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Join request cancelled successfully!"
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Join request not found or not owned by user
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
export const cancelJoinRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { userId } = req;

    // Find the request and verify ownership
    const request = await Request.findOne({
      where: {
        id: requestId,
        user_id: userId,
        status: 'pending',
      },
    });

    if (!request) {
      return res.status(404).send({
        message: 'Join request not found or cannot be cancelled!',
      });
    }

    // Delete the request (cancellation)
    await request.destroy();

    log.api.info('Join request cancelled', {
      requestId,
      userId,
      organizationId: request.organization_id,
    });

    return res.send({ message: 'Join request cancelled successfully!' });
  } catch (err) {
    log.error.error('Error cancelling join request:', {
      error: err.message,
      requestId: req.params.requestId,
      userId: req.userId,
    });
    return res.status(500).send({ message: 'Error cancelling join request' });
  }
};
