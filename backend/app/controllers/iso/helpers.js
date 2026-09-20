import fs from 'fs';
import { join } from 'path';
import { loadConfig } from '../../utils/config-loader.js';
import { isPathInside } from '../../utils/paths.js';
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
import { snakeKeys } from '../../utils/wire.js';
const { isoFiles: IsoFile, Sequelize } = db;
const { Op } = Sequelize;

const getIsoStorageRoot = () => {
  const appConfig = loadConfig('app');

  if (appConfig.boxvault?.iso_storage_directory) {
    return appConfig.boxvault.iso_storage_directory;
  }

  const storageDir = appConfig.boxvault.box_storage_directory;
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
 * The file rows of an ISO as JSON with their downloadCount kept when counted
 * and answered null otherwise.
 * @param {Array<Object>} files - File rows or their JSON
 * @param {boolean} counted - Whether the caller is answered the counts
 * @returns {Array<Object>} The files as JSON
 */
const isoFilesWithCounts = (files, counted) =>
  (files || []).map(file => {
    const plain = snakeKeys(typeof file.get === 'function' ? file.get({ plain: true }) : file);
    plain.download_count = counted ? file.downloadCount : null;
    delete plain.storage_path;
    return plain;
  });

/**
 * The version rows of an ISO as JSON with their files' downloadCount answered
 * when counted and null otherwise.
 * @param {Array<Object>} versions - Version rows with nested files
 * @param {boolean} counted - Whether the caller is answered the counts
 * @returns {Array<Object>} The versions as JSON
 */
const isoVersionsWithCounts = (versions, counted) =>
  (versions || []).map(version => {
    const plain = snakeKeys(version.get({ plain: true }));
    plain.files = isoFilesWithCounts(version.files, counted);
    return plain;
  });

/**
 * The ISO's JSON with its downloadCount and every nested file's downloadCount
 * answered when counted and null otherwise; a guest of the organization is
 * never counted.
 * @param {Object} iso - An ISO row with nested versions and files
 * @param {boolean} counted - Whether the caller is answered the counts
 * @returns {Object} The ISO JSON
 */
const isoWithCounts = (iso, counted) => {
  const plain = snakeKeys(iso.get({ plain: true }));
  plain.versions = isoVersionsWithCounts(iso.versions, counted);
  plain.download_count = counted ? sumIsoDownloads(iso) : null;
  return plain;
};

/**
 * Remove the physical files behind iso_files rows that have already been
 * deleted from the database, keeping any file still referenced by another row
 * with the same storage path (deduplication within an organization).
 * @param {Array<{storagePath: string}>} files - The deleted rows
 * @returns {Promise<void>}
 */
const removeUnreferencedIsoFiles = async files => {
  const storagePaths = [...new Set(files.map(file => file.storagePath))];
  if (storagePaths.length === 0) {
    return;
  }
  const stillReferenced = await IsoFile.findAll({
    where: { storagePath: { [Op.in]: storagePaths } },
    attributes: ['storagePath'],
  });
  const keep = new Set(stillReferenced.map(file => file.storagePath));
  const root = getIsoStorageRoot();
  storagePaths
    .filter(storagePath => !keep.has(storagePath))
    .forEach(storagePath => {
      const fullPath = join(root, storagePath);
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
  isoFilesWithCounts,
  isoVersionsWithCounts,
  isoWithCounts,
  removeUnreferencedIsoFiles,
};
