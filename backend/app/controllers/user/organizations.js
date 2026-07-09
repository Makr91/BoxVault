import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
const { UserOrg, service_account: ServiceAccount, organization: Organization } = db;

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
 *                     enum: [user, moderator, admin]
 *                     description: User's role in this organization
 *                   isPrimary:
 *                     type: boolean
 *                     description: Whether this is the user's primary organization
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
            accessMode: org.access_mode,
          },
          role: 'user',
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

    const userOrganizations = await UserOrg.getUserOrganizations(userId);

    // Format response for frontend
    const organizations = userOrganizations.map(userOrg => ({
      organization: {
        id: userOrg.organization.id,
        name: userOrg.organization.name,
        description: userOrg.organization.description,
        emailHash: userOrg.organization.emailHash,
        accessMode: userOrg.organization.access_mode,
      },
      role: userOrg.role,
      isPrimary: userOrg.is_primary,
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
