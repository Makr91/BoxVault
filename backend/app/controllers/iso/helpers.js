// g:\Projects\BoxVault\backend\app\controllers\iso\helpers.js
const path = require('path');
const { loadConfig } = require('../../utils/config-loader');

const getIsoStorageRoot = () => {
  const appConfig = loadConfig('app');
  const storageDir = appConfig.boxvault.box_storage_directory.value;
  return path.join(storageDir, 'iso');
};

module.exports = { getIsoStorageRoot };
