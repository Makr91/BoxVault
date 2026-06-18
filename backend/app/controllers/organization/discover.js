import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
const { organization: Organization, user: User, role: Role } = db;

/**
 * @swagger
 * /api/organizations/discover:
 *   get:
 *     summary: Discover public organizations
 *     description: Retrieve organizations that are discoverable (have access_mode of 'invite_only' or 'request_to_join'). Admins see all organizations.
 *     tags: [Organizations]
 *     parameters:
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: Optional JWT token (admins see all orgs, others see only discoverable)
 *     responses:
 *       200:
 *         description: List of discoverable organizations
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
 *                   accessMode:
 *                     type: string
 *                     enum: [private, invite_only, request_to_join]
 *                     description: Organization access mode
 *                   emailHash:
 *                     type: string
 *                     description: Email hash for Gravatar
 *                   memberCount:
 *                     type: integer
 *                     description: Number of members in organization
 *                   publicBoxCount:
 *                     type: integer
 *                     description: Number of public boxes
 *                   totalBoxCount:
 *                     type: integer
 *                     description: Total number of boxes
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
const discoverOrganizations = async (req, res) => {
  try {
    // Check if user is authenticated and is admin
    let isAdmin = false;
    if (req.userId) {
      const user = await User.findByPk(req.userId, {
        include: [{ model: Role, as: 'roles', through: { attributes: [] } }],
      });
      isAdmin = user?.roles?.some(role => role.name === 'admin');
    }

    const organizations = await Organization.getDiscoverable(isAdmin);

    // Format response for frontend (counts already calculated in getDiscoverable)
    const formattedOrgs = organizations.map(org => ({
      id: org.id,
      name: org.name,
      description: org.description,
      accessMode: org.access_mode,
      emailHash: org.emailHash || '',
      memberCount: org.memberCount || 0,
      publicBoxCount: org.publicBoxCount || 0,
      totalBoxCount: org.totalBoxCount || 0,
    }));

    log.api.info('Discoverable organizations retrieved', {
      count: formattedOrgs.length,
    });

    return res.send(formattedOrgs);
  } catch (err) {
    log.error.error('Error fetching discoverable organizations:', {
      error: err.message,
      stack: err.stack,
    });
    return res.status(500).send({ message: req.__('organizations.discoverError') });
  }
};

export { discoverOrganizations };
