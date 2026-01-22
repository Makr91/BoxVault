// helpers.js
import fs from 'fs';
import { dump } from 'js-yaml';
import { join, resolve as _resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Validate that file path is within allowed config directories
 * @param {string} filePath - The file path to validate
 * @returns {boolean} True if path is safe
 */
const isValidConfigPath = filePath => {
  const allowedDirs = [process.env.CONFIG_DIR || '/etc/boxvault', join(__dirname, '../../config')];

  const resolvedPath = _resolve(filePath);
  return allowedDirs.some(dir => resolvedPath.startsWith(_resolve(dir)));
};

const writeConfig = (filePath, data) =>
  new Promise((resolve, reject) => {
    // Validate path before writing
    if (!isValidConfigPath(filePath)) {
      reject(new Error('Invalid config file path'));
      return;
    }

    const yamlData = dump(data);
    fs.writeFile(filePath, yamlData, 'utf8', err => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });

export { writeConfig };
