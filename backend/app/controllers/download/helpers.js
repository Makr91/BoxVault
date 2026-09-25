import fs from 'fs';
import { dirname, join } from 'path';
import { getSecureBoxPath, getStorageRoot, renameDirectory } from '../../utils/paths.js';
import { ensureDirSync } from '../../utils/fsHelper.js';
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
import { snakeKeys } from '../../utils/wire.js';
import { withinReach } from '../../utils/orgMembership.js';
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
const RESERVED_PRODUCT_NAMES = new Set(['pending', 'duplicates']);

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

const plainOf = row => (typeof row.get === 'function' ? row.get({ plain: true }) : row);

/**
 * The date a release shipped: its `release` patch's released_at, else the
 * earliest released_at among its patches, else null. The release row keeps
 * no date of its own; the patches carry them.
 * @param {Object} release - A release row with nested patches
 * @returns {string|null} A full-date string, or null
 */
const releaseDateOf = release => {
  const patches = (release.patches || []).map(plainOf);
  const own = patches.find(patch => patch.name === 'release' && patch.releasedAt);
  if (own) {
    return own.releasedAt;
  }
  const dated = patches
    .map(patch => patch.releasedAt)
    .filter(Boolean)
    .sort();
  return dated[0] || null;
};

/**
 * The date a product last shipped: the latest release date among its
 * releases, else null.
 * @param {Object} download - A download row with nested releases and patches
 * @returns {string|null} A full-date string, or null
 */
const latestReleaseDateOf = download =>
  (download.releases || []).map(releaseDateOf).filter(Boolean).sort().pop() || null;

/**
 * A release's JSON with its released_at and each patch's JSON as given.
 * @param {Object} release - A release row with nested patches
 * @param {Function} patchJson - Maps a patch row to its JSON
 * @returns {Object} The release JSON
 */
const releaseJson = (release, patchJson) => ({
  ...snakeKeys(plainOf(release)),
  released_at: releaseDateOf(release),
  patches: (release.patches || []).map(patchJson),
});

/**
 * The file rows with their downloadCount kept for a member of the
 * organization and answered null to anyone else.
 * @param {Array<Object>} files - File rows or their JSON
 * @param {boolean} member - Whether the caller belongs to the organization
 * @returns {Array<Object>} The files as JSON
 */
const filesWithCounts = (files, member) =>
  (files || []).map(file => {
    const plain = snakeKeys(typeof file.get === 'function' ? file.get({ plain: true }) : file);
    plain.download_count = member ? file.downloadCount : null;
    delete plain.storage_path;
    delete plain.original;
    delete plain.links_to;
    return plain;
  });

/**
 * The files of a patch within a reach, the chain release, patch, file judged
 * at every row.
 * @param {Object} release - The release row
 * @param {Object} patch - The patch row with nested files
 * @param {number} reach - From reachOf
 * @returns {Array<Object>} The file rows the reach meets
 */
const filesWithinReach = (release, patch, reach) =>
  (patch.files || []).filter(file => withinReach(reach, release, patch, file));

/**
 * The releases of a product within a reach, each with the patches within it
 * and each patch with the files within it, the chain product, release,
 * patch, file judged at every row.
 * @param {Object} download - A download row with nested releases, patches and files
 * @param {number} reach - From reachOf
 * @returns {Array<Object>} The release rows the reach meets, narrowed beneath the same way
 */
const releasesWithinReach = (download, reach) =>
  (download.releases || [])
    .filter(release => withinReach(reach, release))
    .map(release => {
      release.patches = (release.patches || [])
        .filter(patch => withinReach(reach, release, patch))
        .map(patch => {
          patch.files = filesWithinReach(release, patch, reach);
          return patch;
        });
      return release;
    });

const FAMILY_MEMBERS = ['vendor', 'docsUrl', 'notesUrl', 'iconUrl'];

const snakeOf = member => member.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

/**
 * A product's JSON with its family's vendor, docs_url, notes_url and
 * icon_url standing in wherever the product's own member is empty, and
 * family_details carrying the family row it names; the product's own
 * columns are never written, so an override stays an override.
 * @param {Object} plain - The product JSON, snake_cased
 * @param {Map<string, Object>|undefined} families - The organization's family rows by name
 * @returns {Object} The product JSON with the inherited members filled
 */
const withFamily = (plain, families) => {
  const family = plain.family && families ? families.get(plain.family) : null;
  if (!family) {
    return plain;
  }
  const filled = { ...plain };
  FAMILY_MEMBERS.forEach(member => {
    if (!filled[snakeOf(member)]) {
      filled[snakeOf(member)] = family[member] ?? null;
    }
  });
  filled.family_details = {
    name: family.name,
    description: family.description ?? null,
    vendor: family.vendor ?? null,
    docs_url: family.docsUrl ?? null,
    notes_url: family.notesUrl ?? null,
    icon_url: family.iconUrl ?? null,
  };
  return filled;
};

/**
 * The product's JSON with its downloadCount and every nested file's
 * downloadCount answered by membership: the numbers to a member, null to
 * anyone else; only the releases, patches and files within the caller's
 * reach; the family's shared members filled in wherever the product's own
 * are empty.
 * @param {Object} download - A download row with nested releases, patches and files
 * @param {boolean} member - Whether the caller belongs to the organization
 * @param {number} reach - From reachOf
 * @param {Map<string, Object>} [families] - The organization's family rows by name
 * @returns {Object} The product JSON
 */
const withCounts = (download, member, reach, families) => {
  const plain = withFamily(snakeKeys(download.get({ plain: true })), families);
  const releases = releasesWithinReach(download, reach);
  plain.releases = releases.map(release =>
    releaseJson(release, patch => ({
      ...snakeKeys(patch.get({ plain: true })),
      files: filesWithCounts(patch.files, member),
    }))
  );
  plain.latest_release_at = latestReleaseDateOf({ releases });
  plain.download_count = member ? sumDownloadDownloads({ releases }) : null;
  return plain;
};

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
  ensureDirSync(dirname(linkPath));
  fs.symlinkSync(absolutePath(originalStoragePath), linkPath);
};

/**
 * Hand the bytes of an original to one of its links before the original goes
 * away: the heir's symlink is replaced by the bytes, every other link is
 * pointed at the heir, so a link never points at a link. A link that is
 * itself going away is chosen as heir only when no other link is left.
 * @param {Object} file - The original download_file row
 * @param {number[]} [leaving] - The ids of the rows being removed with it
 * @returns {Promise<Object|null>} The heir row, or null when the original has no links
 */
const promoteOriginal = async (file, leaving = []) => {
  const links = await DownloadFile.findAll({ where: { linksTo: file.id } });
  if (links.length === 0) {
    return null;
  }
  const staying = links.filter(link => !leaving.includes(link.id));
  const heir = staying[0] || links[0];
  const others = links.filter(link => link.id !== heir.id);
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
 * @param {number[]} [leaving] - The ids of the rows being removed with it
 * @returns {Promise<void>}
 */
const removeDownloadFile = async (file, leaving = []) => {
  if (!file.storagePath) {
    return;
  }
  if (file.original) {
    await promoteOriginal(file, leaving);
  }
  const fullPath = absolutePath(file.storagePath);
  if (fs.lstatSync(fullPath, { throwIfNoEntry: false })) {
    fs.unlinkSync(fullPath);
    log.file.info(`Download Physical Delete: Removed ${fullPath}.`);
  }
};

/**
 * removeDownloadFile over many rows, in order, because a promotion changes
 * which row owns the bytes the next removal sees; the bytes of an original go
 * to a link outside the batch whenever one exists.
 * @param {Array<Object>} files - The download_file rows
 * @returns {Promise<void>}
 */
const removeDownloadFiles = async files => {
  const leaving = files.map(file => file.id);
  const remove = async index => {
    if (index >= files.length) {
      return;
    }
    await files[index].reload();
    await removeDownloadFile(files[index], leaving);
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

/**
 * The three words of a row, the ones `reconcile` carries down: every word
 * the row holds off is turned off on every row beneath it.
 * @param {{isPublic: boolean, guestAccess: boolean, published: boolean}} row - The row
 * @returns {{isPublic: boolean, guestAccess: boolean, published: boolean}} Its words
 */
const ownWords = row => ({
  isPublic: row.isPublic,
  guestAccess: row.guestAccess,
  published: row.published,
});

/**
 * The product, release and patch an address names, each read in the
 * organization and beneath the row above it, the current row standing in for
 * every member the address leaves out; an address naming a product alone
 * looks the current release and patch up again under that product.
 * @param {{organizationId: number, download: Object, release?: Object, patch?: Object}} current - The rows the moving row sits under
 * @param {{download?: string, release?: string, patch?: string}} address - The target address
 * @returns {Promise<{download?: Object, release?: Object, patch?: Object, missing?: string}>} The target rows, or the level that was not found
 */
const resolveTarget = async (current, address) => {
  const download =
    address.download === undefined || address.download === current.download.name
      ? current.download
      : await Download.findOne({
          where: { name: address.download, organizationId: current.organizationId },
        });
  if (!download) {
    return { missing: 'download' };
  }
  if (!current.release) {
    return { download };
  }
  const versionNumber = address.release ?? current.release.versionNumber;
  const release =
    download.id === current.download.id && versionNumber === current.release.versionNumber
      ? current.release
      : await DownloadRelease.findOne({ where: { versionNumber, downloadId: download.id } });
  if (!release) {
    return { missing: 'release' };
  }
  if (!current.patch) {
    return { download, release };
  }
  const patchName = address.patch ?? current.patch.name;
  const patch =
    release.id === current.release.id && patchName === current.patch.name
      ? current.patch
      : await DownloadPatch.findOne({ where: { name: patchName, downloadReleaseId: release.id } });
  if (!patch) {
    return { missing: 'patch' };
  }
  return { download, release, patch };
};

/**
 * Move one file row under another patch: its bytes or its symlink go to the
 * target directory, the row takes the new storagePath and patch, and every
 * link pointing at an original is re-created against the new path.
 * @param {string} organization - Organization name
 * @param {Object} file - The download_file row
 * @param {{download: Object, release: Object, patch: Object}} target - The rows it moves under
 * @returns {Promise<Object>} The updated row
 */
const relocateFile = async (organization, file, target) => {
  const payload = { downloadPatchId: target.patch.id };
  if (file.storagePath) {
    const newStoragePath = storagePathFor(
      organization,
      target.download.name,
      target.release.versionNumber,
      target.patch.name,
      file.fileName
    );
    const oldPath = absolutePath(file.storagePath);
    const newPath = absolutePath(newStoragePath);
    if (oldPath !== newPath && fs.lstatSync(oldPath, { throwIfNoEntry: false })) {
      ensureDirSync(dirname(newPath));
      fs.renameSync(oldPath, newPath);
    }
    payload.storagePath = newStoragePath;
  }
  const updated = await file.update(payload);
  if (payload.storagePath && updated.original) {
    await relinkTo(updated);
  }
  return updated;
};

/**
 * Move one patch row under another release, renaming it on the way when a
 * name is given: its directory moves with it and every stored path beneath it
 * follows.
 * @param {string} organization - Organization name
 * @param {Object} patch - The download_patch row
 * @param {{download: Object, release: Object}} from - The rows it sits under
 * @param {{download: Object, release: Object}} target - The rows it moves under
 * @param {string} [name] - Its new name, the current one when absent
 * @returns {Promise<Object>} The updated row
 */
const relocatePatch = async (organization, patch, from, target, name = patch.name) => {
  const oldName = patch.name;
  const oldFilePath = getSecureDownloadPath(
    organization,
    from.download.name,
    from.release.versionNumber,
    oldName
  );
  const newFilePath = getSecureDownloadPath(
    organization,
    target.download.name,
    target.release.versionNumber,
    name
  );
  const updated = await patch.update({ name, downloadReleaseId: target.release.id });
  if (oldFilePath !== newFilePath && fs.existsSync(oldFilePath)) {
    renameDirectory(oldFilePath, newFilePath);
    await renameStoragePaths(
      storagePathFor(organization, from.download.name, from.release.versionNumber, oldName),
      storagePathFor(organization, target.download.name, target.release.versionNumber, name)
    );
  }
  return updated;
};

export {
  PENDING_SEGMENT,
  isReservedProductName,
  ownWords,
  resolveTarget,
  relocateFile,
  relocatePatch,
  getSecureDownloadPath,
  storagePathFor,
  absolutePath,
  getPendingPath,
  pendingStoragePathFor,
  pendingGuess,
  pendingSummary,
  sumDownloadDownloads,
  releaseDateOf,
  latestReleaseDateOf,
  releaseJson,
  withFamily,
  filesWithCounts,
  filesWithinReach,
  releasesWithinReach,
  withCounts,
  findOriginalByChecksum,
  promoteOriginal,
  removeDownloadFile,
  removeDownloadFiles,
  relinkTo,
  renameStoragePaths,
};
