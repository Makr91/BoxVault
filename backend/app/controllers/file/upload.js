// upload.file.controller.js
const fs = require('fs');
const path = require('path');

const { loadConfig } = require('../../utils/config-loader');
const { log } = require('../../utils/Logger');
const db = require('../../models');
const { uploadFile: uploadFileMiddleware } = require('../../middleware/upload');

let appConfig;
try {
  appConfig = loadConfig('app');
} catch (e) {
  log.error.error(`Failed to load App configuration: ${e.message}`);
}

const Architecture = db.architectures;

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
const upload = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  const fileName = `vagrant.box`;
  const filePath = path.join(
    appConfig.boxvault.box_storage_directory.value,
    organization,
    boxId,
    versionNumber,
    providerName,
    architectureName,
    fileName
  );
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

  // Set a longer timeout for the request
  req.setTimeout(24 * 60 * 60 * 1000); // 24 hours
  res.setTimeout(24 * 60 * 60 * 1000); // 24 hours

  try {
    log.app.info('Creating upload directory if needed:', { filePath });

    // Create directory if it doesn't exist
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      log.app.info('Created upload directory:', { dir });
    } else {
      log.app.info('Upload directory already exists:', { dir });
    }

    log.app.info('Looking up architecture in database...');

    const architecture = await Architecture.findOne({
      where: { name: architectureName },
      include: [
        {
          model: db.providers,
          as: 'provider',
          where: { name: providerName },
          include: [
            {
              model: db.versions,
              as: 'version',
              where: { versionNumber },
              include: [
                {
                  model: db.box,
                  as: 'box',
                  where: { name: boxId },
                  include: [
                    {
                      model: db.user,
                      as: 'user',
                      include: [
                        {
                          model: db.organization,
                          as: 'organization',
                          where: { name: organization },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    if (!architecture) {
      log.app.error('Architecture not found in database', {
        architectureName,
        providerName,
        versionNumber,
        boxId,
        organization,
      });
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: `Architecture not found for provider ${providerName} in version ${versionNumber} of box ${boxId}.`,
      });
    }

    log.app.info('Architecture found, calling upload middleware...', {
      architectureId: architecture.id,
      architectureName: architecture.name,
    });

    // Call the upload middleware directly (it handles the response)
    await uploadFileMiddleware(req, res);

    log.app.info('Upload middleware completed successfully');
    return res;
  } catch (err) {
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

    // Handle specific error types
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).send({
        message: `File size cannot be larger than ${appConfig.boxvault.box_max_file_size.value}GB!`,
        error: 'FILE_TOO_LARGE',
      });
    }

    if (err.message.includes('Upload timeout') || err.code === 'ETIMEDOUT') {
      const uploadDuration = (Date.now() - uploadStartTime) / 1000;
      return res.status(408).send({
        message: 'Upload timed out - Request took too long to complete',
        error: 'UPLOAD_TIMEOUT',
        details: {
          duration: `${uploadDuration} seconds`,
          maxFileSize: `${appConfig.boxvault.box_max_file_size.value}GB`,
        },
      });
    }

    // Handle disk space errors
    if (err.code === 'ENOSPC') {
      return res.status(507).send({
        message: 'Not enough storage space available',
        error: 'NO_STORAGE_SPACE',
      });
    }

    // Generic error response with more details
    return res.status(500).json({
      error: 'UPLOAD_ERROR',
      message: 'Could not upload the file',
      details: {
        error: err.message,
        code: err.code || 'UNKNOWN_ERROR',
        duration: (Date.now() - uploadStartTime) / 1000,
      },
    });
  }
};

module.exports = { upload };
