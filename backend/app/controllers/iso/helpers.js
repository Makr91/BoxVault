import fs from 'fs';
import { join } from 'path';
import { loadConfig } from '../../utils/config-loader.js';
import { isPathInside } from '../../utils/paths.js';
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
const { isoFiles: IsoFile, Sequelize } = db;
const { Op } = Sequelize;

const getIsoStorageRoot = () => {
  const appConfig = loadConfig('app');

  if (appConfig.boxvault?.iso_storage_directory?.value) {
    return appConfig.boxvault.iso_storage_directory.value;
  }

  const storageDir = appConfig.boxvault.box_storage_directory.value;
  return join(storageDir, 'iso');
};

const getSecureIsoPath = (...pathSegments) => {
  const root = getIsoStorageRoot();
  const fullPath = join(root, ...pathSegments);

  if (!isPathInside(root, fullPath)) {
    throw new Error('Path traversal attempt detected');
  }

  return fullPath;
};

const cleanupTempFile = tempPath => {
  if (fs.existsSync(tempPath)) {
    try {
      fs.unlinkSync(tempPath);
    } catch (e) {
      log.app.warn('Failed to cleanup temp file:', e.message);
    }
  }
};

/**
 * Total downloads of an ISO: the sum of every file's downloadCount across its
 * versions and architectures.
 * @param {Object} iso - An ISO with nested versions and files
 * @returns {number} Total download count
 */
const sumIsoDownloads = iso =>
  (iso.versions || [])
    .flatMap(version => version.files || [])
    .reduce((total, file) => total + (file.downloadCount || 0), 0);

/**
 * Remove the physical files behind iso_files rows that have already been
 * deleted from the database, keeping any file still referenced by another row
 * with the same checksum (deduplication).
 * @param {Array<{checksum: string, storagePath: string}>} files - The deleted rows
 * @returns {Promise<void>}
 */
const removeUnreferencedIsoFiles = async files => {
  const checksums = [...new Set(files.map(file => file.checksum))];
  if (checksums.length === 0) {
    return;
  }
  const stillReferenced = await IsoFile.findAll({
    where: { checksum: { [Op.in]: checksums } },
    attributes: ['checksum'],
  });
  const keep = new Set(stillReferenced.map(file => file.checksum));
  const root = getIsoStorageRoot();
  files
    .filter(file => !keep.has(file.checksum))
    .forEach(file => {
      const fullPath = join(root, file.storagePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        log.file.info(`ISO Physical Delete: Removed ${fullPath} as no references remain.`);
      }
    });
};

export {
  getIsoStorageRoot,
  getSecureIsoPath,
  cleanupTempFile,
  sumIsoDownloads,
  removeUnreferencedIsoFiles,
};
