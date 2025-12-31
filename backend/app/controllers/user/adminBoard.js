// adminBoard.js

/**
 * @swagger
 * /api/users/admin:
 *   get:
 *     summary: Get admin board content
 *     description: Retrieve content for admin users only
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
 *               example: "Admin Content."
 */
exports.adminBoard = (req, res) => {
  const { log } = require('../../utils/Logger');
  log.app.debug('Admin board accessed', { method: req.method });
  res.status(200).send('Admin Content.');
};
