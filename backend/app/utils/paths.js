const path = require('path');
const { loadConfig } = require('./config-loader');

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
 * Securely construct a path within the box storage directory
 * Prevents path traversal attacks by validating the final path
 * @param {...string} pathSegments - Path segments to join
 * @returns {string} Secure path within storage root
 * @throws {Error} If path traversal attempt detected
 */
const getSecureBoxPath = (...pathSegments) => {
  const root = getStorageRoot();
  const fullPath = path.join(root, ...pathSegments);

  // Validate that the joined path is still within the root directory
  if (!fullPath.startsWith(root)) {
    throw new Error('Path traversal attempt detected');
  }

  return fullPath;
};

module.exports = {
  getStorageRoot,
  getSecureBoxPath,
};
