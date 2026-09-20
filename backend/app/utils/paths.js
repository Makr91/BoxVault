import fs from 'fs';
import { dirname, join, resolve, sep } from 'path';
import { loadConfig } from './config-loader.js';

let STORAGE_ROOT;

/**
 * Get the storage root directory from config
 * @returns {string} The storage root path
 */
const getStorageRoot = () => {
  if (!STORAGE_ROOT) {
    try {
      const appConfig = loadConfig('app');
      STORAGE_ROOT = appConfig.boxvault.box_storage_directory;
    } catch {
      // Fallback to default if config not available
      STORAGE_ROOT = '/var/lib/boxvault/storage';
    }
  }
  return STORAGE_ROOT;
};

/**
 * Check whether a target path is contained within a root directory.
 * Resolves both paths and requires the target to be the root itself or a
 * descendant separated by a path separator (so /root-evil never matches /root).
 * @param {string} rootDir - The containing directory
 * @param {string} targetPath - The path to test
 * @returns {boolean} True if targetPath is rootDir or inside it
 */
const isPathInside = (rootDir, targetPath) => {
  const resolvedRoot = resolve(rootDir);
  const resolvedTarget = resolve(targetPath);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(resolvedRoot + sep);
};

/**
 * Securely construct a path within the box storage directory
 * Prevents path traversal attacks by validating the final path
 * @param {...string} pathSegments - Path segments to join
 * @returns {string} Secure path within storage root
 * @throws {Error} If path traversal attempt detected
 */
const getSecureBoxPath = (...pathSegments) => {
  const root = getStorageRoot();
  const fullPath = join(root, ...pathSegments);

  // Validate that the joined path is still within the root directory
  if (!isPathInside(root, fullPath)) {
    throw new Error('Path traversal attempt detected');
  }

  return fullPath;
};

/**
 * Whether two existing paths are the one directory, which a case-insensitive
 * filesystem answers for a name differing only in case.
 * @param {string} first - An existing path
 * @param {string} second - An existing path
 * @returns {boolean} True while both name the same entry
 */
const isSameEntry = (first, second) => {
  const left = fs.statSync(first, { throwIfNoEntry: false });
  const right = fs.statSync(second, { throwIfNoEntry: false });
  return Boolean(left && right && left.ino === right.ino && left.dev === right.dev);
};

/**
 * Move a storage directory to a new name: a rename differing only in case goes
 * through a temporary name so a case-insensitive filesystem keeps the
 * contents, any other target is replaced. A missing source or an unchanged
 * name does nothing.
 * @param {string} oldPath - The directory's current path
 * @param {string} newPath - The directory's new path
 * @returns {void}
 */
const renameDirectory = (oldPath, newPath) => {
  if (oldPath === newPath || !fs.existsSync(oldPath)) {
    return;
  }
  fs.mkdirSync(dirname(newPath), { recursive: true });
  if (fs.existsSync(newPath)) {
    if (isSameEntry(oldPath, newPath)) {
      const staging = `${newPath}.${process.pid}.renaming`;
      fs.renameSync(oldPath, staging);
      fs.renameSync(staging, newPath);
      return;
    }
    fs.rmSync(newPath, { recursive: true, force: true });
  }
  fs.renameSync(oldPath, newPath);
};

export { getStorageRoot, getSecureBoxPath, isPathInside, isSameEntry, renameDirectory };
