// g:\Projects\BoxVault\backend\app\controllers\iso\helpers.js
const path = require('path');
const { loadConfig } = require('../../utils/config-loader');

const getIsoStorageRoot = () => {
  const appConfig = loadConfig('app');

  if (appConfig.boxvault?.iso_storage_directory?.value) {
    return appConfig.boxvault.iso_storage_directory.value;
  }

  const storageDir = appConfig.boxvault.box_storage_directory.value;
  return path.join(storageDir, 'iso');
};

const getSecureIsoPath = (...pathSegments) => {
  const root = getIsoStorageRoot();
  const fullPath = path.join(root, ...pathSegments);

  // Validate that the joined path is still within the root directory
  if (!fullPath.startsWith(root)) {
    throw new Error('Path traversal attempt detected');
  }

  return fullPath;
};

module.exports = { getIsoStorageRoot, getSecureIsoPath };
