// helpers.js
import fs from 'fs';
import { load, dump } from 'js-yaml';
import { getConfigPath } from '../../utils/config-loader.js';
import { atomicWriteFile } from '../../utils/atomic-file-writer.js';

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
        const yamlData = load(data);
        return resolve(yamlData);
      } catch (parseErr) {
        return reject(parseErr);
      }
    });
  });

const writeConfig = (filePath, data) => {
  const yamlData = dump(data);
  return atomicWriteFile(filePath, yamlData, 'utf8');
};

const getAuthorizedSetupToken = () => authorizedSetupToken;

const setAuthorizedSetupToken = token => {
  authorizedSetupToken = token;
};

export { configPaths, readConfig, writeConfig, getAuthorizedSetupToken, setAuthorizedSetupToken };
