// remove.file.controller.js
import { join } from 'path';
import { getSecureBoxPath } from '../../utils/paths.js';
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
const { files: File, UserOrg } = db;
import { safeUnlink, safeRm } from '../../utils/fsHelper.js';

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}/file/delete:
 *   delete:
 *     summary: Delete a Vagrant box file
 *     description: Delete a Vagrant box file from both disk and database
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: path
 *         name: boxId
 *         required: true
 *         schema:
 *           type: string
 *         description: Box name
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *       - in: path
 *         name: providerName
 *         required: true
 *         schema:
 *           type: string
 *         description: Provider name
 *       - in: path
 *         name: architectureName
 *         required: true
 *         schema:
 *           type: string
 *         description: Architecture name
 *     responses:
 *       200:
 *         description: File deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "File and database record are deleted, or file was not found but cleanup attempted."
 *       404:
 *         description: Architecture not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
const remove = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  const fileName = `vagrant.box`;
  const basefilePath = getSecureBoxPath(
    organization,
    boxId,
    versionNumber,
    providerName,
    architectureName
  );
  const filePath = join(basefilePath, fileName);

  try {
    // Entities are pre-loaded by verifyBoxFilePath middleware
    const { organization: organizationData, box, architecture } = req.entities;

    // Check if user owns the box OR has moderator/admin role
    const membership = await UserOrg.findUserOrgRole(req.userId, organizationData.id);
    const isOwner = box.userId === req.userId;
    const canDelete = isOwner || (membership && ['moderator', 'admin'].includes(membership.role));

    if (!canDelete) {
      return res.status(403).json({
        error: 'PERMISSION_DENIED',
        message: req.__('files.delete.permissionDenied'),
      });
    }

    const fileRecord = await File.findOne({
      where: {
        fileName,
        architectureId: architecture.id,
      },
    });

    // Attempt to delete the file from the disk
    safeUnlink(filePath);

    // Proceed to delete the database record regardless of file deletion success
    try {
      if (fileRecord) {
        await fileRecord.destroy();
        log.app.info('Database record deleted successfully.');
      } else {
        log.app.info('File record not found, but continuing with directory cleanup.');
      }

      // Attempt to delete the architecture directory
      safeRm(basefilePath, { recursive: true, force: true });

      return res.status(200).send({
        message: req.__('files.deleted'),
      });
    } catch (dbErr) {
      log.app.info(`Could not delete the database record: ${dbErr}`);
      return res.status(200).send({
        message: req.__('files.delete.partialError'),
      });
    }
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('files.delete.error'),
    });
  }
};

export { remove };
