const db = require('../../models');
const { log } = require('../../utils/Logger');
const { UserOrg } = db;

/**
 * Get all organizations user belongs to with their roles
 */
const getUserOrganizations = async (req, res) => {
  try {
    const { userId } = req;

    const userOrganizations = await UserOrg.getUserOrganizations(userId);

    // Format response for frontend
    const organizations = userOrganizations.map(userOrg => ({
      id: userOrg.organization.id,
      name: userOrg.organization.name,
      description: userOrg.organization.description,
      emailHash: userOrg.organization.emailHash,
      role: userOrg.role,
      isPrimary: userOrg.is_primary,
      joinedAt: userOrg.joined_at,
      accessMode: userOrg.organization.access_mode,
    }));

    log.api.info('User organizations retrieved', {
      userId,
      organizationCount: organizations.length,
    });

    return res.send(organizations);
  } catch (err) {
    log.error.error('Error fetching user organizations:', {
      error: err.message,
      userId: req.userId,
    });
    return res.status(500).send({ message: 'Error fetching your organizations' });
  }
};

module.exports = { getUserOrganizations };
