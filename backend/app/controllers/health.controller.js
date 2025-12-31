const { loadConfig } = require('../utils/config-loader');
const db = require('../models');
const fs = require('fs');
const path = require('path');

const getHealth = async (req, res) => {
  void req;
  try {
    const appConfig = loadConfig('app');

    const environment = process.env.NODE_ENV || 'development';

    let version = '0.0.0';
    try {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')
      );
      const { version: pkgVersion } = packageJson;
      version = pkgVersion;
    } catch (err) {
      void err;
    }

    const frontendLogging = appConfig.frontend_logging || {
      enabled: { value: true },
      level: { value: 'info' },
      categories: {
        app: { value: 'info' },
        auth: { value: 'info' },
        api: { value: 'info' },
        file: { value: 'info' },
        component: { value: 'debug' },
      },
    };

    const loggingConfig = {
      enabled: frontendLogging.enabled.value,
      level: frontendLogging.level.value,
      categories: {
        app: frontendLogging.categories.app?.value || 'info',
        auth: frontendLogging.categories.auth?.value || 'info',
        api: frontendLogging.categories.api?.value || 'info',
        file: frontendLogging.categories.file?.value || 'info',
        component: frontendLogging.categories.component?.value || 'debug',
      },
    };

    let dbStatus = 'ok';
    try {
      await db.sequelize.authenticate();
    } catch (error) {
      void error;
      dbStatus = 'error';
    }

    let storageStatus = 'ok';
    try {
      const storageDir = appConfig.boxvault.box_storage_directory.value;
      if (!fs.existsSync(storageDir)) {
        storageStatus = 'error';
      }
    } catch (error) {
      void error;
      storageStatus = 'unknown';
    }

    return res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version,
      environment,
      frontend_logging: loggingConfig,
      services: {
        database: dbStatus,
        storage: storageStatus,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      message: 'Health check failed',
      error: error.message,
    });
  }
};

module.exports = {
  getHealth,
};
