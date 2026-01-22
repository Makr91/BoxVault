// findone.js
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
const { organization: Organization, user: User, box: Box } = db;

/**
 * @swagger
 * /api/organization/{organizationName}:
 *   get:
 *     summary: Get a specific organization
 *     description: Retrieve detailed information about a specific organization including box counts
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationName
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *     responses:
 *       200:
 *         description: Organization details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Organization'
 *                 - type: object
 *                   properties:
 *                     totalBoxes:
 *                       type: integer
 *                       description: Total number of boxes accessible to the requesting user
 *       401:
 *         description: Unauthorized - invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
  const { userId } = req;

  try {
    const organization = await Organization.findOne({
      where: { name: organizationName },
      include: [
        {
          model: User,
          as: 'members',
          through: { attributes: [] },
          include: [
            {
              model: Box,
              as: 'box',
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
