const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const configFiles = {
  app: path.join(__dirname, '../config/app.config.yaml'),
  auth: path.join(__dirname, '../config/auth.config.yaml'),
  db: path.join(__dirname, '../config/db.config.yaml'),
};

const readConfig = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        return reject(err);
      }
      try {
        const yamlData = yaml.load(data);
        resolve(yamlData);
      } catch (parseErr) {
        reject(parseErr);
      }
    });
  });
};

const writeConfig = (filePath, data) => {
  return new Promise((resolve, reject) => {
    const yamlData = yaml.dump(data);
    fs.writeFile(filePath, yamlData, 'utf8', (err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
};

exports.getConfig = async (req, res) => {
  const { configName } = req.params;
  const filePath = configFiles[configName];
  if (!filePath) {
    return res.status(404).send({ message: "Configuration not found." });
  }
  try {
    const data = await readConfig(filePath);
    res.send(data);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

exports.updateConfig = async (req, res) => {
  const { configName } = req.params;
  const filePath = configFiles[configName];
  if (!filePath) {
    return res.status(404).send({ message: "Configuration not found." });
  }
  try {
    await writeConfig(filePath, req.body);
    res.send({ message: "Configuration updated successfully." });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};