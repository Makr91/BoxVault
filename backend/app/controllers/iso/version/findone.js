import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { problem } from '../../../utils/problem.js';
import { isGuestOf } from '../../../utils/orgMembership.js';
import { canSeeIso, canSeeIsoVersion, resolveIsoViewer } from '../visibility.js';
import { isoVersionsWithCounts } from '../helpers.js';
const { isoVersions: IsoVersion, isoFiles: IsoFile } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/{name}/version/{versionNumber}:
 *   get:
 *     summary: Get a specific version of an ISO
 *     description: Retrieve one version of an ISO with its per-architecture files. A public, published ISO is readable by anyone; any other ISO requires a writing membership of its organization, a guest of the organization reading it only while it is published and flagged for guests. Every file download_count is null to a guest of the organization; a version beyond the caller's reach answers 404.
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
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('versions.unauthorized'),
      });
    }

    const version = await IsoVersion.findOne({
      where: { versionNumber, isoId: iso.id },
      include: [{ model: IsoFile, as: 'files' }],
    });
    if (!version || !canSeeIsoVersion(viewer, iso, version)) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('isos.versions.notFound'),
      });
    }

    const [answer] = isoVersionsWithCounts([version], !isGuestOf(viewer, iso.organizationId));
    return res.send(answer);
  } catch (err) {
    log.error.error('Error retrieving ISO version', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { findOne };
