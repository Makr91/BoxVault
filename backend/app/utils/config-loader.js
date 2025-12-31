const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const configDir = process.env.CONFIG_DIR || '/etc/boxvault';

/**
 * Get the appropriate config file path based on environment
 * @param {string} configName - Name of config file (without .config.yaml extension)
 * @returns {string} Full path to config file
 */
const getConfigPath = configName => {
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
    console.error(`Failed to load ${configName} configuration from ${configPath}:`, error.message);
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

module.exports = {
  getConfigPath,
  loadConfig,
  loadConfigs,
  getSetupTokenPath,
};
