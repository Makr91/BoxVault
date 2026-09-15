import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { problem } from '../../../utils/problem.js';
import { canSeeDownload, isMemberOf, resolveDownloadViewer } from '../visibility.js';
import { filesWithCounts } from '../helpers.js';
const { downloadFiles: DownloadFile } = db;

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/{versionNumber}/patch/{patch}/file:
 *   get:
 *     summary: List the files of a patch
 *     description: Retrieve every file row of a patch. The product must be visible to the caller.
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
    const { downloadData: download, patchData: patch } = req;

    const viewer = await resolveDownloadViewer(req);
    if (!canSeeDownload(viewer, download)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('architectures.unauthorized'),
      });
    }

    const files = await DownloadFile.findAll({
      where: { downloadPatchId: patch.id },
      order: [['createdAt', 'ASC']],
    });

    return res.send(filesWithCounts(files, isMemberOf(viewer, download.organizationId)));
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
