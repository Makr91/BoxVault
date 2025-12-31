// check.js
const { log } = require('../../utils/Logger');
const { configPaths, readConfig } = require('./helpers');

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
  log.app.debug('Check setup complete', { method: req.method });

  try {
    const dbConfig = await readConfig(configPaths.db);
    const isConfigured =
      dbConfig.sql.dialect.value !== undefined &&
      dbConfig.sql.dialect.value !== null &&
      dbConfig.sql.dialect.value.trim() !== '';
    return res.send({ setupComplete: isConfigured });
  } catch (error) {
    log.error.error('Error checking setup status:', error);
    return res.status(500).send('Failed to check setup status');
  }
};
