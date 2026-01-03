// update.js
const db = require('../../models');

const User = db.user;
const Organization = db.organization;

/**
 * @swagger
 * /api/organization/{organizationName}/users/{userName}:
 *   put:
 *     summary: Update a user in an organization
 *     description: Update user information within an organization (Admin only)
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 description: New username
 *               email:
 *                 type: string
 *                 format: email
 *                 description: New email address
 *               password:
 *                 type: string
 *                 format: password
 *                 description: New password
 *               roles:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: User roles
 *               organization:
 *                 type: string
 *                 description: New organization name
 *     responses:
 *       200:
 *         description: User updated successfully
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
exports.update = async (req, res) => {
  const { organization: organizationName, userName } = req.params;
  const { username, email, password, roles, organization } = req.body;

  try {
    const old_organization = await Organization.findOne({
      where: { name: organizationName },
    });

    const new_organization = await Organization.findOne({
      where: { name: organization },
    });

    if (!organization) {
      return res.status(404).send({
        message: req.__('organizations.organizationNotFoundWithName', {
          organization: organizationName,
        }),
      });
    }

    if (!new_organization) {
      return res.status(404).send({
        message: req.__('organizations.organizationNotFoundWithName', { organization }),
      });
    }

    const user = await User.findOne({
      where: {
        username: userName,
        organizationId: new_organization.id || old_organization.id,
      },
    });

    if (!user) {
      return res.status(404).send({
        message: req.__('users.userNotFoundWithName', { username: userName }),
      });
    }

    await user.update({
      username: username || user.username,
      email: email || user.email,
      password: password || user.password,
      roles: roles || user.roles,
      organizationId: new_organization || organization.id,
    });

    return res.status(200).send(user);
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('users.update.error'),
    });
  }
};
