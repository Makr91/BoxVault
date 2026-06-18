// g:\Projects\BoxVault\backend\app\controllers\iso\helpers.js
import fs from 'fs';
import { join } from 'path';
import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';

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

  // Validate that the joined path is still within the root directory
  if (!fullPath.startsWith(root)) {
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

export { getIsoStorageRoot, getSecureIsoPath, cleanupTempFile };
