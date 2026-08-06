import { join, resolve, sep } from 'path';
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
      STORAGE_ROOT = appConfig.boxvault.box_storage_directory.value;
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

export { getStorageRoot, getSecureBoxPath, isPathInside };
