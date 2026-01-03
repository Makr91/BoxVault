// update.js
const { getConfigPath } = require('../../utils/config-loader');
const { writeConfig } = require('./helpers');

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
exports.updateConfig = async (req, res) => {
  const { configName } = req.params;
  try {
    // For updates, we still need to write to the actual file path
    const filePath = getConfigPath(configName);
    await writeConfig(filePath, req.body);
    return res.send({ message: req.__('config.updated') });
  } catch (err) {
    return res.status(500).send({ message: req.__('config.updateError') });
  }
};
