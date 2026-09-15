import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { problem } from '../../../utils/problem.js';
import { canSeeDownload, isMemberOf, resolveDownloadViewer } from '../visibility.js';
import { filesWithCounts } from '../helpers.js';
const { downloadPatches: DownloadPatch, downloadFiles: DownloadFile } = db;

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/{versionNumber}/patch:
 *   get:
 *     summary: List the patches of a release
 *     description: Retrieve every patch of a release with its files. The product must be visible to the caller.
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
 *         description: List of patches with their files
 *       403:
 *         description: The product is not visible to the caller
 *       404:
 *         description: Organization, product or release not found
 *       500:
 *         description: Internal server error
 */
const findAll = async (req, res) => {
  try {
    const { downloadData: download, releaseData: release } = req;

    const viewer = await resolveDownloadViewer(req);
    if (!canSeeDownload(viewer, download)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('providers.unauthorized'),
      });
    }

    const patches = await DownloadPatch.findAll({
      where: { downloadReleaseId: release.id },
      include: [{ model: DownloadFile, as: 'files' }],
      order: [['createdAt', 'ASC']],
    });

    const member = isMemberOf(viewer, download.organizationId);
    return res.send(
      patches.map(patch => ({
        ...patch.toJSON(),
        files: filesWithCounts(patch.files, member),
      }))
    );
  } catch (err) {
    log.error.error('Error retrieving download patches', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { findAll };
