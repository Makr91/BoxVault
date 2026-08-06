// helpers.js
import fs from 'fs';
import { dump } from 'js-yaml';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { isPathInside } from '../../utils/paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Validate that file path is within allowed config directories
 * @param {string} filePath - The file path to validate
 * @returns {boolean} True if path is safe
 */
const isValidConfigPath = filePath => {
  const allowedDirs = [process.env.CONFIG_DIR || '/etc/boxvault', join(__dirname, '../../config')];

  return allowedDirs.some(dir => isPathInside(dir, filePath));
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

// Secret masking (#44): every knob node with `type: password` has its value
// replaced by this sentinel in HTTP READ responses only — the YAML on disk
// always keeps the real, hand-editable value.
const SECRET_SENTINEL = '********';

const isPlainObject = node => node && typeof node === 'object' && !Array.isArray(node);

/**
 * Deep-clone a config tree, masking every password-typed knob value.
 * @param {Object} node - Parsed config (sub)tree
 * @returns {Object} Masked clone
 */
const maskSecrets = node => {
  if (!isPlainObject(node)) {
    return node;
  }

  const clone = Array.isArray(node) ? [...node] : {};
  for (const [key, value] of Object.entries(node)) {
    clone[key] = maskSecrets(value);
  }

  if (clone.type === 'password' && typeof clone.value === 'string' && clone.value !== '') {
    clone.value = SECRET_SENTINEL;
  }

  return clone;
};

/**
 * Walk an incoming config update alongside the currently-stored config and
 * put the real stored value back wherever the client sent the sentinel (or an
 * empty string) for a password-typed knob — sentinel/blank = "unchanged".
 * Mutates `incoming` in place.
 * @param {Object} incoming - Request body (untrusted)
 * @param {Object} existing - Currently-stored config at the same level
 */
const restoreSecretSentinels = (incoming, existing) => {
  if (!isPlainObject(incoming) || !isPlainObject(existing)) {
    return;
  }

  // Trust the STORED node's type, never the client's, to decide secret-ness.
  if (
    existing.type === 'password' &&
    Object.hasOwn(incoming, 'value') &&
    (incoming.value === SECRET_SENTINEL || incoming.value === '')
  ) {
    incoming.value = existing.value;
  }

  for (const key of Object.keys(incoming)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    if (Object.hasOwn(existing, key)) {
      restoreSecretSentinels(incoming[key], existing[key]);
    }
  }
};

export { writeConfig, maskSecrets, restoreSecretSentinels, SECRET_SENTINEL };
