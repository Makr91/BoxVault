// findone.js
import db from '../../models/index.js';
const { user: User, organization: Organization, UserOrg } = db;

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
export const findOne = async (req, res) => {
  const { organization: organizationName, userName } = req.params;

  try {
    const organization = await Organization.findOne({
      where: { name: organizationName },
    });

    if (!organization) {
      return res.status(404).send({
        message: req.__('organizations.organizationNotFoundWithName', {
          organization: organizationName,
        }),
      });
    }

    // Find user by username first
    const user = await User.findOne({
      where: { username: userName },
    });

    if (!user) {
      return res.status(404).send({
        message: req.__('users.userNotFoundWithName', { username: userName }),
      });
    }

    // Check if user is a member of the organization
    const membership = await UserOrg.findUserOrgRole(user.id, organization.id);

    if (!membership) {
      return res.status(404).send({
        message: req.__('users.userNotFoundWithName', { username: userName }),
      });
    }

    const { password, ...userWithoutPassword } = user.toJSON();
    void password;
    return res.status(200).send(userWithoutPassword);
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('users.findOne.error'),
    });
  }
};
