const db = require('../../models');
const { log } = require('../../utils/Logger');
const { UserOrg } = db;
const User = db.user;

/**
 * Update user's role in organization (admin only)
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
        message: 'Invalid role. Must be user, moderator, or admin.',
      });
    }

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
      message: `User role updated to ${role}`,
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
    return res.status(500).send({ message: 'Error updating user role' });
  }
};

module.exports = { updateUserOrgRole };
