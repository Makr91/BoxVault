import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
const { organization: Organization, Sequelize, UserOrg } = db;

const badRequest = (req, res, key) =>
  problem(res, req, { status: 400, type: 'bad-request', title: req.__(key) });

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
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Organization not found
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
const leaveOrganization = async (req, res) => {
  try {
    const { orgName } = req.params;
    const { userId } = req;

    // Find the organization
    const organization = await Organization.findOne({ where: { name: orgName } });
    if (!organization) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('organizations.organizationNotFound'),
      });
    }

    // Find user's membership
    const membership = await UserOrg.findUserOrgRole(userId, organization.id);
    if (!membership) {
      return badRequest(req, res, 'organizations.userNotMember');
    }

    // An organization must always keep at least one owner
    if (membership.role === 'owner') {
      const ownerCount = await UserOrg.count({
        where: { organization_id: organization.id, role: 'owner' },
      });

      if (ownerCount === 1) {
        return badRequest(req, res, 'organizations.cannotLeaveLastOwner');
      }
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
        return badRequest(req, res, 'organizations.cannotLeaveOnlyOrg');
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
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('organizations.leaveError'),
    });
  }
};

export { leaveOrganization };
