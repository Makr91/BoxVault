const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const configDir = process.env.CONFIG_DIR || '/etc/boxvault';

/**
 * Get the appropriate config file path based on environment
 * @param {string} configName - Name of config file (without .config.yaml extension)
 * @returns {string} Full path to config file
 * @throws {Error} If config name is not in whitelist
 */
const getConfigPath = configName => {
  // Whitelist allowed config names to prevent path traversal
  const allowedConfigs = ['app', 'auth', 'db', 'mail'];
  if (!allowedConfigs.includes(configName)) {
    throw new Error(`Invalid config name: ${configName}`);
  }

  if (process.env.NODE_ENV === 'production') {
    return `${configDir}/${configName}.config.yaml`;
  }
  return path.join(__dirname, `../config/${configName}.dev.config.yaml`);
};

/**
 * Load and parse a YAML config file
 * @param {string} configName - Name of config file (without .config.yaml extension)
 * @returns {Object} Parsed config object
 * @throws {Error} If config file cannot be read or parsed
 */
const loadConfig = configName => {
  const configPath = getConfigPath(configName);

  try {
    const fileContents = fs.readFileSync(configPath, 'utf8');
    return yaml.load(fileContents);
  } catch (error) {
    console.error('Failed to load configuration', { configName, configPath, error: error.message });
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
  return path.join(__dirname, '../../setup.token');
};

/**
 * Get rate limiting configuration with defaults
 * @returns {Object} Rate limiting configuration object
 */
const getRateLimitConfig = () => {
  try {
    const appConfig = loadConfig('app');
    return {
      window_minutes: appConfig.rate_limiting?.window_minutes?.value || 15,
      max_requests: Math.max(appConfig.rate_limiting?.max_requests?.value || 1000, 10000),
      message:
        appConfig.rate_limiting?.message?.value ||
        'Too many requests from this IP, please try again later.',
      skip_successful_requests: appConfig.rate_limiting?.skip_successful_requests?.value || false,
      skip_failed_requests: appConfig.rate_limiting?.skip_failed_requests?.value || false,
    };
  } catch (error) {
    // Return defaults if config not available
    console.warn('Failed to load rate limiting config, using defaults:', error.message);
    return {
      window_minutes: 15,
      max_requests: 10000,
      message: 'Too many requests from this IP, please try again later.',
      skip_successful_requests: false,
      skip_failed_requests: false,
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
      default_language: appConfig.internationalization?.default_language?.value || 'en',
      supported_languages: appConfig.internationalization?.supported_languages?.value || [], // Auto-detected from files
      fallback_language: appConfig.internationalization?.fallback_language?.value || 'en',
      auto_detect: appConfig.internationalization?.auto_detect?.value !== false, // Default true
      force_language: appConfig.internationalization?.force_language?.value || null,
    };
  } catch (error) {
    // Return defaults if config not available
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

module.exports = {
  getConfigPath,
  loadConfig,
  loadConfigs,
  getSetupTokenPath,
  getRateLimitConfig,
  getI18nConfig,
};
