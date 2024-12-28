const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { spawn } = require('child_process');
const configFiles = {
  app: path.join(__dirname, '../config/app.config.yaml'),
  auth: path.join(__dirname, '../config/auth.config.yaml'),
  db: path.join(__dirname, '../config/db.config.yaml'),
  mail: path.join(__dirname, '../config/mail.config.yaml'),
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

exports.getGravatarConfig = async (req, res) => {
  try {
    const data = await readConfig(configFiles.app);
    if (data && data.gravatar) {
      res.send({ gravatar: data.gravatar });
    } else {
      res.status(404).send({ message: "Gravatar configuration not found." });
    }
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

exports.restartServer = (req, res) => {
  console.log('Restarting BoxVault server...');
  
  // Fire and forget - don't wait for response
  spawn('sudo', ['service', 'boxvault', 'restart'], {
    detached: true,
    stdio: 'ignore'
  });

  // Send response immediately since server will be killed
  res.status(200).json({ message: 'Server restart initiated' });
};
