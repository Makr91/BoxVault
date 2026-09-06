// helpers.js
import { CONFIG_NAMES, getConfigPath } from '../../utils/config-loader.js';

const configPaths = Object.fromEntries(CONFIG_NAMES.map(name => [name, getConfigPath(name)]));

let authorizedSetupToken = null; // Store the authorized token in memory

const getAuthorizedSetupToken = () => authorizedSetupToken;

const setAuthorizedSetupToken = token => {
  authorizedSetupToken = token;
};

export { configPaths, getAuthorizedSetupToken, setAuthorizedSetupToken };
