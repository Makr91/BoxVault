import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
const { Request } = db;

/**
 * @swagger
 * /api/organization/{organization}/requests:
 *   get:
 *     summary: Get pending join requests for an organization
 *     description: Retrieve all pending join requests for the organization (admin/owner only)
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
 *     responses:
 *       200:
 *         description: List of pending join requests
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   user_id:
 *                     type: integer
 *                   organization_id:
 *                     type: integer
 *                   status:
 *                     type: string
 *                     example: "pending"
 *                   message:
 *                     type: string
 *                   created_at:
 *                     type: string
 *                     format: date-time
 *                   user:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       username:
 *                         type: string
 *                       email:
 *                         type: string
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
 *       500:
 *         description: Internal server error
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const getOrgJoinRequests = async (req, res) => {
  try {
    const { organizationId } = req; // Set by verifyOrgAccess middleware

    const requests = await Request.getPendingRequests(organizationId);

    return res.send(requests);
  } catch (err) {
    log.error.error('Error fetching organization join requests:', {
      error: err.message,
      organizationId: req.organizationId,
    });
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('requests.fetchOrg.error'),
    });
  }
};
