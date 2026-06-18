import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
const { organization: Organization, UserOrg } = db;

/**
 * @swagger
 * /api/organization/{organization}/join:
 *   post:
 *     summary: Join an organization as admin (global admin only)
 *     description: Adds the requesting global admin to the organization with the admin role. Lets a platform maintainer gain org-scoped access on demand, via a real membership row rather than a content bypass.
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
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Internal server error
 */
export const joinAsAdmin = async (req, res) => {
  try {
    const { organization: organizationName } = req.params;
    const { userId } = req;

    const organization = await Organization.findOne({ where: { name: organizationName } });
    if (!organization) {
      return res.status(404).send({ message: req.__('organizations.organizationNotFound') });
    }

    const existing = await UserOrg.findUserOrgRole(userId, organization.id);
    if (existing) {
      return res.status(400).send({ message: req.__('organizations.alreadyMember') });
    }

    await UserOrg.create({
      user_id: userId,
      organization_id: organization.id,
      role: 'admin',
      is_primary: false,
    });

    log.api.info('Global admin joined organization as admin', {
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
    return res.status(500).send({ message: req.__('organizations.joinError') });
  }
};
