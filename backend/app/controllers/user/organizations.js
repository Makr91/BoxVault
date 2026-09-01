import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
const {
  UserOrg,
  service_account: ServiceAccount,
  organization: Organization,
  user: User,
  scimGroup: ScimGroup,
} = db;

/**
 * Org UUIDs the auth server marks as personal, among the given mirrored orgs.
 * @param {string[]} orgUuids - external_org_id values (nulls filtered)
 * @returns {Promise<Set<string>>}
 */
const findPersonalOrgUuids = async orgUuids => {
  if (orgUuids.length === 0) {
    return new Set();
  }
  const rows = await ScimGroup.findAll({
    where: { org_uuid: orgUuids, personal: true },
    attributes: ['org_uuid'],
  });
  return new Set(rows.map(row => row.org_uuid));
};

/**
 * @swagger
 * /api/user/organizations:
 *   get:
 *     summary: Get user's organizations
 *     description: Retrieve all organizations the authenticated user belongs to, including their roles in each
 *     tags: [Users]
 *     security:
 *       - JwtAuth: []
 *     responses:
 *       200:
 *         description: List of user's organizations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     description: Organization ID
 *                   name:
 *                     type: string
 *                     description: Organization name
 *                   description:
 *                     type: string
 *                     description: Organization description
 *                   emailHash:
 *                     type: string
 *                     description: Email hash for Gravatar
 *                   role:
 *                     type: string
 *                     enum: [member, admin, owner]
 *                     description: User's role in this organization
 *                   isPrimary:
 *                     type: boolean
 *                     description: Whether this is the user's primary organization
 *                   personal:
 *                     type: boolean
 *                     description: Whether the identity provider marks this organization as a personal org
 *                   joinedAt:
 *                     type: string
 *                     format: date-time
 *                     description: When user joined this organization
 *                   accessMode:
 *                     type: string
 *                     enum: [private, invite_only, request_to_join]
 *                     description: Organization access mode
 *       401:
 *         description: Authentication required
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
const getUserOrganizations = async (req, res) => {
  try {
    const { userId } = req;

    // A service account belongs to exactly one organization
    if (req.isServiceAccount) {
      const serviceAccount = await ServiceAccount.findByPk(req.serviceAccountId, {
        include: [{ model: Organization, as: 'organization' }],
      });

      if (!serviceAccount || !serviceAccount.organization) {
        return res.send([]);
      }

      const org = serviceAccount.organization;
      const organizations = [
        {
          organization: {
            id: org.id,
            name: org.name,
            description: org.description,
            emailHash: org.emailHash,
            logo: org.logo,
            display_name: org.display_name,
            url: org.url,
            accessMode: org.access_mode,
          },
          role: 'member',
          isPrimary: true,
          joinedAt: serviceAccount.createdAt,
        },
      ];

      log.api.info('Service account organization retrieved', {
        userId,
        serviceAccountId: serviceAccount.id,
        organizationCount: organizations.length,
      });

      return res.send(organizations);
    }

    // The "Primary" badge reflects the ONE overall pointer on the user row,
    // not the per-membership is_primary flags.
    const [userOrganizations, userRow] = await Promise.all([
      UserOrg.getUserOrganizations(userId),
      User.findByPk(userId, { attributes: ['primary_organization_id'] }),
    ]);
    const primaryOrganizationId = userRow?.primary_organization_id ?? null;
    const personalOrgUuids = await findPersonalOrgUuids(
      userOrganizations.map(userOrg => userOrg.organization.external_org_id).filter(Boolean)
    );

    // Format response for frontend
    const organizations = userOrganizations.map(userOrg => ({
      organization: {
        id: userOrg.organization.id,
        name: userOrg.organization.name,
        description: userOrg.organization.description,
        emailHash: userOrg.organization.emailHash,
        logo: userOrg.organization.logo,
        display_name: userOrg.organization.display_name,
        url: userOrg.organization.url,
        accessMode: userOrg.organization.access_mode,
      },
      role: userOrg.role,
      isPrimary: userOrg.organization.id === primaryOrganizationId,
      personal: personalOrgUuids.has(userOrg.organization.external_org_id),
      joinedAt: userOrg.joined_at,
    }));

    log.api.info('User organizations retrieved', {
      userId,
      organizationCount: organizations.length,
    });

    return res.send(organizations);
  } catch (err) {
    log.error.error('Error fetching user organizations:', {
      error: err.message,
      userId: req.userId,
    });
    return res.status(500).send({ message: req.__('users.fetchOrgsError') });
  }
};

export { getUserOrganizations };
