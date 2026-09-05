import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { canSeeIso, resolveIsoViewer } from './visibility.js';
import { sumIsoDownloads } from './helpers.js';
const { iso: ISO, isoVersions: IsoVersion, isoFiles: IsoFile, organization: Organization } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/{name}:
 *   get:
 *     summary: Get ISO details
 *     description: Retrieve an ISO with its versions and per-architecture files. A public, published ISO is readable by anyone; any other ISO requires membership of its organization, by JWT or by a service-account key of the organization.
 *     tags: [ISOs]
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: ISO name
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: Optional JWT token (or raw service-account key) for member visibility
 *     responses:
 *       200:
 *         description: ISO details with versions, files, organization and total downloadCount
 *       403:
 *         description: The ISO is not visible to the caller
 *       404:
 *         description: ISO or organization not found
 *       500:
 *         description: Internal server error
 */
const findOne = async (req, res) => {
  const { organization: organizationName, name } = req.params;

  try {
    const organization = await Organization.findOne({ where: { name: organizationName } });
    if (!organization) {
      return res.status(404).send({ message: req.__('organizations.organizationNotFound') });
    }
    const iso = await ISO.findOne({
      where: { name, organizationId: organization.id },
      include: [
        {
          model: IsoVersion,
          as: 'versions',
          include: [{ model: IsoFile, as: 'files' }],
        },
        { model: Organization, as: 'organization', attributes: ['name', 'emailHash', 'logo'] },
      ],
    });
    if (!iso) {
      return res.status(404).send({ message: req.__('isos.notFound') });
    }
    const viewer = await resolveIsoViewer(req);
    if (!canSeeIso(viewer, iso)) {
      return res.status(403).send({ message: req.__('auth.forbidden') });
    }
    return res.send({ ...iso.toJSON(), downloadCount: sumIsoDownloads(iso) });
  } catch (err) {
    log.error.error('Error finding ISO', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

export { findOne };
