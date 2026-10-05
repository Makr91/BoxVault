import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import { serviceAccountMembership } from '../../utils/orgMembership.js';
const { UserOrg, service_account: ServiceAccount, organization: Organization, user: User } = db;

/**
 * The organization object of one row of this answer.
 * @param {Object} org - The organizations row or its raw columns
 * @returns {Object} The organization as answered
 */
const organizationOf = org => ({
  id: org.id,
  uuid: org.uuid,
  name: org.name,
  description: org.description,
  email_hash: org.emailHash,
  logo: org.logo,
  display_name: org.display_name,
  url: org.url,
  access_mode: org.access_mode,
});

/**
 * @swagger
 * /api/user/organizations:
 *   get:
 *     summary: Get user's organizations
 *     description: Retrieve all organizations the authenticated user belongs to, including their roles in each. A service account answers its single organization at its effective role, the lower of its stored role and its creator's current role there (owner for a live superadmin account), and an empty list once its creator no longer belongs there.
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
 *                   organization:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         description: Organization ID
 *                       uuid:
 *                         type: string
 *                         description: The organization's immutable uuid
 *                       name:
 *                         type: string
 *                         description: Organization name, the URL segment
 *                       description:
 *                         type: string
 *                         description: Organization description
 *                       email_hash:
 *                         type: string
 *                         description: Email hash for Gravatar
 *                       logo:
 *                         type: string
 *                         nullable: true
 *                         description: Organization logo URL
 *                       display_name:
 *                         type: string
 *                         nullable: true
 *                         description: Human-readable organization name
 *                       url:
 *                         type: string
 *                         nullable: true
 *                         description: Organization website URL
 *                       access_mode:
 *                         type: string
 *                         enum: [private, invite, request]
 *                         description: Organization access mode
 *                   role:
 *                     type: string
 *                     enum: [guest, member, admin, owner]
 *                     description: User's role in this organization
 *                   is_primary:
 *                     type: boolean
 *                     description: Whether this is the user's primary organization
 *                   personal:
 *                     type: boolean
 *                     description: Whether the identity provider marks this organization as a personal org
 *                   joined_at:
 *                     type: string
 *                     format: date-time
 *                     description: When user joined this organization
 *       401:
 *         description: Authentication required
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
const getUserOrganizations = async (req, res) => {
  try {
    const { userId } = req;

    // A service account belongs to exactly one organization
    if (req.isServiceAccount) {
      const serviceAccount = await ServiceAccount.findByPk(req.serviceAccountId, {
        include: [{ model: Organization, as: 'organization' }],
      });

      if (!serviceAccount) {
        return res.send([]);
      }

      const membership = await serviceAccountMembership(serviceAccount);
      if (!membership) {
        return res.send([]);
      }

      const org = serviceAccount.organization;
      const organizations = [
        {
          organization: organizationOf(org),
          role: membership.role,
          is_primary: true,
          personal: Boolean(org.personal),
          joined_at: serviceAccount.createdAt,
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

    // Format response for frontend
    const organizations = userOrganizations.map(userOrg => ({
      organization: organizationOf(userOrg.organization),
      role: userOrg.role,
      is_primary: userOrg.organization.id === primaryOrganizationId,
      personal: Boolean(userOrg.organization.personal),
      joined_at: userOrg.joined_at,
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
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('users.fetchOrgsError'),
    });
  }
};

export { getUserOrganizations };
