// findone.js
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import db from '../../models/index.js';
import { resolveJwtUser } from '../../utils/jwtUser.js';
const { organization: Organization, user: User, box: Box } = db;

const PUBLIC_FIELDS = [
  ['id', 'id'],
  ['name', 'name'],
  ['display_name', 'display_name'],
  ['description', 'description'],
  ['logo', 'logo'],
  ['emailHash', 'email_hash'],
];

/**
 * The organization as anyone may see it: the fields the box and ISO listings
 * already expose on every row.
 * @param {Object} organization - The organization row
 * @returns {Object} The public profile
 */
const publicProfile = organization =>
  Object.fromEntries(PUBLIC_FIELDS.map(([attribute, key]) => [key, organization[attribute]]));

/**
 * @swagger
 * /api/organization/{organizationName}:
 *   get:
 *     summary: Get a specific organization
 *     description: Retrieve an organization. A signed-in caller (x-access-token JWT or an external bearer token) gets the full organization with the box count visible to them; an anonymous caller gets the public profile only (id, name, display name, description, logo, email_hash).
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     parameters:
 *       - in: path
 *         name: organizationName
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *     responses:
 *       200:
 *         description: Organization details, or the public profile for an anonymous caller
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Organization'
 *                 - type: object
 *                   properties:
 *                     total_boxes:
 *                       type: integer
 *                       description: Total number of boxes accessible to the requesting user (signed-in callers only)
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
export const findOne = async (req, res) => {
  const { organization: organizationName } = req.params;

  try {
    const userId = req.userId || (await resolveJwtUser(req))?.userId || null;
    const organization = await Organization.findOne({
      where: { name: organizationName },
      include: [
        {
          model: User,
          as: 'members',
          attributes: ['id', 'username', 'emailHash', 'avatar_url'],
          through: { attributes: [] },
          include: [
            {
              model: Box,
              as: 'box',
              attributes: ['id', 'isPublic'],
            },
          ],
        },
      ],
    });

    if (!organization) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('organizations.organizationNotFoundWithName', {
          organization: organizationName,
        }),
      });
    }

    if (!userId) {
      return res.send(publicProfile(organization));
    }

    let totalBoxes = 0;
    if (organization.members && Array.isArray(organization.members)) {
      totalBoxes = organization.members.reduce((acc, user) => {
        if (user.box && Array.isArray(user.box)) {
          return (
            acc + user.box.filter(box => box.isPublic || (userId && user.id === userId)).length
          );
        }
        return acc;
      }, 0);
    }

    const organizationJson = organization.toJSON();
    if (Array.isArray(organizationJson.members)) {
      organizationJson.members = organizationJson.members.map(member => {
        const rest = { ...member };
        delete rest.box;
        return rest;
      });
    }

    return res.send({ ...organizationJson, total_boxes: totalBoxes });
  } catch (err) {
    log.error.error('Error in findOne:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('organizations.findOneError', { organization: organizationName }),
    });
  }
};
