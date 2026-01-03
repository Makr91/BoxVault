const db = require('../../models');
const { log } = require('../../utils/Logger');
const { UserOrg } = db;
const User = db.user;

/**
 * Get user's role in specific organization (moderator+ only)
 */
const getUserOrgRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { organizationId } = req; // Set by verifyOrgAccess middleware

    // Find the user
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).send({ message: 'User not found!' });
    }

    // Get user's role in this organization
    const membership = await UserOrg.findUserOrgRole(userId, organizationId);
    if (!membership) {
      return res.status(404).send({
        message: 'User is not a member of this organization!',
      });
    }

    const response = {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: membership.role,
      isPrimary: membership.is_primary,
      joinedAt: membership.joined_at,
    };

    log.api.info('User organization role retrieved', {
      userId,
      organizationId,
      role: membership.role,
    });

    return res.send(response);
  } catch (err) {
    log.error.error('Error fetching user organization role:', {
      error: err.message,
      userId: req.params.userId,
      organizationId: req.organizationId,
    });
    return res.status(500).send({ message: 'Error fetching user role' });
  }
};

module.exports = { getUserOrgRole };
