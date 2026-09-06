import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { load } from 'js-yaml';
import { validateObject } from './validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONFIG_NAMES = ['app', 'auth', 'db', 'mail'];

const schemaCache = new Map();

/**
 * Get the appropriate config file path based on environment
 * @param {string} configName - Name of config file (without .config.yaml extension)
 * @returns {string} Full path to config file
 * @throws {Error} If config name is not in whitelist
 */
const getConfigPath = configName => {
  // Whitelist allowed config names to prevent path traversal
  if (!CONFIG_NAMES.includes(configName)) {
    throw new Error(`Invalid config name: ${configName}`);
  }

  if (process.env.NODE_ENV === 'production') {
    const configDir = process.env.CONFIG_DIR || '/etc/boxvault';
    return `${configDir}/${configName}.config.yaml`;
  }
  if (process.env.NODE_ENV === 'test') {
    return join(__dirname, `../config/${configName}.test.config.yaml`);
  }
  return join(__dirname, `../config/${configName}.dev.config.yaml`);
};

/**
 * The schema document shipped beside the code for one config file
 * @param {string} configName - Name of config file
 * @returns {Object} The parsed schema
 * @throws {Error} If config name is not in whitelist
 */
const loadSchema = configName => {
  if (!CONFIG_NAMES.includes(configName)) {
    throw new Error(`Invalid config name: ${configName}`);
  }
  if (!schemaCache.has(configName)) {
    const schemaPath = join(__dirname, `../config/schema/${configName}.schema.yaml`);
    schemaCache.set(configName, load(fs.readFileSync(schemaPath, 'utf8')));
  }
  return schemaCache.get(configName);
};

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const isMapSchema = property => isPlainObject(property.additionalProperties);

const isFreeSubtree = property =>
  property.type === 'object' && !property.properties && !isMapSchema(property);

const hasDefaults = property =>
  Object.values(property.properties || {}).some(
    child => Object.hasOwn(child, 'default') || (child.properties && hasDefaults(child))
  );

/**
 * A copy of `config` with every missing key that carries a `default` in
 * `schema` filled in; nested objects and the entries of a map are walked.
 * @param {Object} schema - An object schema
 * @param {Object} config - The plain file (sub)tree
 * @returns {Object} The filled copy
 */
const fillDefaults = (schema, config) => {
  const filled = { ...(isPlainObject(config) ? config : {}) };
  Object.entries(schema.properties || {}).forEach(([key, property]) => {
    const present = Object.hasOwn(filled, key);
    if (property.properties) {
      if (present || hasDefaults(property)) {
        filled[key] = fillDefaults(property, filled[key]);
      }
      return;
    }
    if (isMapSchema(property)) {
      if (!present && Object.hasOwn(property, 'default')) {
        filled[key] = structuredClone(property.default);
      }
      if (isPlainObject(filled[key]) && property.additionalProperties.properties) {
        filled[key] = Object.fromEntries(
          Object.entries(filled[key]).map(([name, entry]) => [
            name,
            fillDefaults(property.additionalProperties, entry),
          ])
        );
      }
      return;
    }
    if (!present && Object.hasOwn(property, 'default')) {
      filled[key] = structuredClone(property.default);
    }
  });
  return filled;
};

/**
 * The pointers of every key in `config` the schema does not know; a free
 * subtree and the entries of a map are never reported.
 * @param {Object} schema - An object schema
 * @param {Object} config - The plain file (sub)tree
 * @param {string} [base] - The pointer of `config`
 * @returns {string[]} JSON Pointers of unknown keys
 */
const unknownKeys = (schema, config, base = '') => {
  if (!isPlainObject(config)) {
    return [];
  }
  const properties = schema.properties || {};
  return Object.entries(config).flatMap(([key, value]) => {
    const pointer = `${base}/${key}`;
    const property = properties[key];
    if (!property) {
      return [pointer];
    }
    if (property.properties && !isFreeSubtree(property)) {
      return unknownKeys(property, value, pointer);
    }
    if (isMapSchema(property) && property.additionalProperties.properties) {
      return Object.entries(isPlainObject(value) ? value : {}).flatMap(([name, entry]) =>
        unknownKeys(property.additionalProperties, entry, `${pointer}/${name}`)
      );
    }
    return [];
  });
};

/**
 * Evaluate one plain file against its schema.
 * @param {string} configName - Name of config file
 * @param {Object} config - The plain file, defaults filled
 * @returns {Array<{pointer: string, rule: string, params: Object}>} One entry per failing value
 */
const validateConfig = (configName, config) => validateObject(loadSchema(configName), config);

/**
 * Get mock configuration for test environment
 * @param {string} configName - Name of config file
 * @returns {Object} Mock config object
 */
const getMockConfig = configName => {
  const isSilent = process.env.SUPPRESS_LOGS === 'true';
  if (configName === 'app') {
    return {
      boxvault: {
        origin: 'http://localhost:3000',
        api_url: 'http://localhost:3000/api',
        box_max_file_size: 1,
        api_listen_port_unencrypted: 5000,
        api_listen_port_encrypted: 5001,
        box_storage_directory: '/tmp/boxvault/storage',
      },
      internationalization: {
        default_language: 'en',
        supported_languages: ['en'],
        auto_detect: true,
      },
      logging: {
        level: isSilent ? 'silent' : 'error',
        console_enabled: !isSilent,
      },
      rate_limiting: { window_minutes: 15, max_requests: 100000 },
      gravatar: {
        enabled: true,
        default: 'identicon',
      },
      ticket_system: {
        enabled: true,
        url: 'https://example.com/ticket',
      },
    };
  }
  if (configName === 'auth') {
    return {
      auth: {
        jwt: { jwt_secret: 'test-secret', jwt_expiration: '1h' },
        oidc: { providers: {} },
        local: {
          local_enabled: true,
          local_require_email_verification: false,
        },
      },
    };
  }
  if (configName === 'db') {
    return {
      sql: {
        dialect: 'sqlite',
        storage: ':memory:',
        logging: false,
      },
    };
  }
  return {};
};

/**
 * Read one plain YAML config file as it is on disk, without defaults
 * @param {string} configName - Name of config file
 * @returns {Object} Parsed config object
 * @throws {Error} If config file cannot be read or parsed
 */
const readConfigFile = configName => load(fs.readFileSync(getConfigPath(configName), 'utf8')) || {};

/**
 * Load and parse a YAML config file, every missing key filled from its
 * schema's `default`
 * @param {string} configName - Name of config file (without .config.yaml extension)
 * @returns {Object} Parsed config object
 * @throws {Error} If config file cannot be read or parsed
 */
const loadConfig = configName => {
  const configPath = getConfigPath(configName);

  try {
    const config = fillDefaults(loadSchema(configName), readConfigFile(configName));

    // In test environment, override logging config to respect SUPPRESS_LOGS
    if (process.env.NODE_ENV === 'test' && configName === 'app') {
      const isSilent = process.env.SUPPRESS_LOGS === 'true';
      config.logging = {
        ...config.logging,
        level: isSilent ? 'silent' : 'error',
        console_enabled: !isSilent,
      };
    }
    return config;
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console -- Chicken-and-egg: Logger depends on config-loader, so console is the only option for config load errors at startup
      console.error('Failed to load configuration', {
        configName,
        configPath,
        error: error.message,
      });
    }
    // In test environment, return mock config to prevent crash
    if (process.env.NODE_ENV === 'test') {
      return getMockConfig(configName);
    }
    throw error;
  }
};

/**
 * Load multiple config files at once
 * @param {string[]} configNames - Array of config names
 * @returns {Object} Object with config names as keys and parsed configs as values
 */
const loadConfigs = configNames => {
  const configs = {};

  for (const configName of configNames) {
    configs[configName] = loadConfig(configName);
  }

  return configs;
};

/**
 * Evaluate every config file against its schema for boot: the failing
 * pointers and the unknown keys of each file, defaults filled first.
 * @returns {Array<{name: string, errors: Array<{pointer: string, rule: string, params: Object}>, unknown: string[]}>}
 */
const checkConfigs = () =>
  CONFIG_NAMES.map(name => {
    const schema = loadSchema(name);
    const file = readConfigFile(name);
    return {
      name,
      errors: validateConfig(name, fillDefaults(schema, file)),
      unknown: unknownKeys(schema, file),
    };
  });

/**
 * Get the setup token file path based on environment
 * @returns {string} Full path to setup token file
 */
const getSetupTokenPath = () => {
  if (process.env.NODE_ENV === 'production') {
    // Production: use CONFIG_DIR environment variable or default to /etc/boxvault/
    const setupConfigDir = process.env.CONFIG_DIR || '/etc/boxvault';
    return `${setupConfigDir}/setup.token`;
  }
  // Development: use relative path from project root
  return join(__dirname, '../../setup.token');
};

/**
 * Get rate limiting configuration with defaults
 * @returns {Object} Rate limiting configuration object
 */
const getRateLimitConfig = () => {
  try {
    const appConfig = loadConfig('app');
    return {
      window_minutes: appConfig.rate_limiting?.window_minutes || 15,
      // The configured YAML value is law — no silent floor (#16)
      max_requests: appConfig.rate_limiting?.max_requests || 1000,
      message:
        appConfig.rate_limiting?.message ||
        'Too many requests from this IP, please try again later.',
      skip_successful_requests: appConfig.rate_limiting?.skip_successful_requests || false,
      skip_failed_requests: appConfig.rate_limiting?.skip_failed_requests || false,
      file_operations_max_requests: appConfig.rate_limiting?.file_operations_max_requests || 2000,
      download_max_requests: appConfig.rate_limiting?.download_max_requests || 2000,
      download_link_max_requests: appConfig.rate_limiting?.download_link_max_requests || 100,
      architecture_operations_max_requests:
        appConfig.rate_limiting?.architecture_operations_max_requests || 500,
    };
  } catch (error) {
    // Return defaults if config not available
    // eslint-disable-next-line no-console -- Chicken-and-egg: Logger depends on config-loader, so console is the only option for config load errors at startup
    console.warn('Failed to load rate limiting config, using defaults:', error.message);
    return {
      window_minutes: 15,
      max_requests: 1000,
      message: 'Too many requests from this IP, please try again later.',
      skip_successful_requests: false,
      skip_failed_requests: false,
      file_operations_max_requests: 2000,
      download_max_requests: 2000,
      download_link_max_requests: 100,
      architecture_operations_max_requests: 500,
    };
  }
};

/**
 * Get internationalization (i18n) configuration with defaults
 * @returns {Object} i18n configuration object
 */
const getI18nConfig = () => {
  try {
    const appConfig = loadConfig('app');
    return {
      default_language: appConfig.internationalization?.default_language || 'en',
      supported_languages: appConfig.internationalization?.supported_languages || [], // Auto-detected from files
      fallback_language: appConfig.internationalization?.fallback_language || 'en',
      auto_detect: appConfig.internationalization?.auto_detect !== false, // Default true
      force_language: appConfig.internationalization?.force_language || null,
    };
  } catch (error) {
    // Return defaults if config not available
    // eslint-disable-next-line no-console -- Chicken-and-egg: Logger depends on config-loader, so console is the only option for config load errors at startup
    console.warn('Failed to load i18n config, using defaults:', error.message);
    return {
      default_language: 'en',
      supported_languages: [], // Auto-detected from files
      fallback_language: 'en',
      auto_detect: true,
      force_language: null,
    };
  }
};

export {
  CONFIG_NAMES,
  getConfigPath,
  loadSchema,
  fillDefaults,
  unknownKeys,
  validateConfig,
  readConfigFile,
  loadConfig,
  loadConfigs,
  checkConfigs,
  getSetupTokenPath,
  getRateLimitConfig,
  getI18nConfig,
};

export default {
  CONFIG_NAMES,
  getConfigPath,
  loadSchema,
  fillDefaults,
  unknownKeys,
  validateConfig,
  readConfigFile,
  loadConfig,
  loadConfigs,
  checkConfigs,
  getSetupTokenPath,
  getRateLimitConfig,
  getI18nConfig,
};
