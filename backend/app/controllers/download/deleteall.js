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
 * /api/organization/{organization}/download:
 *   delete:
 *     summary: Delete all download products in an organization
 *     description: Delete every download product of the organization with their releases, patches, file records and directories.
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
 *     responses:
 *       200:
 *         description: All downloads deleted
 *       404:
 *         description: No downloads to delete
 *       500:
 *         description: Internal server error
 */
const deleteAll = async (req, res) => {
  const { organization } = req.params;

  try {
    const downloads = await Download.findAll({
      where: { organizationId: req.organizationId },
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
    if (downloads.length === 0) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('downloads.noDownloadsFound'),
      });
    }

    const files = downloads
      .flatMap(download => download.releases)
      .flatMap(release => release.patches)
      .flatMap(patch => patch.files);

    await removeDownloadFiles(files);
    const deleted = await Download.destroy({ where: { organizationId: req.organizationId } });

    await Promise.all(
      downloads.map(async download => {
        const downloadPath = getSecureDownloadPath(organization, download.name);
        try {
          await fs.promises.rm(downloadPath, { recursive: true, force: true });
        } catch (err) {
          log.app.info(`Could not delete the download directory for ${download.name}: ${err}`);
        }
      })
    );

    return res.send({ message: req.__('downloads.deletedAll', { count: deleted }) });
  } catch (err) {
    log.error.error('Error deleting all downloads', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { deleteAll };
