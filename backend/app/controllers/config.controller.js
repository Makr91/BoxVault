const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { spawn } = require('child_process');
const { loadConfig, getConfigPath } = require('../utils/config-loader');

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

/**
 * @swagger
 * /api/config/{configName}:
 *   get:
 *     summary: Get configuration by name
 *     description: Retrieve configuration data for a specific config type (app, auth, db, mail)
 *     tags: [Configuration]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: configName
 *         required: true
 *         schema:
 *           type: string
 *           enum: [app, auth, db, mail]
 *         description: Configuration type to retrieve
 *         example: app
 *     responses:
 *       200:
 *         description: Configuration retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Configuration data (structure varies by config type)
 *               additionalProperties: true
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
exports.getConfig = async (req, res) => {
  const { configName } = req.params;
  try {
    const data = loadConfig(configName);
    res.send(data);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

/**
 * @swagger
 * /api/config/{configName}:
 *   put:
 *     summary: Update configuration by name
 *     description: Update configuration data for a specific config type. Requires admin privileges.
 *     tags: [Configuration]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: configName
 *         required: true
 *         schema:
 *           type: string
 *           enum: [app, auth, db, mail]
 *         description: Configuration type to update
 *         example: app
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Configuration data to update (structure varies by config type)
 *             additionalProperties: true
 *             example:
 *               boxvault:
 *                 api_url:
 *                   value: "https://api.example.com"
 *     responses:
 *       200:
 *         description: Configuration updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Admin privileges required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
exports.updateConfig = async (req, res) => {
  const { configName } = req.params;
  try {
    // For updates, we still need to write to the actual file path
    const filePath = getConfigPath(configName);
    await writeConfig(filePath, req.body);
    res.send({ message: "Configuration updated successfully." });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

/**
 * @swagger
 * /api/config/gravatar:
 *   get:
 *     summary: Get Gravatar configuration
 *     description: Retrieve Gravatar-specific configuration settings from the app config
 *     tags: [Configuration]
 *     security:
 *       - JwtAuth: []
 *     responses:
 *       200:
 *         description: Gravatar configuration retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GravatarConfigResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Gravatar configuration not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
exports.getGravatarConfig = async (req, res) => {
  try {
    const data = loadConfig('app');
    if (data && data.gravatar) {
      res.send({ gravatar: data.gravatar });
    } else {
      res.status(404).send({ message: "Gravatar configuration not found." });
    }
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

/**
 * @swagger
 * /api/config/restart-server:
 *   post:
 *     summary: Restart the BoxVault server
 *     description: |
 *       **⚠️ DANGEROUS OPERATION ⚠️**
 *       
 *       Initiates a server restart using system service management. This will:
 *       - Terminate all active connections
 *       - Stop the current server process
 *       - Restart the BoxVault service
 *       - Cause temporary service unavailability
 *       
 *       **Use with extreme caution!** Only use this endpoint when necessary for applying critical configuration changes that require a server restart.
 *     tags: [Configuration]
 *     security:
 *       - JwtAuth: []
 *     responses:
 *       200:
 *         description: Server restart initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Server restart initiated"
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Admin privileges required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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
