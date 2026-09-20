import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { problem } from '../../../utils/problem.js';
import { reachOf, withinReach } from '../../../utils/orgMembership.js';
import { canSeeDownload, canSeePatch, isMemberOf, resolveDownloadViewer } from '../visibility.js';
import { filesWithCounts } from '../helpers.js';
const { downloadFiles: DownloadFile } = db;

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/{versionNumber}/patch/{patch}/file:
 *   get:
 *     summary: List the files of a patch
 *     description: Retrieve the file rows of a patch within the caller's reach. The product must be visible to the caller; a release or patch beyond the caller's reach answers 404.
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
 *       - in: path
 *         name: patch
 *         required: true
 *         schema:
 *           type: string
 *         description: Patch name
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: Optional JWT token (or raw service-account key) for member visibility
 *     responses:
 *       200:
 *         description: List of files
 *       403:
 *         description: The product is not visible to the caller
 *       404:
 *         description: Organization, product, release or patch not found
 *       500:
 *         description: Internal server error
 */
const findAll = async (req, res) => {
  try {
    const { downloadData: download, releaseData: release, patchData: patch } = req;

    const viewer = await resolveDownloadViewer(req);
    if (!canSeeDownload(viewer, download)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('architectures.unauthorized'),
      });
    }
    if (!canSeePatch(viewer, download, release, patch)) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('downloads.patches.notFound'),
      });
    }

    const files = await DownloadFile.findAll({
      where: { downloadPatchId: patch.id },
      order: [['createdAt', 'ASC']],
    });

    const reach = reachOf(viewer, download);
    return res.send(
      filesWithCounts(
        files.filter(file => withinReach(reach, release, patch, file)),
        isMemberOf(viewer, download.organizationId)
      )
    );
  } catch (err) {
    log.error.error('Error retrieving download files', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { findAll };
