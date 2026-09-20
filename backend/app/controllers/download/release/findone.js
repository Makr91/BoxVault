import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { problem } from '../../../utils/problem.js';
import { reachOf } from '../../../utils/orgMembership.js';
import {
  canSeeDownload,
  canSeePatch,
  canSeeRelease,
  isMemberOf,
  resolveDownloadViewer,
} from '../visibility.js';
import { filesWithCounts, filesWithinReach } from '../helpers.js';
const {
  downloadReleases: DownloadRelease,
  downloadPatches: DownloadPatch,
  downloadFiles: DownloadFile,
} = db;

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/{versionNumber}:
 *   get:
 *     summary: Get a release of a download product
 *     description: Retrieve one release of a product with the patches within the caller's reach and the files within it. The product must be visible to the caller; a release beyond the caller's reach answers 404.
 *     tags: [Downloads]
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
 *         description: Product name
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Release identifier
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: Optional JWT token (or raw service-account key) for member visibility
 *     responses:
 *       200:
 *         description: The release with its patches and files
 *       403:
 *         description: The product is not visible to the caller
 *       404:
 *         description: Organization, product or release not found
 *       500:
 *         description: Internal server error
 */
const findOne = async (req, res) => {
  const { versionNumber } = req.params;

  try {
    const { downloadData: download } = req;

    const viewer = await resolveDownloadViewer(req);
    if (!canSeeDownload(viewer, download)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('versions.unauthorized'),
      });
    }

    const release = await DownloadRelease.findOne({
      where: { versionNumber, downloadId: download.id },
      include: [
        {
          model: DownloadPatch,
          as: 'patches',
          include: [{ model: DownloadFile, as: 'files' }],
        },
      ],
    });
    if (!release || !canSeeRelease(viewer, download, release)) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('downloads.releases.notFound'),
      });
    }

    const member = isMemberOf(viewer, download.organizationId);
    const reach = reachOf(viewer, download);
    return res.send({
      ...release.toJSON(),
      patches: release.patches
        .filter(patch => canSeePatch(viewer, download, release, patch))
        .map(patch => ({
          ...patch.toJSON(),
          files: filesWithCounts(filesWithinReach(release, patch, reach), member),
        })),
    });
  } catch (err) {
    log.error.error('Error retrieving download release', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { findOne };
