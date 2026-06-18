// update.js
import { loadConfig, getConfigPath } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import { writeConfig } from './helpers.js';

/**
 * Helper function for deep merging objects.
 * @param {object} item - The item to check.
 * @returns {boolean} - True if the item is a non-array object.
 */
const isObject = item => item && typeof item === 'object' && !Array.isArray(item);

const mergeDeep = (target, ...sources) => {
  if (!sources.length) {
    return target;
  }
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) {
          Object.assign(target, { [key]: {} });
        }
        mergeDeep(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return mergeDeep(target, ...sources);
};

/**
 * @swagger
 * /api/config/{configName}:
 *   put:
 *     summary: Update configuration by name
 *     description: Update configuration data for a specific config type. Requires admin privileges.
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
 *             description: Configuration data to update (structure varies by config type)
 *             additionalProperties: true
 *             example:
 *               boxvault:
 *                 api_url:
 *                   value: "https://api.example.com"
 *     responses:
 *       200:
 *         description: Configuration updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Admin privileges required
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
export const updateConfig = async (req, res) => {
  const { configName } = req.params;
  try {
    const filePath = getConfigPath(configName);
    const currentConfig = loadConfig(configName);

    // Deep merge the request body into the current configuration
    const updatedConfig = mergeDeep({}, currentConfig, req.body);

    await writeConfig(filePath, updatedConfig);
    return res.send({ message: req.__('config.updated') });
  } catch (err) {
    log.error.error('Error updating config:', err);
    return res.status(500).send({ message: req.__('config.updateError') });
  }
};
