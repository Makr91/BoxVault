import fs from 'fs';
import { join } from 'path';
import { getSecureBoxPath, getStorageRoot } from '../../utils/paths.js';
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
const {
  download: Download,
  downloadReleases: DownloadRelease,
  downloadPatches: DownloadPatch,
  downloadFiles: DownloadFile,
  Sequelize,
} = db;
const { Op } = Sequelize;

const DOWNLOADS_SEGMENT = 'downloads';
const PENDING_SEGMENT = '.pending';
const RESERVED_PRODUCT_NAMES = new Set(['pending']);

/**
 * Whether a product name is a segment the download routes own, so no
 * product may take it; compared case-insensitively.
 * @param {string} name - The product name
 * @returns {boolean}
 */
const isReservedProductName = name => RESERVED_PRODUCT_NAMES.has(String(name).toLowerCase());

/**
 * Securely construct a path within the downloads tree of an organization:
 * `<root>/<org>/downloads/<product>/<release>/<patch>/<file name>`, any
 * shorter form naming a directory.
 * @param {...string} pathSegments - organization, product, release, patch, file name
 * @returns {string} Secure path within the storage root
 * @throws {Error} If path traversal attempt detected
 */
const getSecureDownloadPath = (organization, ...pathSegments) =>
  getSecureBoxPath(organization, DOWNLOADS_SEGMENT, ...pathSegments);

/**
 * The storagePath a download_file row carries: the file's path relative to
 * the storage root.
 * @param {...string} pathSegments - organization, product, release, patch, file name
 * @returns {string} The relative storage path
 */
const storagePathFor = (organization, ...pathSegments) =>
  [organization, DOWNLOADS_SEGMENT, ...pathSegments].join('/');

const absolutePath = storagePath => join(getStorageRoot(), storagePath);

/**
 * The pending store of an organization: `<root>/<org>/downloads/.pending/<id>`,
 * the file name appended when given.
 * @param {string} organization - Organization name
 * @param {string} id - The pending upload's id
 * @param {...string} rest - The file name
 * @returns {string} Secure path within the storage root
 */
const getPendingPath = (organization, id, ...rest) =>
  getSecureDownloadPath(organization, PENDING_SEGMENT, id, ...rest);

/**
 * The storagePath a pending upload row carries.
 * @param {string} organization - Organization name
 * @param {string} id - The pending upload's id
 * @param {string} fileName - The real file name
 * @returns {string} The relative storage path
 */
const pendingStoragePathFor = (organization, id, fileName) =>
  storagePathFor(organization, PENDING_SEGMENT, id, fileName);

/**
 * The guess a pending upload row carries, the words its file name gave.
 * @param {Object} pending - The pending upload row
 * @returns {{product: string, release: string, patch: string, key: string, kind: string, platform: string, architecture: string, language: string}} The guess
 */
const pendingGuess = pending => ({
  product: pending.guessProduct,
  release: pending.guessRelease,
  patch: pending.guessPatch,
  key: pending.guessKey,
  kind: pending.guessKind,
  platform: pending.guessPlatform,
  architecture: pending.guessArchitecture,
  language: pending.guessLanguage,
});

/**
 * The members every answer of the pending routes carries.
 * @param {Object} pending - The pending upload row
 * @returns {{id: string, file_name: string, size: number, guess: Object}} The summary
 */
const pendingSummary = pending => ({
  id: pending.id,
  file_name: pending.fileName,
  size: Number(pending.size),
  guess: pendingGuess(pending),
});

/**
 * Total downloads of a product: the sum of every file's downloadCount across
 * its releases and patches.
 * @param {Object} download - A download with nested releases, patches and files
 * @returns {number} Total download count
 */
const sumDownloadDownloads = download =>
  (download.releases || [])
    .flatMap(release => release.patches || [])
    .flatMap(patch => patch.files || [])
    .reduce((total, file) => total + (file.downloadCount || 0), 0);

/**
 * The file rows with their downloadCount kept for a member of the
 * organization and answered null to anyone else.
 * @param {Array<Object>} files - File rows or their JSON
 * @param {boolean} member - Whether the caller belongs to the organization
 * @returns {Array<Object>} The files as JSON
 */
const filesWithCounts = (files, member) =>
  (files || []).map(file => ({
    ...(typeof file.toJSON === 'function' ? file.toJSON() : file),
    downloadCount: member ? file.downloadCount : null,
  }));

/**
 * The product's JSON with its downloadCount and every nested file's
 * downloadCount answered by membership: the numbers to a member, null to
 * anyone else.
 * @param {Object} download - A download row with nested releases, patches and files
 * @param {boolean} member - Whether the caller belongs to the organization
 * @returns {Object} The product JSON
 */
const withCounts = (download, member) => ({
  ...download.toJSON(),
  releases: (download.releases || []).map(release => ({
    ...release.toJSON(),
    patches: (release.patches || []).map(patch => ({
      ...patch.toJSON(),
      files: filesWithCounts(patch.files, member),
    })),
  })),
  downloadCount: member ? sumDownloadDownloads(download) : null,
});

/**
 * The original download_file of an organization carrying a checksum, the row
 * that owns the bytes a new upload with the same checksum links to.
 * Deduplication never crosses organizations.
 * @param {number} organizationId - Organization id
 * @param {string} checksum - The checksum to match
 * @param {number} excludeId - The uploading row's own id
 * @returns {Promise<Object|null>} The original row, or null
 */
const findOriginalByChecksum = (organizationId, checksum, excludeId) =>
  DownloadFile.findOne({
    where: { checksum, original: true, id: { [Op.ne]: excludeId } },
    include: [
      {
        model: DownloadPatch,
        as: 'patch',
        attributes: ['id'],
        required: true,
        include: [
          {
            model: DownloadRelease,
            as: 'release',
            attributes: ['id'],
            required: true,
            include: [
              {
                model: Download,
                as: 'download',
                attributes: ['id'],
                required: true,
                where: { organizationId },
              },
            ],
          },
        ],
      },
    ],
  });

const relink = (linkStoragePath, originalStoragePath) => {
  const linkPath = absolutePath(linkStoragePath);
  if (fs.lstatSync(linkPath, { throwIfNoEntry: false })) {
    fs.unlinkSync(linkPath);
  }
  fs.symlinkSync(absolutePath(originalStoragePath), linkPath);
};

/**
 * Hand the bytes of an original to one of its links before the original goes
 * away: the heir's symlink is replaced by the bytes, every other link is
 * pointed at the heir, so a link never points at a link.
 * @param {Object} file - The original download_file row
 * @returns {Promise<Object|null>} The heir row, or null when the original has no links
 */
const promoteOriginal = async file => {
  const links = await DownloadFile.findAll({ where: { linksTo: file.id } });
  if (links.length === 0) {
    return null;
  }
  const [heir, ...others] = links;
  const heirPath = absolutePath(heir.storagePath);
  const originalPath = absolutePath(file.storagePath);
  if (fs.lstatSync(heirPath, { throwIfNoEntry: false })) {
    fs.unlinkSync(heirPath);
  }
  if (fs.existsSync(originalPath)) {
    fs.renameSync(originalPath, heirPath);
  }
  await heir.update({ original: true, linksTo: null });
  await Promise.all(
    others.map(async link => {
      relink(link.storagePath, heir.storagePath);
      await link.update({ linksTo: heir.id });
    })
  );
  log.file.info(`Download Promote: ${heir.storagePath} now owns the bytes of ${file.storagePath}.`);
  return heir;
};

/**
 * Remove the bytes behind one download_file row before the row is deleted:
 * an original hands its bytes to a link first, a link only drops its symlink.
 * @param {Object} file - The download_file row
 * @returns {Promise<void>}
 */
const removeDownloadFile = async file => {
  if (!file.storagePath) {
    return;
  }
  if (file.original) {
    await promoteOriginal(file);
  }
  const fullPath = absolutePath(file.storagePath);
  if (fs.lstatSync(fullPath, { throwIfNoEntry: false })) {
    fs.unlinkSync(fullPath);
    log.file.info(`Download Physical Delete: Removed ${fullPath}.`);
  }
};

/**
 * removeDownloadFile over many rows, in order, because a promotion changes
 * which row owns the bytes the next removal sees.
 * @param {Array<Object>} files - The download_file rows
 * @returns {Promise<void>}
 */
const removeDownloadFiles = async files => {
  const remove = async index => {
    if (index >= files.length) {
      return;
    }
    await removeDownloadFile(files[index]);
    await remove(index + 1);
  };
  await remove(0);
};

/**
 * Re-create the symlinks of every link pointing at an original whose path
 * changed.
 * @param {Object} original - The original download_file row, storagePath already updated
 * @returns {Promise<void>}
 */
const relinkTo = async original => {
  const links = await DownloadFile.findAll({ where: { linksTo: original.id } });
  links.forEach(link => relink(link.storagePath, original.storagePath));
};

/**
 * After a directory rename, move the storagePath of every row under the old
 * prefix to the new one and point the links at the moved originals again.
 * @param {string} oldPrefix - The old relative directory path
 * @param {string} newPrefix - The new relative directory path
 * @returns {Promise<void>}
 */
const renameStoragePaths = async (oldPrefix, newPrefix) => {
  const rows = await DownloadFile.findAll({
    where: { storagePath: { [Op.like]: `${oldPrefix}/%` } },
  });
  await Promise.all(
    rows.map(row =>
      row.update({ storagePath: `${newPrefix}${row.storagePath.slice(oldPrefix.length)}` })
    )
  );
  await Promise.all(rows.filter(row => row.original).map(row => relinkTo(row)));
};

export {
  PENDING_SEGMENT,
  isReservedProductName,
  getSecureDownloadPath,
  storagePathFor,
  absolutePath,
  getPendingPath,
  pendingStoragePathFor,
  pendingGuess,
  pendingSummary,
  sumDownloadDownloads,
  filesWithCounts,
  withCounts,
  findOriginalByChecksum,
  promoteOriginal,
  removeDownloadFile,
  removeDownloadFiles,
  relinkTo,
  renameStoragePaths,
};
