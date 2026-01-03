// get.js
const { loadConfig } = require('../../utils/config-loader');
const { log } = require('../../utils/Logger');

/**
 * @swagger
 * /api/config/{configName}:
 *   get:
 *     summary: Get configuration by name
 *     description: Retrieve configuration data for a specific config type (app, auth, db, mail)
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
 *               description: Configuration data (structure varies by config type)
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
exports.getConfig = (req, res) => {
  const { configName } = req.params;
  try {
    const data = loadConfig(configName);
    return res.send(data);
  } catch (err) {
    log.error.error('Error getting config:', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};
