const db = require('../../models');
const { log } = require('../../utils/Logger');
const Organization = db.organization;

/**
 * Update organization access mode (admin only)
 */
const updateAccessMode = async (req, res) => {
  try {
    const { organization: organizationName } = req.params;
    const { accessMode, defaultRole } = req.body;

    // Validate access mode
    const validAccessModes = ['private', 'invite_only', 'request_to_join'];
    if (!validAccessModes.includes(accessMode)) {
      return res.status(400).send({
        message: 'Invalid access mode. Must be private, invite_only, or request_to_join.',
      });
    }

    // Validate default role
    const validRoles = ['user', 'moderator'];
    if (defaultRole && !validRoles.includes(defaultRole)) {
      return res.status(400).send({
        message: 'Invalid default role. Must be user or moderator.',
      });
    }

    // Find the organization
    const organization = await Organization.findOne({ where: { name: organizationName } });
    if (!organization) {
      return res.status(404).send({ message: 'Organization not found!' });
    }

    // Update access mode
    const updateData = { access_mode: accessMode };
    if (defaultRole) {
      updateData.default_role = defaultRole;
    }

    await organization.update(updateData);

    log.api.info('Organization access mode updated', {
      organizationName,
      organizationId: organization.id,
      accessMode,
      defaultRole: defaultRole || organization.default_role,
    });

    return res.send({
      message: 'Organization access mode updated successfully!',
      accessMode,
      defaultRole: defaultRole || organization.default_role,
    });
  } catch (err) {
    log.error.error('Error updating organization access mode:', {
      error: err.message,
      organizationName: req.params.organizationName,
    });
    return res.status(500).send({ message: 'Error updating organization access mode' });
  }
};

module.exports = { updateAccessMode };
