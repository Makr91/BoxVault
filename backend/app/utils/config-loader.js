import fs from 'fs';
import { join } from 'path';
import { timingSafeEqual } from 'crypto';
import { load, get, save } from '../config/config-engine.js';
import {
  CONFIG_NAMES,
  PRODUCTION_CONFIG_DIR,
  SCHEMA_DIR,
  hooks,
  setConfigDir,
} from '../config/boxvault.js';
import { problem } from './problem.js';

const layout = { configDir: PRODUCTION_CONFIG_DIR, development: false };

/**
 * Read every configuration file through the engine; the first read of
 * configuration in the process, before the logger, the rate limiter and the
 * database take their values.
 * @returns {Promise<void>}
 */
const reloadConfig = async () => {
  Object.assign(layout, await load(PRODUCTION_CONFIG_DIR, CONFIG_NAMES, SCHEMA_DIR, hooks));
  setConfigDir(layout.configDir);
};

await reloadConfig();

const isProduction = !layout.development;

/**
 * The directory the config files, the setup token and the config backups live in
 * @returns {string} Full path of the config directory
 */
const getConfigDir = () => layout.configDir;

/**
 * The path of one configuration file
 * @param {string} configName - Name of config file (without .config.yaml extension)
 * @returns {string} Full path to config file
 * @throws {Error} If config name is not in the list
 */
const getConfigPath = configName => {
  if (!CONFIG_NAMES.includes(configName)) {
    throw new Error(`Invalid config name: ${configName}`);
  }
  return join(
    layout.configDir,
    layout.development ? `${configName}.dev.config.yaml` : `${configName}.config.yaml`
  );
};

/**
 * Get the setup token file path, beside the config files
 * @returns {string} Full path to setup token file
 */
const getSetupTokenPath = () => join(layout.configDir, 'setup.token');

const setupTokenMatches = token => {
  const tokenPath = getSetupTokenPath();
  if (typeof token !== 'string' || !fs.existsSync(tokenPath)) {
    return false;
  }
  const stored = Buffer.from(fs.readFileSync(tokenPath, 'utf8').trim(), 'utf8');
  const sent = Buffer.from(token, 'utf8');
  return stored.length > 0 && stored.length === sent.length && timingSafeEqual(stored, sent);
};

/**
 * The setup-token guard the engine mounts under auth.setup: the Authorization
 * Bearer must match the setup token file in constant time
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Next handler
 * @returns {*} The next handler's result, or the 403 problem body
 */
const setupTokenGuard = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!setupTokenMatches(token)) {
    return problem(res, req, { status: 403, type: 'forbidden' });
  }
  return next();
};

/**
 * One configuration file with every missing key filled from its schema's
 * default, copied from the engine's cache
 * @param {string} configName - Name of config file (without .config.yaml extension)
 * @returns {Object} The filled document
 * @throws {Error} If config name is not in the list
 */
const loadConfig = configName => get(configName);

/**
 * Write a JSON Merge Patch to one configuration file through the engine
 * @param {string} configName - Name of config file
 * @param {Object} patch - The merge patch
 * @param {string} actor - Who wrote it
 * @returns {Promise<Array<{pointer: string, title: string, reason: string}>>} The changed keys that need a restart
 */
const saveConfig = (configName, patch, actor) => save(configName, patch, actor);

/**
 * Get rate limiting configuration
 * @returns {Object} Rate limiting configuration object
 */
const getRateLimitConfig = () => loadConfig('app').rate_limiting;

/**
 * Get internationalization (i18n) configuration
 * @returns {Object} i18n configuration object
 */
const getI18nConfig = () => {
  const { internationalization } = loadConfig('app');
  return {
    ...internationalization,
    force_language: internationalization.force_language || null,
  };
};

export {
  CONFIG_NAMES,
  isProduction,
  getConfigDir,
  getConfigPath,
  getSetupTokenPath,
  setupTokenGuard,
  loadConfig,
  saveConfig,
  reloadConfig,
  getRateLimitConfig,
  getI18nConfig,
};

export default {
  CONFIG_NAMES,
  isProduction,
  getConfigDir,
  getConfigPath,
  getSetupTokenPath,
  setupTokenGuard,
  loadConfig,
  saveConfig,
  reloadConfig,
  getRateLimitConfig,
  getI18nConfig,
};
