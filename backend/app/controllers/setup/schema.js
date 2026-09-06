// schema.js
import { CONFIG_NAMES, loadSchema } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import { verifyAuthorizedToken } from './middleware.js';

/**
 * @swagger
 * /api/setup/schema:
 *   get:
 *     summary: Get the schema of every configuration file for the setup page
 *     description: The JSON Schema 2020-12 document of every file named by status.config, under the setup token.
 *     tags: [Setup]
 *     security:
 *       - JwtAuth: []
 *     responses:
 *       200:
 *         description: The schema documents
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 schemas:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *       403:
 *         description: Invalid setup token
 *       500:
 *         description: Failed to read schemas
 */
export const getSchemas = [
  verifyAuthorizedToken,
  (req, res) => {
    try {
      const schemas = Object.fromEntries(CONFIG_NAMES.map(name => [name, loadSchema(name)]));
      return res.send({ schemas });
    } catch (error) {
      log.error.error('Error reading schemas:', error);
      return res.status(500).send(req.__('setup.readError'));
    }
  },
];
