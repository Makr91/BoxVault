import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import db from '../../models/index.js';
const { organization: Organization, user: User, role: Role } = db;

/**
 * @swagger
 * /api/organizations/discover:
 *   get:
 *     summary: Discover public organizations
 *     description: Retrieve organizations that are discoverable (have access_mode of 'invite' or 'request'). Admins see all organizations.
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
 *                   access_mode:
 *                     type: string
 *                     enum: [private, invite, request]
 *                     description: Organization access mode
 *                   email_hash:
 *                     type: string
 *                     description: Email hash for Gravatar
 *                   member_count:
 *                     type: integer
 *                     description: Number of members in organization
 *                   public_box_count:
 *                     type: integer
 *                     description: Number of public boxes
 *                   total_box_count:
 *                     type: integer
 *                     description: Total number of boxes
 *       500:
 *         description: Internal server error
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
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
      access_mode: org.access_mode,
      email_hash: org.emailHash || '',
      member_count: org.memberCount || 0,
      public_box_count: org.publicBoxCount || 0,
      total_box_count: org.totalBoxCount || 0,
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
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('organizations.discoverError'),
    });
  }
};

export { discoverOrganizations };
