import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
const { Request } = db;

/**
 * @swagger
 * /api/organization/{organization}/requests/{requestId}/deny:
 *   post:
 *     summary: Deny a join request
 *     description: Deny a pending join request (admin/owner only)
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
 */
export const denyJoinRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { userId: reviewerId, organizationId } = req;

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
      return problem(res, req, {
        status: 400,
        type: 'bad-request',
        title: req.__('requests.alreadyProcessed'),
      });
    }

    // Deny the request
    await Request.denyRequest(requestId, reviewerId);

    log.api.info('Join request denied', {
      requestId,
      reviewerId,
      organizationId,
    });

    return res.send({ message: req.__('requests.denied') });
  } catch (err) {
    log.error.error('Error denying join request:', {
      error: err.message,
      requestId: req.params.requestId,
      reviewerId: req.userId,
    });
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('requests.deny.error'),
    });
  }
};
