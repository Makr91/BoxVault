import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import db from '../../models/index.js';
const { service_account: ServiceAccount } = db;

/**
 * @swagger
 * /api/service-accounts:
 *   get:
 *     summary: Get all service accounts for the authenticated user
 *     description: Retrieve all service accounts created by the authenticated user
 *     tags: [Service Accounts]
 *     security:
 *       - JwtAuth: []
 *     responses:
 *       200:
 *         description: List of service accounts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ServiceAccount'
 *       401:
 *         description: Authentication required
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
export const findAll = async (req, res) => {
  try {
    const { userId } = req;
    const serviceAccounts = await ServiceAccount.getForUser(userId);
    return res.send(serviceAccounts);
  } catch (err) {
    log.error.error('Error retrieving service accounts:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};
