import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { canSeeIso, resolveIsoViewer } from '../visibility.js';
const { isoVersions: IsoVersion, isoFiles: IsoFile } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/{name}/version/{versionNumber}:
 *   get:
 *     summary: Get a specific version of an ISO
 *     description: Retrieve one version of an ISO with its per-architecture files. A public, published ISO is readable by anyone; any other ISO requires membership of its organization.
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
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: Optional JWT token (or raw service-account key) for member visibility
 *     responses:
 *       200:
 *         description: The version with its files
 *       403:
 *         description: The ISO is not visible to the caller
 *       404:
 *         description: Organization, ISO or version not found
 *       500:
 *         description: Internal server error
 */
const findOne = async (req, res) => {
  const { versionNumber } = req.params;

  try {
    const { isoData: iso } = req;

    const viewer = await resolveIsoViewer(req);
    if (!canSeeIso(viewer, iso)) {
      return res.status(403).send({ message: req.__('versions.unauthorized') });
    }

    const version = await IsoVersion.findOne({
      where: { versionNumber, isoId: iso.id },
      include: [{ model: IsoFile, as: 'files' }],
    });
    if (!version) {
      return res.status(404).send({ message: req.__('isos.versions.notFound') });
    }

    return res.send(version);
  } catch (err) {
    log.error.error('Error retrieving ISO version', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

export { findOne };
