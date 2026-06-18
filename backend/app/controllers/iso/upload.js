import fs from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { getIsoStorageRoot, getSecureIsoPath, cleanupTempFile } from './helpers.js';
import { loadConfig } from '../../utils/config-loader.js';

const { iso: ISO } = db;

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
  const appConfig = loadConfig('app');
  const uploadTimeoutHours = appConfig.boxvault?.upload_timeout_hours?.value || 24;
  const uploadTimeoutMs = uploadTimeoutHours * 60 * 60 * 1000;
  req.setTimeout(uploadTimeoutMs);

  try {
    const isoRoot = getIsoStorageRoot();
    if (!fs.existsSync(isoRoot)) {
      fs.mkdirSync(isoRoot, { recursive: true });
    }

    const filename = req.headers['x-file-name'] || 'uploaded.iso';
    const isPublic = req.headers['x-is-public'] === 'true';
    const fileSize = parseInt(req.headers['content-length'], 10);

    // Check file size limit before streaming
    const maxFileSize = appConfig.boxvault.box_max_file_size.value * 1024 * 1024 * 1024;
    if (fileSize > maxFileSize) {
      const error = new Error('File too large');
      error.code = 'LIMIT_FILE_SIZE';
      throw error;
    }

    // Create a temporary file path
    const tempFilename = `temp-${Date.now()}-${Math.random().toString(36).substring(7)}.iso`;
    const tempPath = getSecureIsoPath(tempFilename);

    // Stream request to file and calculate hash
    const writeStream = fs.createWriteStream(tempPath);
    const hash = createHash('sha256');

    await new Promise((resolve, reject) => {
      req.on('data', chunk => {
        hash.update(chunk);
        writeStream.write(chunk);
      });
      req.on('end', () => {
        writeStream.end();
      });
      writeStream.on('finish', resolve);
      req.on('error', reject);
      writeStream.on('error', reject);
    });

    try {
      const calculatedChecksum = hash.digest('hex');
      const finalFilename = `${calculatedChecksum}.iso`;
      const finalPath = join(isoRoot, finalFilename);

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
        organizationId: req.organizationId,
        isPublic,
      });

      return res.status(201).send(iso);
    } catch (err) {
      cleanupTempFile(tempPath);
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

export { upload };
