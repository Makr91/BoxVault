import fs from 'fs';
import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { canWriteDownload, resolveOrgMembership } from '../../../utils/orgMembership.js';
import { problem } from '../../../utils/problem.js';
import { getSecureDownloadPath, removeDownloadFiles } from '../helpers.js';
const {
  downloadReleases: DownloadRelease,
  downloadPatches: DownloadPatch,
  downloadFiles: DownloadFile,
} = db;

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/{versionNumber}:
 *   delete:
 *     summary: Delete a release of a download product
 *     description: Delete the release with its patches, file records and directory. A file whose bytes are shared by symlink hands them to one of its links first. The product's owner, or an admin or owner of the organization, may delete.
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
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Release identifier to delete
 *     responses:
 *       200:
 *         description: Release deleted successfully
 *       403:
 *         description: The caller may not write the product
 *       404:
 *         description: Organization, product or release not found
 *       500:
 *         description: Internal server error
 */
const deleteRelease = async (req, res) => {
  const { organization, versionNumber } = req.params;

  try {
    const { organizationData, downloadData: download } = req;

    const membership = await resolveOrgMembership(req, organizationData.id);
    if (!canWriteDownload(req, download, membership)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('downloads.permissionDenied'),
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
    if (!release) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('downloads.releases.notFound'),
      });
    }

    const files = release.patches.flatMap(patch => patch.files);

    await removeDownloadFiles(files);
    await release.destroy();

    const releasePath = getSecureDownloadPath(organization, download.name, versionNumber);
    fs.rm(releasePath, { recursive: true, force: true }, err => {
      if (err) {
        log.app.info(`Could not delete the release directory: ${err}`);
      }
    });

    return res.send({ message: req.__('downloads.releases.deleted') });
  } catch (err) {
    log.error.error('Error deleting download release', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { deleteRelease as delete };
