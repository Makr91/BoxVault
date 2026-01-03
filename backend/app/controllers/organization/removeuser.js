const db = require('../../models');
const { log } = require('../../utils/Logger');
const { UserOrg } = db;
const User = db.user;

/**
 * Remove user from organization (admin only)
 */
const removeUserFromOrg = async (req, res) => {
  try {
    const { userId } = req.params;
    const { organizationId } = req; // Set by verifyOrgAccess middleware

    // Find the user
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).send({ message: 'User not found!' });
    }

    // Find user's membership in this organization
    const membership = await UserOrg.findUserOrgRole(userId, organizationId);
    if (!membership) {
      return res.status(404).send({
        message: 'User is not a member of this organization!',
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
          message:
            'Cannot remove user from their only organization! User must belong to at least one organization.',
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
      message: `User ${user.username} removed from organization`,
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
    return res.status(500).send({ message: 'Error removing user from organization' });
  }
};

module.exports = { removeUserFromOrg };
