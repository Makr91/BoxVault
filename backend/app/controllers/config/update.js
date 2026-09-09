// update.js
import {
  CONFIG_NAMES,
  loadSchema,
  readConfigFile,
  fillDefaults,
  validateConfig,
  getConfigPath,
} from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import { problem, refuse } from '../../utils/problem.js';
import { writeConfig, restoreSecrets, requiresRestart, mergeDeep } from './helpers.js';

/**
 * @swagger
 * /api/config/{configName}:
 *   put:
 *     summary: Update configuration by name
 *     description: The body is the whole file or a subtree of it. Masked secrets (******** or blank on a writeOnly key) keep their stored value; the merged result is evaluated against the file's schema and refused with 422 and one errors[] entry per failing value before anything touches the file; the file is then written atomically with a backup beside it. Requires admin privileges.
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
 *         description: Configuration type to update
 *         example: app
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: The plain configuration file or a subtree of it
 *             additionalProperties: true
 *             example:
 *               boxvault:
 *                 api_url: "https://api.example.com"
 *     responses:
 *       200:
 *         description: Configuration updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 requires_restart:
 *                   type: boolean
 *                   description: Whether a changed key needs a restart to take effect
 *       401:
 *         description: Authentication required
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       403:
 *         description: Admin privileges required
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: The name is not one of the files status.config lists
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the file's schema
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const updateConfig = async (req, res) => {
  const { configName } = req.params;
  if (!CONFIG_NAMES.includes(configName)) {
    return problem(res, req, { status: 404, type: 'not-found' });
  }
  try {
    const filePath = getConfigPath(configName);
    const schema = loadSchema(configName);
    const currentConfig = readConfigFile(configName);

    restoreSecrets(schema, req.body, currentConfig);

    const updatedConfig = mergeDeep(currentConfig, req.body);
    const errors = validateConfig(configName, fillDefaults(schema, updatedConfig));
    if (errors.length > 0) {
      return refuse(res, req, errors, req.__('problems.configValidation'));
    }

    await writeConfig(filePath, updatedConfig);
    return res.send({
      message: req.__('config.updated'),
      requires_restart: requiresRestart(schema, currentConfig, updatedConfig),
    });
  } catch (err) {
    log.error.error('Error updating config:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('config.updateError'),
    });
  }
};
