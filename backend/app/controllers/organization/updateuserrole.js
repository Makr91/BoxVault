const db = require('../../models');
const { log } = require('../../utils/Logger');
const { UserOrg } = db;
const User = db.user;

/**
 * @swagger
 * /api/organization/{organization}/users/{userId}/role:
 *   put:
 *     summary: Update user's role in organization
 *     description: Change a user's role within an organization (admin only)
 *     tags: [Organizations]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *         example: acme-corp
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID to update role for
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [user, moderator, admin]
 *                 description: New role to assign
 *                 example: "moderator"
 *     responses:
 *       200:
 *         description: User role updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User role updated to moderator"
 *                 userId:
 *                   type: integer
 *                 username:
 *                   type: string
 *                 newRole:
 *                   type: string
 *       400:
 *         description: Invalid role
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Requires admin role in organization
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: User or organization not found, or user not a member
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
const updateUserOrgRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    const { organizationId } = req; // Set by verifyOrgAccess middleware

    // Validate role
    const validRoles = ['user', 'moderator', 'admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).send({
        message: req.__('organizations.invalidRole'),
      });
    }

    // Find the user
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).send({ message: req.__('users.userNotFound') });
    }

    // Find user's membership in this organization
    const membership = await UserOrg.findUserOrgRole(userId, organizationId);
    if (!membership) {
      return res.status(404).send({
        message: req.__('organizations.userNotMember'),
      });
    }

    // Update the role
    await membership.update({ role });

    log.api.info('User organization role updated', {
      userId,
      organizationId,
      oldRole: membership.role,
      newRole: role,
      updatedBy: req.userId,
    });

    return res.send({
      message: req.__('organizations.userRoleUpdated', { role }),
      userId: user.id,
      username: user.username,
      newRole: role,
    });
  } catch (err) {
    log.error.error('Error updating user organization role:', {
      error: err.message,
      userId: req.params.userId,
      organizationId: req.organizationId,
      requestedRole: req.body.role,
    });
    return res.status(500).send({ message: req.__('organizations.updateUserRoleError') });
  }
};

module.exports = { updateUserOrgRole };
