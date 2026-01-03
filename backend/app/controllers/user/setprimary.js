const db = require('../../models');
const { log } = require('../../utils/Logger');
const { UserOrg } = db;
const Organization = db.organization;

/**
 * Set user's primary organization
 */
const setPrimaryOrganization = async (req, res) => {
  try {
    const { orgName } = req.params;
    const { userId } = req;

    // Find the organization
    const organization = await Organization.findOne({ where: { name: orgName } });
    if (!organization) {
      return res.status(404).send({ message: 'Organization not found!' });
    }

    // Verify user is a member of this organization
    const membership = await UserOrg.findUserOrgRole(userId, organization.id);
    if (!membership) {
      return res.status(400).send({
        message: 'You are not a member of this organization!',
      });
    }

    // Set as primary organization
    await UserOrg.setPrimaryOrganization(userId, organization.id);

    // Update user's primary_organization_id field (denormalized)
    await db.user.update({ primary_organization_id: organization.id }, { where: { id: userId } });

    log.api.info('Primary organization updated', {
      userId,
      organizationName: orgName,
      organizationId: organization.id,
    });

    return res.send({
      message: `Primary organization set to ${orgName}`,
      primaryOrganization: {
        id: organization.id,
        name: organization.name,
        role: membership.role,
      },
    });
  } catch (err) {
    log.error.error('Error setting primary organization:', {
      error: err.message,
      userId: req.userId,
      organization: req.params.orgName,
    });
    return res.status(500).send({ message: 'Error setting primary organization' });
  }
};

module.exports = { setPrimaryOrganization };
