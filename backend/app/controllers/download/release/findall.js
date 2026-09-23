import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { problem } from '../../../utils/problem.js';
import { canSeeDownload, isMemberOf, resolveDownloadViewer } from '../visibility.js';
import { filesWithCounts, releaseJson, releasesWithinReach } from '../helpers.js';
import { reachOf } from '../../../utils/orgMembership.js';
const {
  downloadReleases: DownloadRelease,
  downloadPatches: DownloadPatch,
  downloadFiles: DownloadFile,
} = db;

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release:
 *   get:
 *     summary: List the releases of a download product
 *     description: Retrieve the releases of a product within the caller's reach, newest first, each with the patches within it and their files, and its released_at, the date of its release patch or else the earliest dated patch beneath it. The product must be visible to the caller; a writer of the product sees every row.
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
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: Optional JWT token (or raw service-account key) for member visibility
 *     responses:
 *       200:
 *         description: List of releases with their patches and files
 *       403:
 *         description: The product is not visible to the caller
 *       404:
 *         description: Organization or product not found
 *       500:
 *         description: Internal server error
 */
const findAll = async (req, res) => {
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

    const releases = await DownloadRelease.findAll({
      where: { downloadId: download.id },
      include: [
        {
          model: DownloadPatch,
          as: 'patches',
          include: [{ model: DownloadFile, as: 'files' }],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    const member = isMemberOf(viewer, download.organizationId);
    download.releases = releases;
    return res.send(
      releasesWithinReach(download, reachOf(viewer, download)).map(release =>
        releaseJson(release, patch => ({
          ...patch.toJSON(),
          files: filesWithCounts(patch.files, member),
        }))
      )
    );
  } catch (err) {
    log.error.error('Error retrieving download releases', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { findAll };
