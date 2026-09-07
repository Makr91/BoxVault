// get.js
import { CONFIG_NAMES, loadConfig, loadSchema } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
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
 *       404:
 *         description: The name is not one of the files status.config lists
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: The file could not be read or parsed
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const getConfig = (req, res) => {
  const { configName } = req.params;
  if (!CONFIG_NAMES.includes(configName)) {
    return problem(res, req, { status: 404, type: 'not-found' });
  }
  try {
    const data = loadConfig(configName);
    return res.send(maskSecrets(loadSchema(configName), data));
  } catch (err) {
    log.error.error('Error getting config:', err);
    return problem(res, req, { status: 500, type: 'internal' });
  }
};
