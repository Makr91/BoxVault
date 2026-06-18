// save.js
import axios from 'axios';
import { log } from '../../utils/Logger.js';
import { getAuthServerUrl, extractOidcAccessToken } from './helpers.js';

/**
 * @swagger
 * /api/favorites/save:
 *   post:
 *     summary: Save user's favorite applications
 *     description: Save the current user's favorite applications
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               properties:
 *                 clientId:
 *                   type: string
 *                 customLabel:
 *                   type: string
 *                 order:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Favorites saved successfully
 *       401:
 *         description: Not authenticated or OIDC access token not available
 *       500:
 *         description: Failed to save favorites to auth server
 */
export const saveFavorites = async (req, res) => {
  try {
    const oidcAccessToken = extractOidcAccessToken(req);

    if (!oidcAccessToken) {
      return res.status(401).json({
        message: req.__('favorites.oidcRequired'),
      });
    }

    const authServerUrl = getAuthServerUrl(req);
    const favoritesJson = JSON.stringify(req.body);

    log.auth.debug('Saving favorites to auth server', {
      authServerUrl,
      favoritesCount: Array.isArray(req.body) ? req.body.length : 'unknown',
    });

    await axios.post(`${authServerUrl}/user/favorites/save`, favoritesJson, {
      headers: {
        Authorization: `Bearer ${oidcAccessToken}`,
        'Content-Type': 'application/json',
      },
    });

    return res.status(200).json({ message: req.__('favorites.saved') });
  } catch (error) {
    log.error.error('Error saving favorites to auth server:', {
      error: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });

    return res.status(500).json({
      message: error.response?.data?.message || req.__('favorites.saveError'),
    });
  }
};
