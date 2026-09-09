// update.js
import fs from 'fs';
import {
  getSetupTokenPath,
  loadSchema,
  readConfigFile,
  fillDefaults,
  validateConfig,
} from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import { problem, refuse } from '../../utils/problem.js';
import { verifyAuthorizedToken } from './middleware.js';
import { configPaths, setAuthorizedSetupToken } from './helpers.js';
import { writeConfig, restoreSecrets, mergeDeep } from '../config/helpers.js';

/**
 * Merge one submitted file onto the stored one, the database dialect set
 * from the database type, and collect its failing rules with pointers into
 * the body as sent.
 * @param {string} configName - Name of config file
 * @param {Object} configData - The submitted file or subtree
 * @returns {{path: string, config: Object, errors: Array<{pointer: string, rule: string, params: Object}>}}
 */
const prepareUpdate = (configName, configData) => {
  const schema = loadSchema(configName);
  const currentConfig = readConfigFile(configName);
  restoreSecrets(schema, configData, currentConfig);
  const newConfig = mergeDeep(currentConfig, configData);

  if (configName === 'db' && newConfig.database_type) {
    newConfig.sql = { ...(newConfig.sql || {}), dialect: newConfig.database_type };
  }

  const errors = validateConfig(configName, fillDefaults(schema, newConfig)).map(error => ({
    ...error,
    pointer: `/configs/${configName}${error.pointer}`,
  }));
  return { path: configPaths[configName], config: newConfig, errors };
};

/**
 * @swagger
 * /api/setup:
 *   put:
 *     summary: Write every configuration file from the setup page
 *     description: "The body is { configs: { <name>: <file> } }. Every file is evaluated against its schema; a 422 carries every failing value of every file with pointers into the body as sent (/configs/app/boxvault/origin) and nothing is written while any fails. The setup token is consumed on success."
 *     tags: [Setup]
 *     security:
 *       - JwtAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ConfigUpdateRequest'
 *     responses:
 *       200:
 *         description: Configuration written
 *       403:
 *         description: Invalid setup token
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value of one of the files breaks its schema
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Failed to write configurations
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const updateConfigs = [
  verifyAuthorizedToken,
  async (req, res) => {
    const { configs } = req.body;

    try {
      const updates = Object.entries(configs || {})
        .filter(([configName]) => configPaths[configName])
        .map(([configName, configData]) => prepareUpdate(configName, configData));

      const errors = updates.flatMap(update => update.errors);
      if (errors.length > 0) {
        return refuse(res, req, errors, req.__('problems.configValidation'));
      }

      await Promise.all(updates.map(update => writeConfig(update.path, update.config)));

      // Remove the setup token file to prevent further setup
      const setupTokenPath = getSetupTokenPath();
      try {
        if (fs.existsSync(setupTokenPath)) {
          fs.unlinkSync(setupTokenPath);
        }
      } catch (err) {
        log.error.warn('Failed to delete setup token:', err.message);
      }

      // Clear the in-memory authorized token so post-setup requests can no longer
      // read configs even though the process is still running.
      setAuthorizedSetupToken(null);

      return res.send(req.__('config.updated'));
    } catch (error) {
      log.error.error('Error updating configuration:', error);
      return problem(res, req, {
        status: 500,
        type: 'internal',
        title: req.__('config.updateError'),
      });
    }
  },
];
