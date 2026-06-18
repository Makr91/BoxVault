// gravatar.js
import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';

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
export const getGravatarConfig = (req, res) => {
  void req;
  try {
    const data = loadConfig('app');
    if (data && data.gravatar) {
      return res.send({ gravatar: data.gravatar });
    }
    return res.status(404).send({ message: req.__('config.gravatarNotFound') });
  } catch (err) {
    log.error.error('Error getting gravatar config:', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};
