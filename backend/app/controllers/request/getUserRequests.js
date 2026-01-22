import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
const { Request } = db;

/**
 * @swagger
 * /api/user/requests:
 *   get:
 *     summary: Get current user's pending join requests
 *     description: Retrieve all pending join requests submitted by the authenticated user
 *     tags: [Join Requests]
 *     security:
 *       - JwtAuth: []
 *     responses:
 *       200:
 *         description: List of user's pending join requests
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
 *                   organization:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *       401:
 *         description: Authentication required
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
export const getUserJoinRequests = async (req, res) => {
  try {
    const { userId } = req;

    const requests = await Request.getUserPendingRequests(userId);

    return res.send(requests);
  } catch (err) {
    log.error.error('Error fetching user join requests:', {
      error: err.message,
      userId: req.userId,
    });
    return res.status(500).send({ message: 'Error fetching your join requests' });
  }
};
