// helpers.js
import fs from 'fs';
import { dump } from 'js-yaml';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { isPathInside } from '../../utils/paths.js';
import { atomicWriteFile } from '../../utils/fsHelper.js';

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

/**
 * Write one plain config file atomically, keeping the previous content
 * beside it as `<file>.bak`.
 * @param {string} filePath - The config file path
 * @param {Object} data - The plain file object
 * @returns {Promise<void>}
 */
const writeConfig = async (filePath, data) => {
  if (!isValidConfigPath(filePath)) {
    throw new Error('Invalid config file path');
  }
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, `${filePath}.bak`);
  }
  await atomicWriteFile(filePath, dump(data), 'utf8');
};

// Secret masking (#44): every writeOnly value of the schema is replaced by
// this sentinel in HTTP READ responses only — the YAML on disk always keeps
// the real, hand-editable value.
const SECRET_SENTINEL = '********';

const isPlainObject = node => node && typeof node === 'object' && !Array.isArray(node);

const isMapSchema = property => isPlainObject(property?.additionalProperties);

/**
 * Deep-clone a plain config tree, masking every writeOnly value the schema names.
 * @param {Object} schema - The object schema of `node`
 * @param {Object} node - Parsed config (sub)tree
 * @returns {Object} Masked clone
 */
const maskSecrets = (schema, node) => {
  if (!isPlainObject(node)) {
    return node;
  }
  const properties = schema?.properties || {};
  const clone = {};
  for (const [key, value] of Object.entries(node)) {
    const property = properties[key];
    if (property?.writeOnly) {
      clone[key] = typeof value === 'string' && value !== '' ? SECRET_SENTINEL : value;
    } else if (property?.properties) {
      clone[key] = maskSecrets(property, value);
    } else if (isMapSchema(property) && isPlainObject(value)) {
      clone[key] = Object.fromEntries(
        Object.entries(value).map(([name, entry]) => [
          name,
          maskSecrets(property.additionalProperties, entry),
        ])
      );
    } else {
      clone[key] = structuredClone(value);
    }
  }
  return clone;
};

/**
 * Walk an incoming config update alongside the currently-stored config and
 * put the real stored value back wherever the client sent the sentinel (or an
 * empty string) for a writeOnly key of the schema — sentinel/blank = "unchanged".
 * Mutates `incoming` in place.
 * @param {Object} schema - The object schema of `incoming`
 * @param {Object} incoming - Request body (untrusted)
 * @param {Object} existing - Currently-stored config at the same level
 */
const restoreSecrets = (schema, incoming, existing) => {
  if (!isPlainObject(incoming) || !isPlainObject(existing)) {
    return;
  }
  const properties = schema?.properties || {};
  for (const key of Object.keys(incoming)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    const property = properties[key];
    if (!property || !Object.hasOwn(existing, key)) {
      continue;
    }
    if (property.writeOnly) {
      if (incoming[key] === SECRET_SENTINEL || incoming[key] === '') {
        incoming[key] = existing[key];
      }
    } else if (property.properties) {
      restoreSecrets(property, incoming[key], existing[key]);
    } else if (isMapSchema(property) && isPlainObject(incoming[key])) {
      Object.keys(incoming[key]).forEach(name => {
        restoreSecrets(property.additionalProperties, incoming[key][name], existing[key]?.[name]);
      });
    }
  }
};

/**
 * Whether any key the schema marks `requiresRestart` differs between two
 * plain config trees.
 * @param {Object} schema - The object schema
 * @param {Object} before - The stored config
 * @param {Object} after - The merged config
 * @returns {boolean}
 */
const requiresRestart = (schema, before, after) =>
  Object.entries(schema?.properties || {}).some(([key, property]) => {
    if (property.properties) {
      return requiresRestart(property, before?.[key], after?.[key]);
    }
    return (
      property.requiresRestart === true &&
      JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null)
    );
  });

/**
 * Deep-merge `source` into a copy of `target`, never following
 * prototype-polluting keys.
 * @param {Object} target - The base object
 * @param {Object} source - The overriding object
 * @returns {Object} The merged copy
 */
const mergeDeep = (target, source) => {
  const merged = isPlainObject(target) ? { ...target } : {};
  if (!isPlainObject(source)) {
    return merged;
  }
  for (const key of Object.keys(source)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    merged[key] =
      isPlainObject(source[key]) && isPlainObject(merged[key])
        ? mergeDeep(merged[key], source[key])
        : structuredClone(source[key]);
  }
  return merged;
};

export { writeConfig, maskSecrets, restoreSecrets, requiresRestart, mergeDeep, SECRET_SENTINEL };
