const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../../models');
const { log } = require('../../utils/Logger');
const { getIsoStorageRoot, getSecureIsoPath } = require('./helpers');
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

    const filename = req.headers['x-file-name'] || 'uploaded.iso';
    const isPublic = req.headers['x-is-public'] === 'true';
    const fileSize = parseInt(req.headers['content-length'], 10);

    // Create a temporary file path
    const tempFilename = `temp-${Date.now()}-${Math.random().toString(36).substring(7)}.iso`;
    const tempPath = getSecureIsoPath(tempFilename);

    // Security: Ensure the temporary path is within the OS's temp directory.
    // Note: For ISOs we use the ISO storage root for temp files to ensure they are on the same volume for atomic renames
    if (!tempPath.startsWith(isoRoot)) {
      return res.status(400).send({ message: 'Invalid file path detected.' });
    }

    // Stream request to file and calculate hash
    const writeStream = fs.createWriteStream(tempPath);
    const hash = crypto.createHash('sha256');

    await new Promise((resolve, reject) => {
      req.on('data', chunk => {
        hash.update(chunk);
        writeStream.write(chunk);
      });
      req.on('end', () => {
        writeStream.end();
        resolve();
      });
      req.on('error', reject);
      writeStream.on('error', reject);
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
        size: fileSize,
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
    if (err.code === 'LIMIT_FILE_SIZE' || err.message.includes('File too large')) {
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
