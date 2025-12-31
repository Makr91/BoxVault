// update.js
const fs = require('fs');
const { getSetupTokenPath } = require('../../utils/config-loader');
const { log } = require('../../utils/Logger');
const { verifyAuthorizedToken } = require('./middleware');
const { configPaths, readConfig, writeConfig } = require('./helpers');

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
exports.updateConfigs = [
  verifyAuthorizedToken,
  async (req, res) => {
    const { configs } = req.body;

    try {
      // Prepare all config updates
      const configUpdates = await Promise.all(
        Object.entries(configs).map(async ([configName, configData]) => {
          if (configPaths[configName]) {
            const currentConfig = await readConfig(configPaths[configName]);
            const newConfig = { ...currentConfig, ...configData };

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

            return { path: configPaths[configName], config: newConfig };
          }
          return null;
        })
      );

      // Write all configs
      await Promise.all(
        configUpdates
          .filter(update => update !== null)
          .map(update => writeConfig(update.path, update.config))
      );

      // Remove the setup token file to prevent further setup
      const setupTokenPath = getSetupTokenPath();
      fs.unlinkSync(setupTokenPath);

      return res.send('Configuration updated successfully');
    } catch (error) {
      log.error.error('Error updating configuration:', error);
      return res.status(500).send('Failed to update configuration');
    }
  },
];
