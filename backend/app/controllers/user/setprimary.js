const db = require('../../models');
const { log } = require('../../utils/Logger');
const { UserOrg } = db;
const Organization = db.organization;

/**
 * @swagger
 * /api/user/primary-organization/{orgName}:
 *   put:
 *     summary: Set primary organization
 *     description: Set a specific organization as the user's primary/default organization
 *     tags: [Users]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: orgName
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name to set as primary
 *         example: acme-corp
 *     responses:
 *       200:
 *         description: Primary organization set successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Primary organization set to acme-corp"
 *                 primaryOrganization:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     name:
 *                       type: string
 *                     role:
 *                       type: string
 *                       enum: [user, moderator, admin]
 *       400:
 *         description: User is not a member of this organization
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
 *       404:
 *         description: Organization not found
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
const setPrimaryOrganization = async (req, res) => {
  try {
    const { orgName } = req.params;
    const { userId } = req;

    // Find the organization
    const organization = await Organization.findOne({ where: { name: orgName } });
    if (!organization) {
      return res.status(404).send({ message: req.__('organizations.organizationNotFound') });
    }

    // Verify user is a member of this organization
    const membership = await UserOrg.findUserOrgRole(userId, organization.id);
    if (!membership) {
      return res.status(400).send({
        message: req.__('organizations.userNotMember'),
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
      message: req.__('users.primaryOrgSet', { orgName }),
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
    return res.status(500).send({ message: req.__('users.setPrimaryOrgError') });
  }
};

module.exports = { setPrimaryOrganization };
