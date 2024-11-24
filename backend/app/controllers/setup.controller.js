const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const { uploadSSLFileMiddleware } = require("../middleware/upload");

const configPaths = {
  app: path.join(__dirname, '../config/app.config.yaml'),
  auth: path.join(__dirname, '../config/auth.config.yaml'),
  db: path.join(__dirname, '../config/db.config.yaml'),
  mail: path.join(__dirname, '../config/mail.config.yaml'),
};

const setupTokenPath = path.join(__dirname, '../setup.token');
let authorizedSetupToken = null; // Store the authorized token in memory

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

exports.verifySetupToken = (req, res) => {
  const { token } = req.body;

  if (!fs.existsSync(setupTokenPath)) {
    return res.status(403).send('Setup is not allowed');
  }

  const storedToken = fs.readFileSync(setupTokenPath, 'utf8');
  if (token !== storedToken) {
    return res.status(403).send('Invalid setup token');
  }

  // Generate an authorized token (for simplicity, we'll use the same token)
  authorizedSetupToken = storedToken;
  res.json({ authorizedSetupToken }); // Return the token in the response body
};

const verifyAuthorizedToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Extract the token from the Bearer header

  if (!token || token !== authorizedSetupToken) {
    return res.status(403).send('Invalid authorization token');
  }
  next();
};

exports.uploadSSL = [verifyAuthorizedToken, async (req, res) => {
  try {
    await uploadSSLFileMiddleware(req, res);
    const { file } = req;
    if (!file) {
      return res.status(400).send({ message: "No file uploaded!" });
    }

    const filePath = path.join('/config/ssl', file.originalname);

    let certPath, keyPath;
    if (file.originalname.endsWith('.crt')) {
      certPath = filePath;
    } else if (file.originalname.endsWith('.key')) {
      keyPath = filePath;
    }

    res.status(200).send({ certPath, keyPath });
  } catch (error) {
    console.error('Error uploading SSL certificate:', error);
    res.status(500).send({ message: "Failed to upload SSL certificate." });
  }
}];


exports.updateConfigs = [verifyAuthorizedToken, async (req, res) => {
  const { configs } = req.body;

  try {
    for (const [configName, configData] of Object.entries(configs)) {
      if (configPaths[configName]) {
        const currentConfig = await readConfig(configPaths[configName]);
        const newConfig = { ...currentConfig, ...configData };
        await writeConfig(configPaths[configName], newConfig);
      }
    }

    // Remove the setup token file to prevent further setup
    fs.unlinkSync(setupTokenPath);

    res.send('Configuration updated successfully');
  } catch (error) {
    console.error('Error updating configuration:', error);
    res.status(500).send('Failed to update configuration');
  }
}];

exports.getConfigs = [verifyAuthorizedToken, async (req, res) => {
  try {
    const dbConfig = await readConfig(configPaths.db);
    const appConfig = await readConfig(configPaths.app);
    const mailConfig = await readConfig(configPaths.mail);
    const authConfig = await readConfig(configPaths.auth);
    res.send({
      configs: {
        db: dbConfig,
        app: appConfig,
        mail: mailConfig,
        auth: authConfig,
      }
    });
  } catch (error) {
    console.error('Error reading configurations:', error);
    res.status(500).send('Failed to read configurations');
  }
}];

exports.isSetupComplete = async (req, res) => {
  try {
    const dbConfig = await readConfig(configPaths.db);
    const isConfigured = dbConfig.sql.dialect.value !== undefined && dbConfig.sql.dialect.value !== null && dbConfig.sql.dialect.value.trim() !== '';
    res.send({ setupComplete: isConfigured });
  } catch (error) {
    console.error('Error checking setup status:', error);
    res.status(500).send('Failed to check setup status');
  }
};