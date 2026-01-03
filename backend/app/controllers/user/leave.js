const db = require('../../models');
const { log } = require('../../utils/Logger');
const { UserOrg } = db;
const Organization = db.organization;

/**
 * Leave an organization (user removes themselves)
 */
const leaveOrganization = async (req, res) => {
  try {
    const { orgName } = req.params;
    const { userId } = req;

    // Find the organization
    const organization = await Organization.findOne({ where: { name: orgName } });
    if (!organization) {
      return res.status(404).send({ message: 'Organization not found!' });
    }

    // Find user's membership
    const membership = await UserOrg.findUserOrgRole(userId, organization.id);
    if (!membership) {
      return res.status(400).send({
        message: 'You are not a member of this organization!',
      });
    }

    // Check if this is their primary organization
    if (membership.is_primary) {
      // Count other organizations
      const otherOrgs = await UserOrg.findAll({
        where: {
          user_id: userId,
          organization_id: { [db.Sequelize.Op.ne]: organization.id },
        },
      });

      if (otherOrgs.length === 0) {
        return res.status(400).send({
          message:
            'Cannot leave your only organization! You must belong to at least one organization.',
        });
      }

      // Set another organization as primary before leaving
      await UserOrg.setPrimaryOrganization(userId, otherOrgs[0].organization_id);
    }

    // Remove user from organization
    await membership.destroy();

    log.api.info('User left organization', {
      userId,
      organizationName: orgName,
      organizationId: organization.id,
    });

    return res.send({
      message: `Successfully left organization ${orgName}`,
    });
  } catch (err) {
    log.error.error('Error leaving organization:', {
      error: err.message,
      userId: req.userId,
      organization: req.params.orgName,
    });
    return res.status(500).send({ message: 'Error leaving organization' });
  }
};

module.exports = { leaveOrganization };
