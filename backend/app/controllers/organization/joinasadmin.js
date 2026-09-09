import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
const { organization: Organization, UserOrg } = db;

/**
 * @swagger
 * /api/organization/{organization}/join:
 *   post:
 *     summary: Join an organization as admin (global admin only)
 *     description: Adds the requesting global admin to the organization with the owner role. Lets a platform maintainer gain org-scoped access on demand, via a real membership row rather than a content bypass.
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *     responses:
 *       200:
 *         description: Joined the organization as admin
 *       400:
 *         description: Already a member of this organization
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
export const joinAsAdmin = async (req, res) => {
  try {
    const { organization: organizationName } = req.params;
    const { userId } = req;

    const organization = await Organization.findOne({ where: { name: organizationName } });
    if (!organization) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('organizations.organizationNotFound'),
      });
    }

    const existing = await UserOrg.findUserOrgRole(userId, organization.id);
    if (existing) {
      return problem(res, req, {
        status: 400,
        type: 'bad-request',
        title: req.__('organizations.alreadyMember'),
      });
    }

    await UserOrg.create({
      user_id: userId,
      organization_id: organization.id,
      role: 'owner',
      is_primary: false,
    });

    log.api.info('Global admin joined organization as owner', {
      userId,
      organizationId: organization.id,
    });

    return res.send({
      message: req.__('organizations.joinedAsAdmin', { organization: organizationName }),
    });
  } catch (err) {
    log.error.error('Error joining organization as admin:', {
      error: err.message,
      userId: req.userId,
      organization: req.params.organization,
    });
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('organizations.joinError'),
    });
  }
};
