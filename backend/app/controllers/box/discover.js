// discover.js
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
import { resolveJwtUser } from '../../utils/jwtUser.js';
import {
  extractBearerToken,
  findServiceAccountByRawToken,
} from '../../utils/serviceAccountAuth.js';
import { sumBoxDownloads } from './helpers.js';
const { box: Box, versions, providers, architectures, files, user, organization, Sequelize } = db;
const { Op } = Sequelize;

/**
 * @swagger
 * /api/discover:
 *   get:
 *     summary: Discover all boxes
 *     description: Retrieve all boxes available to the user. Authenticated users additionally see boxes of organizations they belong to; anonymous requests get only published public boxes.
 *     tags: [Boxes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: Optional JWT token (or raw service-account key) for member visibility
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
    // JWTs never match a service_account token; those are resolved below.
    const rawToken = extractBearerToken(req) || req.headers['x-access-token'];
    const serviceAccount = await findServiceAccountByRawToken(rawToken);

    // Anonymous home page only shows published AND public boxes.
    // A service-account key additionally sees its own organization's boxes:
    // published ones, plus unpublished ones it owns (same rule as the
    // organization box details endpoint).
    // A signed-in user (valid JWT) additionally sees, for every organization
    // they are a member of: published boxes, plus unpublished ones they own.
    let where = { published: true, isPublic: true };

    if (serviceAccount) {
      where = {
        [Op.or]: [
          { published: true, isPublic: true },
          { published: true, organizationId: serviceAccount.organization_id },
          { organizationId: serviceAccount.organization_id, userId: serviceAccount.userId },
        ],
      };
    } else {
      const jwtUser = await resolveJwtUser(req);
      if (jwtUser) {
        where = {
          [Op.or]: [
            { published: true, isPublic: true },
            { published: true, organizationId: { [Op.in]: jwtUser.orgIds } },
            { organizationId: { [Op.in]: jwtUser.orgIds }, userId: jwtUser.userId },
          ],
        };
      }
    }

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
          attributes: ['id', 'username', 'emailHash'],
        },
        {
          // The box's OWN organization — never the owner's primary org, which
          // can differ and would mislabel the row.
          model: organization,
          as: 'organization',
          attributes: ['id', 'name', 'emailHash', 'logo'],
        },
      ],
    });

    return res.send(boxes.map(box => ({ ...box.toJSON(), downloadCount: sumBoxDownloads(box) })));
  } catch (err) {
    log.error.error('Error discovering boxes:', err);
    return res.status(500).send({
      message: req.__('boxes.discover.error'),
    });
  }
};
