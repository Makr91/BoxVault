// gravatar.js
const { loadConfig } = require('../../utils/config-loader');

/**
 * @swagger
 * /api/config/gravatar:
 *   get:
 *     summary: Get Gravatar configuration
 *     description: Retrieve Gravatar-specific configuration settings from the app config
 *     tags: [Configuration]
 *     security:
 *       - JwtAuth: []
 *     responses:
 *       200:
 *         description: Gravatar configuration retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GravatarConfigResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Gravatar configuration not found
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
exports.getGravatarConfig = (req, res) => {
  void req;
  try {
    const data = loadConfig('app');
    if (data && data.gravatar) {
      return res.send({ gravatar: data.gravatar });
    }
    return res.status(404).send({ message: req.__('config.gravatarNotFound') });
  } catch (err) {
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};
