// get.js
const { log } = require('../../utils/Logger');
const { verifyAuthorizedToken } = require('./middleware');
const { configPaths, readConfig } = require('./helpers');

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
exports.getConfigs = [
  verifyAuthorizedToken,
  async (req, res) => {
    log.app.debug('Get configs request', { method: req.method, path: req.path });

    try {
      const dbConfig = await readConfig(configPaths.db);
      const appConfig = await readConfig(configPaths.app);
      const mailConfig = await readConfig(configPaths.mail);
      const authConfig = await readConfig(configPaths.auth);
      return res.send({
        configs: {
          db: dbConfig,
          app: appConfig,
          mail: mailConfig,
          auth: authConfig,
        },
      });
    } catch (error) {
      log.error.error('Error reading configurations:', error);
      return res.status(500).send(req.__('setup.readError'));
    }
  },
];
