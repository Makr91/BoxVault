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
export const findAll = async (req, res) => {
  try {
    const { userId } = req;
    const serviceAccounts = await ServiceAccount.getForUser(userId);
    return res.send(serviceAccounts);
  } catch (err) {
    return res.status(500).send({ message: err.message });
  }
};
