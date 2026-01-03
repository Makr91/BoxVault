// remove.file.controller.js
const path = require('path');
const { getSecureBoxPath } = require('../../utils/paths');
const { log } = require('../../utils/Logger');
const db = require('../../models');
const { safeUnlink, safeRm } = require('../../utils/fsHelper');

const Architecture = db.architectures;
const File = db.files;

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
  const filePath = path.join(basefilePath, fileName);

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
    });

    if (!organizationData) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: `Organization not found with name: ${organization}.`,
      });
    }

    const box = await db.box.findOne({
      where: { name: boxId, organizationId: organizationData.id },
    });

    if (!box) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: `Box ${boxId} not found in organization ${organization}.`,
      });
    }

    // Check if user owns the box OR has moderator/admin role
    const membership = await db.UserOrg.findUserOrgRole(req.userId, organizationData.id);
    const isOwner = box.userId === req.userId;
    const canDelete = isOwner || (membership && ['moderator', 'admin'].includes(membership.role));

    if (!canDelete) {
      return res.status(403).json({
        error: 'PERMISSION_DENIED',
        message: 'You can only delete files for boxes you own, or you need moderator/admin role.',
      });
    }

    const version = await db.versions.findOne({
      where: { versionNumber, boxId: box.id },
    });

    if (!version) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: `Version ${versionNumber} not found.`,
      });
    }

    const provider = await db.providers.findOne({
      where: { name: providerName, versionId: version.id },
    });

    if (!provider) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: `Provider ${providerName} not found.`,
      });
    }

    const architecture = await Architecture.findOne({
      where: { name: architectureName, providerId: provider.id },
    });

    if (!architecture) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: `Architecture not found for provider ${providerName} in version ${versionNumber} of box ${boxId}.`,
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
        message:
          'File and database record are deleted, or file was not found but cleanup attempted.',
      });
    } catch (dbErr) {
      log.app.info(`Could not delete the database record: ${dbErr}`);
      return res.status(200).send({
        message:
          'File deletion attempted, but encountered issues with database or directory cleanup.',
      });
    }
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while deleting the file.',
    });
  }
};

module.exports = { remove };
