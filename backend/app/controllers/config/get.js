// get.js
import { loadConfig, loadSchema } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import { maskSecrets } from './helpers.js';

/**
 * @swagger
 * /api/config/{configName}:
 *   get:
 *     summary: Get configuration by name
 *     description: Retrieve one configuration file as plain JSON with every writeOnly value of its schema masked as ********
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
 *               description: The plain configuration file, secrets masked
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
export const getConfig = (req, res) => {
  const { configName } = req.params;
  try {
    const data = loadConfig(configName);
    return res.send(maskSecrets(loadSchema(configName), data));
  } catch (err) {
    log.error.error('Error getting config:', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};
