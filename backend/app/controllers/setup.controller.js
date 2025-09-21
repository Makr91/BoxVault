const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const { loadConfig, getConfigPath, getSetupTokenPath } = require('../utils/config-loader');
const { atomicWriteFile } = require('../utils/atomic-file-writer');

const configPaths = {
  app: getConfigPath('app'),
  auth: getConfigPath('auth'),
  db: getConfigPath('db'),
  mail: getConfigPath('mail'),
};

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

const writeConfig = async (filePath, data) => {
  const yamlData = yaml.dump(data);
  return atomicWriteFile(filePath, yamlData, 'utf8');
};

/**
 * @swagger
 * /api/setup/verify-token:
 *   post:
 *     summary: Verify setup token and get authorization
 *     description: Verify the initial setup token and receive an authorized token for subsequent setup operations
 *     tags: [Setup]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SetupTokenRequest'
 *     responses:
 *       200:
 *         description: Setup token verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SetupTokenResponse'
 *       403:
 *         description: Setup not allowed or invalid token
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "Invalid setup token"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
exports.verifySetupToken = (req, res) => {
  const { token } = req.body;
  const setupTokenPath = getSetupTokenPath();

  if (!fs.existsSync(setupTokenPath)) {
    return res.status(403).send('Setup is not allowed');
  }

  const storedToken = fs.readFileSync(setupTokenPath, 'utf8').trim();
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

/**
 * @swagger
 * /api/setup/upload-ssl:
 *   post:
 *     summary: Upload SSL certificate files
 *     description: Upload SSL certificate (.crt) or private key (.key) files for HTTPS configuration
 *     tags: [Setup]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: SSL certificate file (.crt) or private key file (.key)
 *     responses:
 *       200:
 *         description: SSL file uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 certPath:
 *                   type: string
 *                   description: Path to uploaded certificate file
 *                   example: "/config/ssl/server.crt"
 *                 keyPath:
 *                   type: string
 *                   description: Path to uploaded private key file
 *                   example: "/config/ssl/server.key"
 *       400:
 *         description: No file uploaded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "No file uploaded!"
 *       403:
 *         description: Invalid authorization token
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "Invalid authorization token"
 *       500:
 *         description: Failed to upload SSL certificate
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Failed to upload SSL certificate."
 */
exports.uploadSSL = [verifyAuthorizedToken, async (req, res) => {
  try {
    // Import upload middleware only when needed
    const { uploadSSLFileMiddleware } = require("../middleware/upload");
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
    log.error.error('Error uploading SSL certificate:', error);
    res.status(500).send({ message: "Failed to upload SSL certificate." });
  }
}];

/**
 * @swagger
 * /api/setup/update-configs:
 *   post:
 *     summary: Update system configurations
 *     description: Update BoxVault system configurations (database, app, mail, auth). This endpoint removes the setup token after successful update, preventing further setup operations.
 *     tags: [Setup]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ConfigUpdateRequest'
 *     responses:
 *       200:
 *         description: Configuration updated successfully
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "Configuration updated successfully"
 *       403:
 *         description: Invalid authorization token
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "Invalid authorization token"
 *       500:
 *         description: Failed to update configuration
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "Failed to update configuration"
 */
exports.updateConfigs = [verifyAuthorizedToken, async (req, res) => {
  const { configs } = req.body;

  try {
    for (const [configName, configData] of Object.entries(configs)) {
      if (configPaths[configName]) {
        const currentConfig = await readConfig(configPaths[configName]);
        let newConfig = { ...currentConfig, ...configData };
        
        // Handle database type selection for db config
        if (configName === 'db' && newConfig.database_type) {
          const dbType = newConfig.database_type.value;
          
          // Auto-set dialect based on database type
          if (newConfig.sql && newConfig.sql.dialect) {
            newConfig.sql.dialect.value = dbType;
          }
          
          // Note: SQLite directory creation is now handled in models/index.js
          // when Sequelize is initialized, ensuring proper timing
        }
        
        await writeConfig(configPaths[configName], newConfig);
      }
    }

    // Remove the setup token file to prevent further setup
    const setupTokenPath = getSetupTokenPath();
    fs.unlinkSync(setupTokenPath);

    res.send('Configuration updated successfully');
  } catch (error) {
    log.error.error('Error updating configuration:', error);
    res.status(500).send('Failed to update configuration');
  }
}];

/**
 * @swagger
 * /api/setup/get-configs:
 *   get:
 *     summary: Get current system configurations
 *     description: Retrieve current BoxVault system configurations for all config types (database, app, mail, auth)
 *     tags: [Setup]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configurations retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConfigResponse'
 *       403:
 *         description: Invalid authorization token
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "Invalid authorization token"
 *       500:
 *         description: Failed to read configurations
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "Failed to read configurations"
 */
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
    log.error.error('Error reading configurations:', error);
    res.status(500).send('Failed to read configurations');
  }
}];

/**
 * @swagger
 * /api/setup/is-setup-complete:
 *   get:
 *     summary: Check if initial setup is complete
 *     description: Check whether BoxVault has been properly configured by verifying database configuration
 *     tags: [Setup]
 *     responses:
 *       200:
 *         description: Setup status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 setupComplete:
 *                   type: boolean
 *                   description: Whether the initial setup has been completed
 *                   example: true
 *       500:
 *         description: Failed to check setup status
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "Failed to check setup status"
 */
exports.isSetupComplete = async (req, res) => {
  try {
    const dbConfig = await readConfig(configPaths.db);
    const isConfigured = dbConfig.sql.dialect.value !== undefined && dbConfig.sql.dialect.value !== null && dbConfig.sql.dialect.value.trim() !== '';
    res.send({ setupComplete: isConfigured });
  } catch (error) {
    log.error.error('Error checking setup status:', error);
    res.status(500).send('Failed to check setup status');
  }
};
