import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { resolveJwtUser } from '../../utils/jwtUser.js';
import {
  extractBearerToken,
  findServiceAccountByRawToken,
} from '../../utils/serviceAccountAuth.js';
const { iso: Iso, organization: Organization, Sequelize } = db;
const { Op } = Sequelize;

/**
 * @swagger
 * /api/isos/discover:
 *   get:
 *     summary: Discover ISOs
 *     description: Retrieve the ISOs visible to the caller. Anonymous requests get the public ISOs of every organization; a signed-in user additionally gets every ISO of the organizations they belong to, and a service-account key the ISOs of its own organization — the same rule as /api/discover for boxes.
 *     tags: [ISOs]
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
 *         description: A list of ISOs, each with its organization's name, emailHash and logo.
 *       500:
 *         description: Internal server error.
 */
export const discoverAll = async (req, res) => {
  try {
    const rawToken = extractBearerToken(req) || req.headers['x-access-token'];
    const serviceAccount = await findServiceAccountByRawToken(rawToken);

    let where = { isPublic: true };
    if (serviceAccount) {
      where = {
        [Op.or]: [{ isPublic: true }, { organizationId: serviceAccount.organization_id }],
      };
    } else {
      const jwtUser = await resolveJwtUser(req);
      if (jwtUser) {
        where = {
          [Op.or]: [{ isPublic: true }, { organizationId: { [Op.in]: jwtUser.orgIds } }],
        };
      }
    }

    const isos = await Iso.findAll({
      where,
      include: [
        { model: Organization, as: 'organization', attributes: ['name', 'emailHash', 'logo'] },
      ],
      order: [['createdAt', 'DESC']],
    });
    return res.status(200).send(isos);
  } catch (err) {
    log.error.error('Error discovering ISOs:', {
      error: err.message,
    });
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};
