const db = require('../../models');
const { log } = require('../../utils/Logger');
const { UserOrg } = db;

/**
 * Get user's primary organization
 */
const getPrimaryOrganization = async (req, res) => {
  try {
    const { userId } = req;

    const primaryOrg = await UserOrg.getPrimaryOrganization(userId);

    if (!primaryOrg) {
      return res.status(404).send({
        message: 'No primary organization found. Please contact support.',
      });
    }

    const response = {
      id: primaryOrg.organization.id,
      name: primaryOrg.organization.name,
      description: primaryOrg.organization.description,
      role: primaryOrg.role,
      joinedAt: primaryOrg.joined_at,
    };

    log.api.info('Primary organization retrieved', {
      userId,
      organizationName: response.name,
    });

    return res.send(response);
  } catch (err) {
    log.error.error('Error fetching primary organization:', {
      error: err.message,
      userId: req.userId,
    });
    return res.status(500).send({ message: 'Error fetching primary organization' });
  }
};

module.exports = { getPrimaryOrganization };
