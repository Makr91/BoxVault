// adminBoard.js
import { log } from '../../utils/Logger.js';

/**
 * @swagger
 * /api/users/admin:
 *   get:
 *     summary: Get admin board content
 *     description: Retrieve content for admin users (requires admin role)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin content retrieved successfully
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "Admin Board."
 */
export const adminBoard = (req, res) => {
  log.app.debug('Admin board accessed', { method: req.method });
  res.status(200).send(req.__('users.adminBoard'));
};
