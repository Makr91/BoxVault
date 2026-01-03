// findone.js
const { loadConfig } = require('../../utils/config-loader');
const { log } = require('../../utils/Logger');
const jwt = require('jsonwebtoken');
const db = require('../../models');

const Organization = db.organization;
const User = db.user;
const Box = db.box;

let authConfig;
try {
  authConfig = loadConfig('auth');
} catch (e) {
  log.error.error(`Failed to load auth configuration: ${e.message}`);
}

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
exports.findOne = async (req, res) => {
  const { organization: organizationName } = req.params;
  const token = req.headers['x-access-token'];
  let userId = null;

  if (token) {
    try {
      // Verify the token and extract the user ID
      const decoded = jwt.verify(token, authConfig.auth.jwt.jwt_secret.value);
      userId = decoded.id;
    } catch {
      return res.status(401).send({ message: req.__('auth.unauthorized') });
    }
  }

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

    log.app.info('Organization found:', JSON.stringify(organization, null, 2));

    if (!organization) {
      return res.status(404).send({
        message: req.__('organizations.organizationNotFoundWithName', {
          organization: organizationName,
        }),
      });
    }

    log.app.info('Org Detected!');

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

    log.app.info('Total Boxes calculated:', totalBoxes);

    return res.send({ ...organization.toJSON(), totalBoxes });
  } catch (err) {
    log.error.error('Error in findOne:', err);
    return res.status(500).send({
      message: req.__('organizations.findOneError', { organization: organizationName }),
    });
  }
};
