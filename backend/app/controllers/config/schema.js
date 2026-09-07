// schema.js
import { CONFIG_NAMES, loadSchema } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';

/**
 * @swagger
 * /api/config/{configName}/schema:
 *   get:
 *     summary: Get the schema of a configuration file
 *     description: The JSON Schema 2020-12 document shipped with the code for one configuration file, carrying the rules the write route enforces and the drawing words (title, description, section, subsection, order, readOnly, writeOnly, upload, dependsOn, showWhen, requiresRestart) the admin page draws from. It never carries a value.
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
 *         description: Configuration type
 *         example: app
 *     responses:
 *       200:
 *         description: The schema document
 *         content:
 *           application/json:
 *             schema:
 *               type: object
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
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const getConfigSchema = (req, res) => {
  const { configName } = req.params;
  if (!CONFIG_NAMES.includes(configName)) {
    return problem(res, req, { status: 404, type: 'not-found' });
  }
  try {
    return res.json(loadSchema(configName));
  } catch (err) {
    log.error.error('Error getting config schema:', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};
