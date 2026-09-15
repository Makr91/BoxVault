import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { problem } from '../../../utils/problem.js';
import { canSeeDownload, isMemberOf, resolveDownloadViewer } from '../visibility.js';
import { filesWithCounts } from '../helpers.js';
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
 *     description: Retrieve every release of a product, newest first, with its patches and files. The product must be visible to the caller.
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
    return res.send(
      releases.map(release => ({
        ...release.toJSON(),
        patches: release.patches.map(patch => ({
          ...patch.toJSON(),
          files: filesWithCounts(patch.files, member),
        })),
      }))
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
