// helpers.js
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

/**
 * Validate that file path is within allowed config directories
 * @param {string} filePath - The file path to validate
 * @returns {boolean} True if path is safe
 */
const isValidConfigPath = filePath => {
  const allowedDirs = [
    process.env.CONFIG_DIR || '/etc/boxvault',
    path.join(__dirname, '../config'),
  ];

  const resolvedPath = path.resolve(filePath);
  return allowedDirs.some(dir => resolvedPath.startsWith(path.resolve(dir)));
};

const writeConfig = (filePath, data) =>
  new Promise((resolve, reject) => {
    // Validate path before writing
    if (!isValidConfigPath(filePath)) {
      reject(new Error('Invalid config file path'));
      return;
    }

    const yamlData = yaml.dump(data);
    fs.writeFile(filePath, yamlData, 'utf8', err => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });

module.exports = {
  writeConfig,
};
