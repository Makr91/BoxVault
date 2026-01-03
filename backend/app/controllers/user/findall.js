// findall.js
const db = require('../../models');

const Organization = db.organization;

/**
 * @swagger
 * /api/organization/{organizationName}/users:
 *   get:
 *     summary: Get all users in an organization
 *     description: Retrieve all users belonging to a specific organization
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationName
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *     responses:
 *       200:
 *         description: List of users in the organization
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       404:
 *         description: Organization not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
exports.findAll = async (req, res) => {
  try {
    const { organization: organizationName } = req.params;
    const organization = await Organization.findOne({
      where: { name: organizationName },
      include: ['users'],
    });

    if (!organization) {
      return res.status(404).send({
        message: req.__('organizations.organizationNotFoundWithName', {
          organization: organizationName,
        }),
      });
    }

    return res.send(organization.members);
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('users.findAll.error'),
    });
  }
};
