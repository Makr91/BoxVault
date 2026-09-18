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
  (files || []).map(file => ({
    ...(typeof file.toJSON === 'function' ? file.toJSON() : file),
    downloadCount: counted ? file.downloadCount : null,
  }));

/**
 * The version rows of an ISO as JSON with their files' downloadCount answered
 * when counted and null otherwise.
 * @param {Array<Object>} versions - Version rows with nested files
 * @param {boolean} counted - Whether the caller is answered the counts
 * @returns {Array<Object>} The versions as JSON
 */
const isoVersionsWithCounts = (versions, counted) =>
  (versions || []).map(version => ({
    ...version.toJSON(),
    files: isoFilesWithCounts(version.files, counted),
  }));

/**
 * The ISO's JSON with its downloadCount and every nested file's downloadCount
 * answered when counted and null otherwise; a guest of the organization is
 * never counted.
 * @param {Object} iso - An ISO row with nested versions and files
 * @param {boolean} counted - Whether the caller is answered the counts
 * @returns {Object} The ISO JSON
 */
const isoWithCounts = (iso, counted) => ({
  ...iso.toJSON(),
  versions: isoVersionsWithCounts(iso.versions, counted),
  downloadCount: counted ? sumIsoDownloads(iso) : null,
});

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
