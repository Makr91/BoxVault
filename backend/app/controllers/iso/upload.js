const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../../models');
const { log } = require('../../utils/Logger');
const { getIsoStorageRoot } = require('./helpers');

const ISO = db.iso;
const Organization = db.organization;

const upload = async (req, res) => {
  const { organization } = req.params;
  const filename = req.headers['x-file-name'] || 'uploaded.iso';
  const isPublic = req.headers['x-is-public'] === 'true';

  try {
    const org = await Organization.findOne({ where: { name: organization } });
    if (!org) {
      return res.status(404).send({ message: req.__('organizations.organizationNotFound') });
    }

    const isoRoot = getIsoStorageRoot();
    if (!fs.existsSync(isoRoot)) {
      fs.mkdirSync(isoRoot, { recursive: true });
    }

    // Stream to a temporary file first
    const tempPath = path.join(
      isoRoot,
      `temp-${Date.now()}-${Math.random().toString(36).substring(7)}`
    );
    const writeStream = fs.createWriteStream(tempPath);
    const hash = crypto.createHash('sha256');

    await new Promise((resolve, reject) => {
      req.pipe(writeStream);
      req.on('data', chunk => hash.update(chunk));
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      req.on('error', reject);
    });

    try {
      const calculatedChecksum = hash.digest('hex');
      const finalFilename = `${calculatedChecksum}.iso`;
      const finalPath = path.join(isoRoot, finalFilename);
      const stats = fs.statSync(tempPath);

      // Deduplication Check
      if (fs.existsSync(finalPath)) {
        log.file.info(
          `ISO Deduplication: File with hash ${calculatedChecksum} already exists. Linking to it.`
        );
        fs.unlinkSync(tempPath); // Remove temp file, use existing
      } else {
        fs.renameSync(tempPath, finalPath);
        log.file.info(`ISO Upload: New file stored at ${finalPath}`);
      }

      // Create DB Record
      const iso = await ISO.create({
        name: filename,
        filename,
        size: stats.size,
        checksum: calculatedChecksum,
        checksumType: 'sha256',
        storagePath: finalFilename,
        organizationId: org.id,
        isPublic,
      });

      return res.status(201).send(iso);
    } catch (err) {
      log.error.error('Error finalizing ISO upload', err);
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch (e) {
          void e;
        }
      }
      return res.status(500).send({ message: req.__('errors.operationFailed') });
    }
  } catch (err) {
    log.error.error('ISO Upload Controller Error', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

module.exports = { upload };
