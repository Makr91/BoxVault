// get.js
import { log } from '../../utils/Logger.js';
import { verifyAuthorizedToken } from './middleware.js';
import { configPaths, readConfig } from './helpers.js';

export const getConfigs = [
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
