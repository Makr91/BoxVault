const db = require('../../models');
const { log } = require('../../utils/Logger');
const Organization = db.organization;

/**
 * Get discoverable organizations (public directory)
 * Shows organizations that allow discovery with public boxes
 */
const discoverOrganizations = async (req, res) => {
  try {
    // Check if user is authenticated and is admin
    let isAdmin = false;
    if (req.userId) {
      const user = await db.user.findByPk(req.userId, {
        include: [{ model: db.role, as: 'roles', through: { attributes: [] } }],
      });
      isAdmin = user?.roles?.some(role => role.name === 'admin');
    }

    const organizations = await Organization.getDiscoverable(isAdmin);

    // Format response for frontend (counts already calculated in getDiscoverable)
    const formattedOrgs = organizations.map(org => ({
      id: org.id,
      name: org.name,
      description: org.description,
      accessMode: org.access_mode,
      emailHash: org.emailHash || '',
      memberCount: org.memberCount || 0,
      publicBoxCount: org.publicBoxCount || 0,
      totalBoxCount: org.totalBoxCount || 0,
    }));

    log.api.info('Discoverable organizations retrieved', {
      count: formattedOrgs.length,
    });

    return res.send(formattedOrgs);
  } catch (err) {
    log.error.error('Error fetching discoverable organizations:', {
      error: err.message,
      stack: err.stack,
    });
    return res.status(500).send({ message: 'Error fetching discoverable organizations' });
  }
};

module.exports = { discoverOrganizations };
