// findone.js
const db = require('../../models');

const User = db.user;
const Organization = db.organization;

/**
 * @swagger
 * /api/organization/{organizationName}/users/{userName}:
 *   get:
 *     summary: Get a specific user in an organization
 *     description: Retrieve information about a specific user within an organization (Admin only)
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
 *       - in: path
 *         name: userName
 *         required: true
 *         schema:
 *           type: string
 *         description: Username
 *     responses:
 *       200:
 *         description: User information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: User or organization not found
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
exports.findOne = async (req, res) => {
  const { organization: organizationName, userName } = req.params;

  try {
    const organization = await Organization.findOne({
      where: { name: organizationName },
    });

    if (!organization) {
      return res.status(404).send({
        message: `Organization ${organizationName} not found.`,
      });
    }

    const user = await User.findOne({
      where: {
        username: userName,
        organizationId: organization.id,
      },
    });

    if (!user) {
      return res.status(404).send({
        message: `User ${userName} not found.`,
      });
    }

    return res.status(200).send(user);
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while retrieving the user.',
    });
  }
};
