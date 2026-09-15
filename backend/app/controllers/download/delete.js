import fs from 'fs';
import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import { getSecureDownloadPath, removeDownloadFiles } from './helpers.js';
const {
  download: Download,
  downloadReleases: DownloadRelease,
  downloadPatches: DownloadPatch,
  downloadFiles: DownloadFile,
} = db;

/**
 * @swagger
 * /api/organization/{organization}/download/{name}:
 *   delete:
 *     summary: Delete a download product
 *     description: Delete a download product with its releases, patches, file records and directory. A file whose bytes are shared by symlink hands them to one of its links first. The product's owner, or an admin or owner of the organization, may delete.
 *     tags: [Downloads]
 *     security:
 *       - JwtAuth: []
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
 *     responses:
 *       200:
 *         description: Download deleted successfully
 *       403:
 *         description: The caller neither owns the product nor administers the organization
 *       404:
 *         description: Download not found
 *       500:
 *         description: Internal server error
 */
const deleteDownload = async (req, res) => {
  const { organization, name } = req.params;

  try {
    const download = await Download.findOne({
      where: { name, organizationId: req.organizationId },
      include: [
        {
          model: DownloadRelease,
          as: 'releases',
          include: [
            {
              model: DownloadPatch,
              as: 'patches',
              include: [{ model: DownloadFile, as: 'files' }],
            },
          ],
        },
      ],
    });
    if (!download) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('downloads.notFound'),
      });
    }

    const isOwner = download.userId === req.userId;
    const canDelete = isOwner || ['admin', 'owner'].includes(req.userOrgRole);

    if (!canDelete) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('downloads.permissionDenied'),
      });
    }

    const files = download.releases
      .flatMap(release => release.patches)
      .flatMap(patch => patch.files);

    await removeDownloadFiles(files);
    await download.destroy();

    const downloadPath = getSecureDownloadPath(organization, name);
    try {
      await fs.promises.rm(downloadPath, { recursive: true, force: true });
    } catch (err) {
      log.app.info(`Could not delete the download directory: ${err}`);
    }

    return res.send({ message: req.__('downloads.deleted') });
  } catch (err) {
    log.error.error('Error deleting download', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { deleteDownload as delete };
