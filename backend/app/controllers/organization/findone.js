// findone.js
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
import { resolveJwtUser } from '../../utils/jwtUser.js';
const { organization: Organization, user: User, box: Box } = db;

const PUBLIC_FIELDS = ['id', 'name', 'display_name', 'description', 'logo', 'emailHash'];

/**
 * The organization as anyone may see it: the fields the box and ISO listings
 * already expose on every row.
 * @param {Object} organization - The organization row
 * @returns {Object} The public profile
 */
const publicProfile = organization =>
  Object.fromEntries(PUBLIC_FIELDS.map(field => [field, organization[field]]));

/**
 * @swagger
 * /api/organization/{organizationName}:
 *   get:
 *     summary: Get a specific organization
 *     description: Retrieve an organization. A signed-in caller (x-access-token JWT or an external bearer token) gets the full organization with the box count visible to them; an anonymous caller gets the public profile only (id, name, display name, description, logo, emailHash).
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
 *                     totalBoxes:
 *                       type: integer
 *                       description: Total number of boxes accessible to the requesting user (signed-in callers only)
 *       404:
 *         description: Organization not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
      return res.status(404).send({
        message: req.__('organizations.organizationNotFoundWithName', {
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

    return res.send({ ...organization.toJSON(), totalBoxes });
  } catch (err) {
    log.error.error('Error in findOne:', err);
    return res.status(500).send({
      message: req.__('organizations.findOneError', { organization: organizationName }),
    });
  }
};
