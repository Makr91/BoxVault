// helpers.js
const fs = require('fs');
const yaml = require('js-yaml');
const { getConfigPath } = require('../../utils/config-loader');
const { atomicWriteFile } = require('../../utils/atomic-file-writer');

const configPaths = {
  app: getConfigPath('app'),
  auth: getConfigPath('auth'),
  db: getConfigPath('db'),
  mail: getConfigPath('mail'),
};

let authorizedSetupToken = null; // Store the authorized token in memory

const readConfig = filePath =>
  new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        return reject(err);
      }
      try {
        const yamlData = yaml.load(data);
        return resolve(yamlData);
      } catch (parseErr) {
        return reject(parseErr);
      }
    });
  });

const writeConfig = (filePath, data) => {
  const yamlData = yaml.dump(data);
  return atomicWriteFile(filePath, yamlData, 'utf8');
};

const getAuthorizedSetupToken = () => authorizedSetupToken;

const setAuthorizedSetupToken = token => {
  authorizedSetupToken = token;
};

module.exports = {
  configPaths,
  readConfig,
  writeConfig,
  getAuthorizedSetupToken,
  setAuthorizedSetupToken,
};
