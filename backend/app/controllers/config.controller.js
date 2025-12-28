const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { loadConfig, getConfigPath } = require('../utils/config-loader');
const { log } = require('../utils/Logger');

const readConfig = filePath =>
  new Promise((resolve, reject) => {
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

const writeConfig = (filePath, data) =>
  new Promise((resolve, reject) => {
    const yamlData = yaml.dump(data);
    fs.writeFile(filePath, yamlData, 'utf8', err => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });

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
    res.send({ message: 'Configuration updated successfully.' });
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
      res.status(404).send({ message: 'Gravatar configuration not found.' });
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
 *       Initiates a server restart using SystemD service management. This will:
 *       - Terminate all active connections
 *       - Stop the current server process
 *       - Restart the BoxVault service via SystemD
 *       - Cause temporary service unavailability
 *
 *       **Use with extreme caution!** Only use this endpoint when necessary for applying critical configuration changes that require a server restart.
 *
 *       The restart is performed by exiting the process with a failure code, which triggers SystemD's automatic restart mechanism configured with `Restart=on-failure`.
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
  log.app.info('Initiating server restart via process exit...');

  // Send response immediately before process exits
  res.status(200).json({ message: 'Server restart initiated' });

  // Close the response to ensure it's sent
  res.end();

  // Give a brief moment for the response to be sent
  setTimeout(() => {
    log.app.info('Exiting process to trigger SystemD restart...');
    process.exit(1); // EXIT_FAILURE - triggers SystemD Restart=on-failure
  }, 100);
};
