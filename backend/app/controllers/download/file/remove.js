import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { canWriteDownload, resolveOrgMembership } from '../../../utils/orgMembership.js';
import { problem } from '../../../utils/problem.js';
import { removeDownloadFile } from '../helpers.js';
const { sequelize } = db;

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/{versionNumber}/patch/{patch}/file/{key}/delete:
 *   delete:
 *     summary: Delete a file of a patch
 *     description: Delete the file row and its bytes in a transaction. An original whose bytes are shared by symlink hands them to one of its links first; a link only drops its symlink. The product's owner, or an admin or owner of the organization, may delete.
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
 *         description: Patch name
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: File key or file name
 *     responses:
 *       200:
 *         description: File deleted successfully
 *       403:
 *         description: The caller may not write the product
 *       404:
 *         description: Organization, product, release, patch or file not found
 *       500:
 *         description: Internal server error
 */
const remove = async (req, res) => {
  try {
    const { organization, download, file } = req.entities;

    const membership = await resolveOrgMembership(req, organization.id);
    if (!canWriteDownload(req, download, membership)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('files.delete.permissionDenied'),
      });
    }

    await removeDownloadFile(file);

    const transaction = await sequelize.transaction();
    try {
      await file.destroy({ transaction });
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

    return res.send({ message: req.__('files.deleted') });
  } catch (err) {
    log.error.error('Error deleting download file', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { remove };
