// discover.js
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import db from '../../models/index.js';
import { resolveJwtUser } from '../../utils/jwtUser.js';
import { sumBoxDownloads } from './helpers.js';
const { box: Box, versions, providers, architectures, files, user, organization, Sequelize } = db;
const { Op } = Sequelize;

/**
 * @swagger
 * /api/discover:
 *   get:
 *     summary: Discover all boxes
 *     description: Retrieve all boxes available to the user. Authenticated users additionally see boxes of organizations they belong to, a service account those of its own organization at its effective role; anonymous requests get only published public boxes.
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
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const discoverAll = async (req, res) => {
  try {
    let where = { published: true, isPublic: true };

    const viewer = await resolveJwtUser(req);
    if (viewer) {
      where = {
        [Op.or]: [
          { published: true, isPublic: true },
          { published: true, organizationId: { [Op.in]: viewer.orgIds } },
          { organizationId: { [Op.in]: viewer.orgIds }, userId: viewer.userId },
        ],
      };
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
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('boxes.discover.error'),
    });
  }
};
