// upload.file.controller.js
import { join, dirname } from 'path';
import { getSecureBoxPath } from '../../utils/paths.js';
import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
const { UserOrg } = db;
import { uploadFile as uploadFileMiddleware } from '../../middleware/upload.js';
import { safeMkdirSync, safeExistsSync } from '../../utils/fsHelper.js';

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}/file/upload:
 *   post:
 *     summary: Upload a Vagrant box file
 *     description: Upload a new Vagrant box file for a specific architecture and provider
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
 *         description: Provider name (e.g., virtualbox, vmware)
 *       - in: path
 *         name: architectureName
 *         required: true
 *         schema:
 *           type: string
 *         description: Architecture name (e.g., amd64, arm64)
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
 *                 description: Vagrant box file to upload
 *               checksum:
 *                 type: string
 *                 description: File checksum for verification
 *               checksumType:
 *                 type: string
 *                 description: Checksum algorithm (e.g., sha256, md5)
 *                 enum: [sha256, md5, sha1, NULL]
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "File uploaded successfully"
 *                 fileName:
 *                   type: string
 *                   example: "vagrant.box"
 *                 originalName:
 *                   type: string
 *                   description: Original filename
 *                 fileSize:
 *                   type: integer
 *                   description: File size in bytes
 *                 mimeType:
 *                   type: string
 *                   description: MIME type of the uploaded file
 *                 path:
 *                   type: string
 *                   description: File path on server
 *                 checksum:
 *                   type: string
 *                   description: File checksum
 *                 checksumType:
 *                   type: string
 *                   description: Checksum algorithm used
 *                 fileRecord:
 *                   $ref: '#/components/schemas/File'
 *       404:
 *         description: Architecture not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "NOT_FOUND"
 *                 message:
 *                   type: string
 *                   example: "Architecture not found for provider virtualbox in version 1.0.0 of box mybox."
 *       408:
 *         description: Upload timeout
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Upload timed out - Request took too long to complete"
 *                 error:
 *                   type: string
 *                   example: "UPLOAD_TIMEOUT"
 *                 details:
 *                   type: object
 *                   properties:
 *                     duration:
 *                       type: string
 *                       example: "3600 seconds"
 *                     maxFileSize:
 *                       type: string
 *                       example: "10GB"
 *       413:
 *         description: File too large
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "File size cannot be larger than 10GB!"
 *                 error:
 *                   type: string
 *                   example: "FILE_TOO_LARGE"
 *       507:
 *         description: Insufficient storage space
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Not enough storage space available"
 *                 error:
 *                   type: string
 *                   example: "NO_STORAGE_SPACE"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "UPLOAD_ERROR"
 *                 message:
 *                   type: string
 *                   example: "Could not upload the file"
 *                 details:
 *                   type: object
 *                   properties:
 *                     error:
 *                       type: string
 *                     code:
 *                       type: string
 *                     duration:
 *                       type: number
 */
const upload = (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  const fileName = `vagrant.box`;
  const baseDir = getSecureBoxPath(
    organization,
    boxId,
    versionNumber,
    providerName,
    architectureName
  );
  const filePath = join(baseDir, fileName);
  const uploadStartTime = Date.now();

  log.app.info('=== FILE UPLOAD STARTED ===', {
    organization,
    boxId,
    versionNumber,
    providerName,
    architectureName,
    fileName,
    filePath,
    headers: {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length'],
      'x-access-token': req.headers['x-access-token'] ? 'present' : 'missing',
      'x-checksum': req.headers['x-checksum'] || 'missing',
      'x-checksum-type': req.headers['x-checksum-type'] || 'missing',
      'x-file-name': req.headers['x-file-name'] || 'missing',
    },
    method: req.method,
    url: req.url,
  });

  // Set a longer timeout for the request from config
  const appConfig = loadConfig('app');
  const uploadTimeoutHours = appConfig.boxvault?.upload_timeout_hours?.value || 24;
  const uploadTimeoutMs = uploadTimeoutHours * 60 * 60 * 1000;
  req.setTimeout(uploadTimeoutMs);
  res.setTimeout(uploadTimeoutMs);

  return (async () => {
    // The verifyBoxFilePath middleware has already validated the path and attached entities.
    const { box: boxData, architecture: architectureData } = req.entities;

    // Create directory if it doesn't exist
    const dir = dirname(filePath);
    log.app.info('Ensuring upload directory exists:', { dir });
    if (!safeExistsSync(dir)) {
      safeMkdirSync(dir, { recursive: true });
      log.app.info('Created upload directory:', { dir });
    } else {
      log.app.info('Upload directory already exists:', { dir });
    }

    // Check if user owns the box OR has moderator/admin role
    const membership = await UserOrg.findUserOrgRole(req.userId, boxData.organizationId);
    const isOwner = boxData.userId === req.userId;
    const canUpload = isOwner || (membership && ['moderator', 'admin'].includes(membership.role));

    if (!canUpload) {
      log.app.error('Permission denied for upload', {
        userId: req.userId,
        boxOwnerId: boxData.userId,
      });
      return res.status(403).json({
        error: 'PERMISSION_DENIED',
        message: req.__('files.upload.permissionDenied'),
      });
    }

    log.app.info('Architecture found, calling upload middleware...', {
      architectureId: architectureData.id,
      architectureName: architectureData.name,
    });

    // Call the upload middleware directly (it handles the response)
    await uploadFileMiddleware(req, res);
    return undefined;
  })().catch(err => {
    // Log detailed error information
    log.error.error('File upload error:', {
      error: err.message,
      code: err.code,
      stack: err.stack,
      params: {
        organization,
        boxId,
        versionNumber,
        providerName,
        architectureName,
      },
    });

    // Generic error response with more details
    return res.status(500).json({
      error: 'UPLOAD_ERROR',
      message: req.__('files.upload.error'),
      details: {
        error: err.message,
        code: err.code || 'UNKNOWN_ERROR',
        duration: (Date.now() - uploadStartTime) / 1000,
      },
    });
  });
};

export { upload };
