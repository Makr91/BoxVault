// helpers.js
const fs = require('fs');
const yaml = require('js-yaml');

const writeConfig = (filePath, data) =>
  new Promise((resolve, reject) => {
    const yamlData = yaml.dump(data);
    fs.writeFile(filePath, yamlData, 'utf8', err => {
      if (err) {
        return reject(err);
      }
      return resolve();
    });
  });

module.exports = {
  writeConfig,
};
