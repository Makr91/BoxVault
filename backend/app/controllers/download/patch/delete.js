import fs from 'fs';
import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { canWriteDownload, resolveOrgMembership } from '../../../utils/orgMembership.js';
import { problem } from '../../../utils/problem.js';
import { getSecureDownloadPath, removeDownloadFiles } from '../helpers.js';
const { downloadFiles: DownloadFile } = db;

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/{versionNumber}/patch/{patch}:
 *   delete:
 *     summary: Delete a patch of a release
 *     description: Delete the patch with its file records and directory. A file whose bytes are shared by symlink hands them to one of its links first. The product's owner, or an admin or owner of the organization, may delete.
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
 *         description: Release identifier
 *       - in: path
 *         name: patch
 *         required: true
 *         schema:
 *           type: string
 *         description: Patch name to delete
 *     responses:
 *       200:
 *         description: Patch deleted successfully
 *       403:
 *         description: The caller may not write the product
 *       404:
 *         description: Organization, product, release or patch not found
 *       500:
 *         description: Internal server error
 */
const deletePatch = async (req, res) => {
  const { organization, patch: patchName } = req.params;

  try {
    const { organizationData, downloadData: download, releaseData: release, patchData } = req;

    const membership = await resolveOrgMembership(req, organizationData.id);
    if (!canWriteDownload(req, download, membership)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('downloads.permissionDenied'),
      });
    }

    const files = await DownloadFile.findAll({ where: { downloadPatchId: patchData.id } });

    await removeDownloadFiles(files);
    await patchData.destroy();

    const patchPath = getSecureDownloadPath(
      organization,
      download.name,
      release.versionNumber,
      patchName
    );
    try {
      await fs.promises.rm(patchPath, { recursive: true, force: true });
    } catch (err) {
      log.app.info(`Could not delete the patch directory: ${err}`);
    }

    return res.send({ message: req.__('downloads.patches.deleted') });
  } catch (err) {
    log.error.error('Error deleting download patch', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { deletePatch as delete };
