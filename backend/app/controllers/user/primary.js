import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
const { UserOrg } = db;

/**
 * @swagger
 * /api/user/primary-organization:
 *   get:
 *     summary: Get user's primary organization
 *     description: Retrieve the authenticated user's primary/default organization
 *     tags: [Users]
 *     security:
 *       - JwtAuth: []
 *     responses:
 *       200:
 *         description: Primary organization retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   description: Organization ID
 *                 name:
 *                   type: string
 *                   description: Organization name
 *                 description:
 *                   type: string
 *                   description: Organization description
 *                 role:
 *                   type: string
 *                   enum: [user, moderator, admin]
 *                   description: User's role in this organization
 *                 joinedAt:
 *                   type: string
 *                   format: date-time
 *                   description: When user joined this organization
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: No primary organization found
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
const getPrimaryOrganization = async (req, res) => {
  try {
    const { userId } = req;

    const primaryOrg = await UserOrg.getPrimaryOrganization(userId);

    if (!primaryOrg) {
      return res.status(404).send({
        message: req.__('users.noPrimaryOrg'),
      });
    }

    const response = {
      organization: {
        id: primaryOrg.organization.id,
        name: primaryOrg.organization.name,
        description: primaryOrg.organization.description,
      },
      role: primaryOrg.role,
      joinedAt: primaryOrg.joined_at,
    };

    log.api.info('Primary organization retrieved', {
      userId,
      organizationName: response.name,
    });

    return res.send(response);
  } catch (err) {
    log.error.error('Error fetching primary organization:', {
      error: err.message,
      userId: req.userId,
    });
    return res.status(500).send({ message: req.__('users.fetchPrimaryOrgError') });
  }
};

export { getPrimaryOrganization };
