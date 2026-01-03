// update.file.controller.js
const { loadConfig } = require('../../utils/config-loader');
const { log } = require('../../utils/Logger');
const db = require('../../models');
const { uploadFile: uploadFileMiddleware } = require('../../middleware/upload');

const Architecture = db.architectures;
const File = db.files;

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
const update = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  const fileName = `vagrant.box`;
  const uploadStartTime = Date.now();

  // Set a longer timeout for the request from config
  const appConfig = loadConfig('app');
  const uploadTimeoutHours = appConfig.boxvault?.upload_timeout_hours?.value || 24;
  const uploadTimeoutMs = uploadTimeoutHours * 60 * 60 * 1000;
  req.setTimeout(uploadTimeoutMs);
  res.setTimeout(uploadTimeoutMs);

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`,
      });
    }

    const box = await db.box.findOne({
      where: { name: boxId, organizationId: organizationData.id },
    });

    if (!box) {
      return res.status(404).send({
        message: `Box ${boxId} not found in organization ${organization}.`,
      });
    }

    // Check if user owns the box OR has moderator/admin role
    const membership = await db.UserOrg.findUserOrgRole(req.userId, organizationData.id);
    const isOwner = box.userId === req.userId;
    const canUpdate = isOwner || (membership && ['moderator', 'admin'].includes(membership.role));

    if (!canUpdate) {
      return res.status(403).send({
        message: 'You can only update files for boxes you own, or you need moderator/admin role.',
      });
    }

    const version = await db.versions.findOne({
      where: { versionNumber, boxId: box.id },
    });

    if (!version) {
      return res.status(404).send({
        message: `Version ${versionNumber} not found.`,
      });
    }

    const provider = await db.providers.findOne({
      where: { name: providerName, versionId: version.id },
    });

    if (!provider) {
      return res.status(404).send({
        message: `Provider ${providerName} not found.`,
      });
    }

    const architecture = await Architecture.findOne({
      where: { name: architectureName, providerId: provider.id },
    });

    if (!architecture) {
      return res.status(404).send({
        message: `Architecture not found for provider ${providerName} in version ${versionNumber} of box ${boxId}.`,
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
        message: 'File not found. Please upload the file first.',
      });
    }

    // Process the upload using Promise-based middleware
    await new Promise((resolve, reject) => {
      uploadFileMiddleware(req, res, err => {
        if (err) {
          reject(err);
        } else if (!req.file) {
          reject(new Error('No file uploaded'));
        } else {
          resolve(req.file);
        }
      });
    });

    // If headers are already sent by middleware, return
    if (res.headersSent) {
      log.app.info('Headers already sent by middleware');
      return res;
    }

    // Log successful file upload
    log.app.info('File updated successfully:', {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: req.file.path,
    });

    const { checksum: bodyChecksum, checksumType: bodyChecksumType } = req.body;
    let checksum = bodyChecksum;
    let checksumType = bodyChecksumType;

    if (!checksumType || checksumType.toUpperCase() === 'NULL') {
      checksum = null;
      checksumType = null;
    }

    // Update the file record with new information
    await fileRecord.update({
      fileName,
      checksum,
      checksumType,
      fileSize: req.file.size,
    });

    // Log successful update
    log.app.info('File record updated:', {
      fileName,
      checksum,
      checksumType,
      architectureId: architecture.id,
      fileSize: req.file.size,
      path: req.file.path,
    });

    return res.status(200).send({
      message: 'Updated the file successfully',
      fileName,
      fileSize: req.file.size,
      path: req.file.path,
    });
  } catch (err) {
    log.app.info(err);

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'FILE_TOO_LARGE',
        message: `File size cannot be larger than ${appConfig.boxvault.box_max_file_size.value}GB!`,
        details: {
          maxSize: appConfig.boxvault.box_max_file_size.value * 1024 * 1024 * 1024,
          duration: (Date.now() - uploadStartTime) / 1000,
        },
      });
    }

    if (err.message.includes('Upload timeout') || err.code === 'ETIMEDOUT') {
      const uploadDuration = (Date.now() - uploadStartTime) / 1000;
      return res.status(408).json({
        error: 'UPLOAD_TIMEOUT',
        message: 'Upload timed out - Request took too long to complete',
        details: {
          duration: uploadDuration,
          maxFileSize: appConfig.boxvault.box_max_file_size.value * 1024 * 1024 * 1024,
        },
      });
    }

    // Handle disk space errors
    if (err.code === 'ENOSPC') {
      return res.status(507).json({
        error: 'NO_STORAGE_SPACE',
        message: 'Not enough storage space available',
        details: {
          duration: (Date.now() - uploadStartTime) / 1000,
        },
      });
    }

    return res.status(500).send({
      message: `Could not update the file: ${req.file ? req.file.originalname : ''}`,
      error: err.message,
      code: err.code || 'UNKNOWN_ERROR',
      details: {
        duration: (Date.now() - uploadStartTime) / 1000,
      },
    });
  }
};

module.exports = { update };
