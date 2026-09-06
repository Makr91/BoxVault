// get.js
import { CONFIG_NAMES, loadConfig, loadSchema } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import { verifyAuthorizedToken } from './middleware.js';
import { maskSecrets } from '../config/helpers.js';

/**
 * @swagger
 * /api/setup:
 *   get:
 *     summary: Get every configuration file for the setup page
 *     description: Every file named by status.config as plain JSON, defaults filled and writeOnly values masked, under the setup token.
 *     tags: [Setup]
 *     security:
 *       - JwtAuth: []
 *     responses:
 *       200:
 *         description: The configuration files
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 configs:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *       403:
 *         description: Invalid setup token
 *       500:
 *         description: Failed to read configurations
 */
export const getConfigs = [
  verifyAuthorizedToken,
  (req, res) => {
    log.app.debug('Get configs request', { method: req.method, path: req.path });

    try {
      const configs = Object.fromEntries(
        CONFIG_NAMES.map(name => [name, maskSecrets(loadSchema(name), loadConfig(name))])
      );
      return res.send({ configs });
    } catch (error) {
      log.error.error('Error reading configurations:', error);
      return res.status(500).send(req.__('setup.readError'));
    }
  },
];
