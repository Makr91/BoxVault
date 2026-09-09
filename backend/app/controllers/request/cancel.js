import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
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
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Join request not found or not owned by user
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
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('requests.notFoundOrNotCancellable'),
      });
    }

    // Delete the request (cancellation)
    await request.destroy();

    log.api.info('Join request cancelled', {
      requestId,
      userId,
      organizationId: request.organization_id,
    });

    return res.send({ message: req.__('requests.cancelled') });
  } catch (err) {
    log.error.error('Error cancelling join request:', {
      error: err.message,
      requestId: req.params.requestId,
      userId: req.userId,
    });
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('requests.cancel.error'),
    });
  }
};
