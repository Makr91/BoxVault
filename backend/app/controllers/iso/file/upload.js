import fs from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { loadConfig } from '../../../utils/config-loader.js';
import {
  getIsoStorageRoot,
  getSecureIsoPath,
  cleanupTempFile,
  removeUnreferencedIsoFiles,
} from '../helpers.js';

const { isoFiles: IsoFile } = db;

const FILENAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const FILENAME_MAX_LENGTH = 255;

/**
 * @swagger
 * /api/organization/{organization}/iso/{name}/version/{versionNumber}/architecture/{architecture}/file/upload:
 *   post:
 *     summary: Upload an ISO file
 *     description: Stream the raw ISO body for one architecture of a version. The sha256 checksum is computed while streaming and the file is stored once per checksum (deduplication). Uploading again for the same architecture replaces its file record.
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
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: ISO name
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *       - in: path
 *         name: architecture
 *         required: true
 *         schema:
 *           type: string
 *         description: Architecture (e.g. amd64, arm64)
 *       - in: header
 *         name: x-file-name
 *         schema:
 *           type: string
 *         description: Original filename (letters, digits, dot, dash and underscore)
 *     requestBody:
 *       content:
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       201:
 *         description: The ISO file record
 *       400:
 *         description: Invalid filename or architecture
 *       404:
 *         description: Organization, ISO or version not found
 *       413:
 *         description: File too large
 *       500:
 *         description: Internal server error
 */
const upload = async (req, res) => {
  const appConfig = loadConfig('app');
  const uploadTimeoutHours = appConfig.boxvault?.upload_timeout_hours?.value || 24;
  const uploadTimeoutMs = uploadTimeoutHours * 60 * 60 * 1000;
  req.setTimeout(uploadTimeoutMs);

  try {
    const { architecture } = req.params;
    const { version } = req.entities;
    const fileName = req.headers['x-file-name'] || 'uploaded.iso';

    if (
      !FILENAME_PATTERN.test(fileName) ||
      fileName.includes('..') ||
      fileName.length > FILENAME_MAX_LENGTH
    ) {
      return res.status(400).send({ message: req.__('files.invalidFileName') });
    }

    const isoRoot = getIsoStorageRoot();
    if (!fs.existsSync(isoRoot)) {
      fs.mkdirSync(isoRoot, { recursive: true });
    }

    const contentLength = parseInt(req.headers['content-length'], 10);
    const maxFileSize = appConfig.boxvault.box_max_file_size.value * 1024 * 1024 * 1024;
    if (contentLength > maxFileSize) {
      const error = new Error('File too large');
      error.code = 'LIMIT_FILE_SIZE';
      throw error;
    }

    const tempFilename = `temp-${Date.now()}-${Math.random().toString(36).substring(7)}.iso`;
    const tempPath = getSecureIsoPath(tempFilename);

    const writeStream = fs.createWriteStream(tempPath);
    const hash = createHash('sha256');
    let fileSize = 0;

    try {
      await new Promise((resolve, reject) => {
        req.on('data', chunk => {
          hash.update(chunk);
          fileSize += chunk.length;
          writeStream.write(chunk);
        });
        req.on('end', () => {
          writeStream.end();
        });
        writeStream.on('finish', resolve);
        req.on('error', reject);
        writeStream.on('error', reject);
      });

      if (fileSize > maxFileSize) {
        const error = new Error('File too large');
        error.code = 'LIMIT_FILE_SIZE';
        throw error;
      }

      const checksum = hash.digest('hex');
      const storagePath = `${checksum}.iso`;
      const finalPath = join(isoRoot, storagePath);

      if (fs.existsSync(finalPath)) {
        fs.unlinkSync(tempPath);
      } else {
        fs.renameSync(tempPath, finalPath);
      }

      const fileData = {
        architecture,
        fileName,
        fileSize,
        checksum,
        checksumType: 'SHA256',
        storagePath,
        isoVersionId: version.id,
      };

      const previous = await IsoFile.findOne({
        where: { isoVersionId: version.id, architecture },
      });

      let fileRecord;
      if (previous) {
        const replaced = previous.toJSON();
        fileRecord = await previous.update(fileData);
        if (replaced.checksum !== checksum) {
          await removeUnreferencedIsoFiles([replaced]);
        }
      } else {
        fileRecord = await IsoFile.create(fileData);
      }

      return res.status(201).send(fileRecord);
    } catch (err) {
      cleanupTempFile(tempPath);
      throw err;
    }
  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).send({
        message: req.__('files.fileTooLarge', { size: appConfig.boxvault.box_max_file_size.value }),
        error: 'FILE_TOO_LARGE',
      });
    }

    log.error.error('ISO file upload error', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

export { upload };
