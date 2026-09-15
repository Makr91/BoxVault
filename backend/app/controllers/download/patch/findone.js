import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { problem } from '../../../utils/problem.js';
import { canSeeDownload, isMemberOf, resolveDownloadViewer } from '../visibility.js';
import { filesWithCounts } from '../helpers.js';
const { downloadPatches: DownloadPatch, downloadFiles: DownloadFile } = db;

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/{versionNumber}/patch/{patch}:
 *   get:
 *     summary: Get a patch of a release
 *     description: Retrieve one patch of a release with its files. The product must be visible to the caller.
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
 *         description: The patch with its files
 *       403:
 *         description: The product is not visible to the caller
 *       404:
 *         description: Organization, product, release or patch not found
 *       500:
 *         description: Internal server error
 */
const findOne = async (req, res) => {
  try {
    const { downloadData: download, patchData } = req;

    const viewer = await resolveDownloadViewer(req);
    if (!canSeeDownload(viewer, download)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('providers.unauthorized'),
      });
    }

    const patch = await DownloadPatch.findOne({
      where: { id: patchData.id },
      include: [{ model: DownloadFile, as: 'files' }],
    });

    return res.send({
      ...patch.toJSON(),
      files: filesWithCounts(patch.files, isMemberOf(viewer, download.organizationId)),
    });
  } catch (err) {
    log.error.error('Error retrieving download patch', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { findOne };
