// discover.js
import db from '../../models/index.js';
import {
  extractBearerToken,
  findServiceAccountByRawToken,
} from '../../utils/serviceAccountAuth.js';
const { box: Box, versions, providers, architectures, files, user, organization, Sequelize } = db;
const { Op } = Sequelize;

/**
 * @swagger
 * /api/discover:
 *   get:
 *     summary: Discover all boxes
 *     description: Retrieve all boxes available to the user. If authenticated, returns all boxes; if not authenticated, returns only public boxes.
 *     tags: [Boxes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of discoverable boxes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/BoxWithDetails'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const discoverAll = async (req, res) => {
  try {
    // Raw service-account API key (Authorization: Bearer or x-access-token).
    // JWTs never match a service_account token, so all JWT/anonymous requests
    // keep the public-only filter below — the home page stays public-only.
    const rawToken = extractBearerToken(req) || req.headers['x-access-token'];
    const serviceAccount = await findServiceAccountByRawToken(rawToken);

    // Home page only shows published AND public boxes (for everyone).
    // A service-account key additionally sees its own organization's boxes:
    // published ones, plus unpublished ones it owns (same rule as the
    // organization box details endpoint).
    const where = serviceAccount
      ? {
          [Op.or]: [
            { published: true, isPublic: true },
            { published: true, organizationId: serviceAccount.organization_id },
            { organizationId: serviceAccount.organization_id, userId: serviceAccount.userId },
          ],
        }
      : { published: true, isPublic: true };

    const boxes = await Box.findAll({
      where,
      include: [
        {
          model: versions,
          as: 'versions',
          include: [
            {
              model: providers,
              as: 'providers',
              include: [
                {
                  model: architectures,
                  as: 'architectures',
                  include: [
                    {
                      model: files,
                      as: 'files',
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          model: user,
          as: 'user',
          include: [
            {
              model: organization,
              as: 'primaryOrganization',
              attributes: ['id', 'name', 'emailHash'],
            },
          ],
        },
      ],
    });

    // Ensure the emailHash is included in the response
    const restructuredBoxes = boxes.map(box => {
      const boxJson = box.toJSON();
      if (boxJson.user && boxJson.user.primaryOrganization) {
        boxJson.user.primaryOrganization.emailHash =
          boxJson.user.primaryOrganization.emailHash || null;
      }
      return boxJson;
    });

    return res.send(restructuredBoxes);
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('boxes.discover.error'),
    });
  }
};
