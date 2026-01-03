// organization.js
const { log } = require('../../utils/Logger');

/**
 * @swagger
 * /api/users/organization:
 *   get:
 *     summary: Get organization content
 *     description: Retrieve content for organization access
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Organization content retrieved successfully
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "Organization Content."
 */
exports.organization = (req, res) => {
  log.app.debug('Organization endpoint accessed', { method: req.method });
  res.status(200).send(req.__('users.organizationContent'));
};
