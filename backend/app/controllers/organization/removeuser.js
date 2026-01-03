const db = require('../../models');
const { log } = require('../../utils/Logger');
const { UserOrg } = db;
const User = db.user;

/**
 * @swagger
 * /api/organization/{organization}/users/{userId}:
 *   delete:
 *     summary: Remove user from organization
 *     description: Remove a user from an organization. Automatically reassigns primary organization if needed. (admin only)
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
 *         description: User ID to remove from organization
 *         example: 1
 *     responses:
 *       200:
 *         description: User removed from organization successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User john_user removed from organization"
 *                 userId:
 *                   type: integer
 *                 username:
 *                   type: string
 *       400:
 *         description: Cannot remove user from their only organization
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
const removeUserFromOrg = async (req, res) => {
  try {
    const { userId } = req.params;
    const { organizationId } = req; // Set by verifyOrgAccess middleware

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

    // Check if this is their primary organization
    if (membership.is_primary) {
      // Count other organizations
      const otherOrgs = await UserOrg.findAll({
        where: {
          user_id: userId,
          organization_id: { [db.Sequelize.Op.ne]: organizationId },
        },
      });

      if (otherOrgs.length === 0) {
        return res.status(400).send({
          message: req.__('organizations.cannotRemoveOnlyOrg'),
        });
      }

      // Set another organization as primary before removing
      await UserOrg.setPrimaryOrganization(userId, otherOrgs[0].organization_id);

      // Update user's denormalized primary_organization_id
      await User.update(
        { primary_organization_id: otherOrgs[0].organization_id },
        { where: { id: userId } }
      );
    }

    // Remove user from organization
    await membership.destroy();

    log.api.info('User removed from organization', {
      userId,
      organizationId,
      removedBy: req.userId,
      username: user.username,
    });

    return res.send({
      message: req.__('organizations.userRemoved', { username: user.username }),
      userId: user.id,
      username: user.username,
    });
  } catch (err) {
    log.error.error('Error removing user from organization:', {
      error: err.message,
      userId: req.params.userId,
      organizationId: req.organizationId,
      removedBy: req.userId,
    });
    return res.status(500).send({ message: req.__('organizations.removeUserError') });
  }
};

module.exports = { removeUserFromOrg };
