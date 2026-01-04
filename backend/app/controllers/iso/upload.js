const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const db = require('../../models');
const { log } = require('../../utils/Logger');
const { getIsoStorageRoot } = require('./helpers');
const { uploadFile: uploadFileMiddleware } = require('../../middleware/upload');
const { loadConfig } = require('../../utils/config-loader');

const ISO = db.iso;
const Organization = db.organization;

/**
 * @swagger
 * /api/organization/{organization}/iso:
 *   post:
 *     summary: Upload an ISO
 *     description: Upload a new ISO file to an organization. Supports deduplication via checksum.
 *     tags: [ISOs]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: header
 *         name: x-file-name
 *         schema:
 *           type: string
 *         description: Original filename
 *       - in: header
 *         name: x-is-public
 *         schema:
 *           type: boolean
 *         description: Whether the ISO should be public
 *     requestBody:
 *       content:
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       201:
 *         description: ISO uploaded successfully
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Internal server error
 */
const upload = async (req, res) => {
  const { organization } = req.params;
  const appConfig = loadConfig('app');
  const uploadTimeoutHours = appConfig.boxvault?.upload_timeout_hours?.value || 24;
  const uploadTimeoutMs = uploadTimeoutHours * 60 * 60 * 1000;
  req.setTimeout(uploadTimeoutMs);

  try {
    const org = await Organization.findOne({ where: { name: organization } });
    if (!org) {
      return res.status(404).send({ message: req.__('organizations.organizationNotFound') });
    }

    const isoRoot = getIsoStorageRoot();
    if (!fs.existsSync(isoRoot)) {
      fs.mkdirSync(isoRoot, { recursive: true });
    }

    // Use middleware to handle multipart upload (streams to temp file)
    await new Promise((resolve, reject) => {
      uploadFileMiddleware(req, res, err => {
        if (err) {
          reject(err);
        } else if (!req.file) {
          reject(new Error(req.__('files.noFileUploaded')));
        } else {
          resolve();
        }
      });
    });

    const { file } = req;
    const tempPath = path.resolve(file.path); // Normalize path to prevent traversal

    // Security: Ensure the temporary path is within the OS's temp directory.
    const tmpDir = os.tmpdir();
    if (!tempPath.startsWith(tmpDir + path.sep)) {
      log.error.error('Path traversal attempt detected in ISO upload', {
        originalPath: file.path,
        resolvedPath: tempPath,
        tmpDir,
      });
      return res.status(400).send({ message: 'Invalid file path detected.' });
    }

    const filename = file.originalname || 'uploaded.iso';
    const isPublic = req.body.isPublic === 'true';

    // Calculate hash of the uploaded temp file
    const hash = crypto.createHash('sha256');
    const fileStream = fs.createReadStream(tempPath);

    await new Promise((resolve, reject) => {
      fileStream.on('data', chunk => hash.update(chunk));
      fileStream.on('end', resolve);
      fileStream.on('error', reject);
    });

    try {
      const calculatedChecksum = hash.digest('hex');
      const finalFilename = `${calculatedChecksum}.iso`;
      const finalPath = path.join(isoRoot, finalFilename);

      // Deduplication Check
      if (fs.existsSync(finalPath)) {
        fs.unlinkSync(tempPath); // Remove temp file, use existing one
      } else {
        fs.renameSync(tempPath, finalPath);
      }

      // Create DB Record
      const iso = await ISO.create({
        name: filename,
        filename,
        size: file.size,
        checksum: calculatedChecksum,
        checksumType: 'sha256',
        storagePath: finalFilename,
        organizationId: org.id,
        isPublic,
      });

      return res.status(201).send(iso);
    } catch (err) {
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch (e) {
          void e;
        }
      }
      throw err;
    }
  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).send({
        message: req.__('files.fileTooLarge', { size: appConfig.boxvault.box_max_file_size.value }),
        error: 'FILE_TOO_LARGE',
      });
    }

    log.error.error('ISO Upload Controller Error', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

module.exports = { upload };
