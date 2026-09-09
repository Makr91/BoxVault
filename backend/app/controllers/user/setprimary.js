import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
const { organization: Organization, user: User, UserOrg } = db;

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
 *                       enum: [member, admin, owner]
 *       400:
 *         description: User is not a member of this organization
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
const setPrimaryOrganization = async (req, res) => {
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

    // Verify user is a member of this organization
    const membership = await UserOrg.findUserOrgRole(userId, organization.id);
    if (!membership) {
      return problem(res, req, {
        status: 400,
        type: 'bad-request',
        title: req.__('organizations.userNotMember'),
      });
    }

    // Set as primary organization
    await UserOrg.setPrimaryOrganization(userId, organization.id);

    // Update user's primary_organization_id field (denormalized)
    await User.update({ primary_organization_id: organization.id }, { where: { id: userId } });

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
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('users.setPrimaryOrgError'),
    });
  }
};

export { setPrimaryOrganization };
