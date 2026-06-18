import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
const { organization: Organization, Sequelize, UserOrg } = db;

/**
 * @swagger
 * /api/user/leave/{orgName}:
 *   post:
 *     summary: Leave an organization
 *     description: Remove yourself from an organization. Cannot leave if it's your only organization.
 *     tags: [Users]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: orgName
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name to leave
 *         example: acme-corp
 *     responses:
 *       200:
 *         description: Successfully left organization
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Successfully left organization acme-corp"
 *       400:
 *         description: Cannot leave - not a member or only organization
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
const leaveOrganization = async (req, res) => {
  try {
    const { orgName } = req.params;
    const { userId } = req;

    // Find the organization
    const organization = await Organization.findOne({ where: { name: orgName } });
    if (!organization) {
      return res.status(404).send({ message: req.__('organizations.organizationNotFound') });
    }

    // Find user's membership
    const membership = await UserOrg.findUserOrgRole(userId, organization.id);
    if (!membership) {
      return res.status(400).send({
        message: req.__('organizations.userNotMember'),
      });
    }

    // Check if this is their primary organization
    if (membership.is_primary) {
      // Count other organizations
      const otherOrgs = await UserOrg.findAll({
        where: {
          user_id: userId,
          organization_id: { [Sequelize.Op.ne]: organization.id },
        },
      });

      if (otherOrgs.length === 0) {
        return res.status(400).send({
          message: req.__('organizations.cannotLeaveOnlyOrg'),
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
      message: req.__('organizations.leftOrganization', { orgName }),
    });
  } catch (err) {
    log.error.error('Error leaving organization:', {
      error: err.message,
      userId: req.userId,
      organization: req.params.orgName,
    });
    return res.status(500).send({ message: req.__('organizations.leaveError') });
  }
};

export { leaveOrganization };
