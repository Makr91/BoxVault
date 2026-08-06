// discover.js
import configLoader from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import jwt from 'jsonwebtoken';
import db from '../../models/index.js';
import {
  extractBearerToken,
  findServiceAccountByRawToken,
} from '../../utils/serviceAccountAuth.js';
const {
  box: Box,
  versions,
  providers,
  architectures,
  files,
  user,
  organization,
  UserOrg,
  Sequelize,
} = db;
const { Op } = Sequelize;
const { verify } = jwt;

// Resolve a signed-in BoxVault user from an x-access-token JWT.
// Returns { userId, orgIds } for a valid token (orgIds = organizations the
// user is a member of), or null for a missing/invalid token — an invalid
// token never errors, it only falls back to the anonymous public-only view.
const resolveJwtUser = async req => {
  const token = req.headers['x-access-token'];
  if (!token) {
    return null;
  }

  let authConfig;
  try {
    authConfig = configLoader.loadConfig('auth');
  } catch (e) {
    log.error.error(`Failed to load auth configuration: ${e.message}`);
    return null;
  }

  try {
    const decoded = verify(token, authConfig.auth.jwt.jwt_secret.value);
    const memberships = await UserOrg.getUserOrganizations(decoded.id);
    return {
      userId: decoded.id,
      orgIds: memberships.map(membership => membership.organization_id),
    };
  } catch {
    // Not a valid JWT — may be a raw service-account key, handled by caller
    return null;
  }
};

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

    return res.send(boxes);
  } catch (err) {
    log.error.error('Error discovering boxes:', err);
    return res.status(500).send({
      message: req.__('boxes.discover.error'),
    });
  }
};
