import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import { isoWhereFor, resolveIsoViewer } from './visibility.js';
import { sumIsoDownloads } from './helpers.js';
const { iso: ISO, isoVersions: IsoVersion, isoFiles: IsoFile, organization: Organization } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso:
 *   get:
 *     summary: List ISOs for an organization
 *     description: Retrieve the ISOs of an organization visible to the caller, each with its versions and per-architecture files. Anonymous requests get the public, published ISOs; a member of the organization, by JWT or by a service-account key of the organization, gets every ISO — the same rule as the organization box list.
 *     tags: [ISOs]
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: Optional JWT token (or raw service-account key) for member visibility
 *     responses:
 *       200:
 *         description: List of ISOs with versions, files and total downloadCount
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Internal server error
 */
const findAll = async (req, res) => {
  const { organization: organizationName } = req.params;
  try {
    const organization = await Organization.findOne({ where: { name: organizationName } });
    if (!organization) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('organizations.organizationNotFound'),
      });
    }
    const viewer = await resolveIsoViewer(req);
    const isos = await ISO.findAll({
      where: isoWhereFor(viewer, organization.id),
      include: [
        {
          model: IsoVersion,
          as: 'versions',
          include: [{ model: IsoFile, as: 'files' }],
        },
        { model: Organization, as: 'organization', attributes: ['name', 'emailHash', 'logo'] },
      ],
      order: [['createdAt', 'DESC']],
    });

    return res.send(isos.map(iso => ({ ...iso.toJSON(), downloadCount: sumIsoDownloads(iso) })));
  } catch (err) {
    log.error.error('Error finding all ISOs', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { findAll };
