// update.file.controller.js
import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
const { files: File, UserOrg } = db;
import { uploadFile as uploadFileMiddleware } from '../../middleware/upload.js';

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}/file/upload:
 *   put:
 *     summary: Update a Vagrant box file
 *     description: Update an existing Vagrant box file with a new version
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
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Updated Vagrant box file
 *               checksum:
 *                 type: string
 *                 description: File checksum for verification
 *               checksumType:
 *                 type: string
 *                 description: Checksum algorithm
 *                 enum: [sha256, md5, sha1, NULL]
 *               newOrganization:
 *                 type: string
 *                 description: New organization name (optional)
 *               newBoxId:
 *                 type: string
 *                 description: New box name (optional)
 *               newVersionNumber:
 *                 type: string
 *                 description: New version number (optional)
 *               newProviderName:
 *                 type: string
 *                 description: New provider name (optional)
 *               newArchitectureName:
 *                 type: string
 *                 description: New architecture name (optional)
 *     responses:
 *       200:
 *         description: File updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Updated the file successfully"
 *                 fileName:
 *                   type: string
 *                   example: "vagrant.box"
 *                 fileSize:
 *                   type: integer
 *                   description: File size in bytes
 *                 path:
 *                   type: string
 *                   description: File path on server
 *       404:
 *         description: Architecture or file not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       408:
 *         description: Upload timeout
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "UPLOAD_TIMEOUT"
 *                 message:
 *                   type: string
 *                   example: "Upload timed out - Request took too long to complete"
 *                 details:
 *                   type: object
 *                   properties:
 *                     duration:
 *                       type: number
 *                     maxFileSize:
 *                       type: number
 *       413:
 *         description: File too large
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "FILE_TOO_LARGE"
 *                 message:
 *                   type: string
 *                   example: "File size cannot be larger than 10GB!"
 *                 details:
 *                   type: object
 *                   properties:
 *                     maxSize:
 *                       type: number
 *                     duration:
 *                       type: number
 *       507:
 *         description: Insufficient storage space
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "NO_STORAGE_SPACE"
 *                 message:
 *                   type: string
 *                   example: "Not enough storage space available"
 *                 details:
 *                   type: object
 *                   properties:
 *                     path:
 *                       type: string
 *                     duration:
 *                       type: number
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 error:
 *                   type: string
 *                 code:
 *                   type: string
 *                 details:
 *                   type: object
 *                   properties:
 *                     duration:
 *                       type: number
 */
const update = (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  void organization;
  void boxId;
  void versionNumber;
  void providerName;
  void architectureName;
  const fileName = `vagrant.box`;
  const uploadStartTime = Date.now();

  // Set a longer timeout for the request from config
  const appConfig = loadConfig('app');
  const uploadTimeoutHours = appConfig.boxvault?.upload_timeout_hours?.value || 24;
  const uploadTimeoutMs = uploadTimeoutHours * 60 * 60 * 1000;
  req.setTimeout(uploadTimeoutMs);
  res.setTimeout(uploadTimeoutMs);

  return (async () => {
    // Entities are pre-loaded by verifyBoxFilePath middleware
    const { organization: organizationData, box, architecture } = req.entities;

    // Check if user owns the box OR has moderator/admin role
    const membership = await UserOrg.findUserOrgRole(req.userId, organizationData.id);
    const isOwner = box.userId === req.userId;
    const canUpdate = isOwner || (membership && ['moderator', 'admin'].includes(membership.role));

    if (!canUpdate) {
      return res.status(403).send({
        message: req.__('files.update.permissionDenied'),
      });
    }

    const fileRecord = await File.findOne({
      where: {
        fileName,
        architectureId: architecture.id,
      },
    });

    if (!fileRecord) {
      return res.status(404).send({
        message: req.__('files.notFoundUploadFirst'),
      });
    }

    // Call the upload middleware directly (it handles the response and DB updates)
    await uploadFileMiddleware(req, res);
    return undefined;
  })().catch(err => {
    log.app.info(err);

    return res.status(500).send({
      message: req.__('files.update.error', { file: '' }),
      error: err.message,
      code: err.code || 'UNKNOWN_ERROR',
      details: {
        duration: (Date.now() - uploadStartTime) / 1000,
      },
    });
  });
};

export { update };
