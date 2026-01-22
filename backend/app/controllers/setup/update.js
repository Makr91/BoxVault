// update.js
import fs from 'fs';
import { getSetupTokenPath } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import { verifyAuthorizedToken } from './middleware.js';
import { configPaths, readConfig, writeConfig } from './helpers.js';

export const updateConfigs = [
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
      if (fs.existsSync(setupTokenPath)) {
        fs.unlinkSync(setupTokenPath);
      }

      return res.send(req.__('config.updated'));
    } catch (error) {
      log.error.error('Error updating configuration:', error);
      return res.status(500).send(req.__('config.updateError'));
    }
  },
];
