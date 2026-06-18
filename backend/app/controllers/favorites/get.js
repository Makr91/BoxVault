// get.js
import axios from 'axios';
import { log } from '../../utils/Logger.js';
import { getAuthServerUrl, extractOidcAccessToken } from './helpers.js';

/**
 * @swagger
 * /api/favorites:
 *   get:
 *     summary: Get user's favorite applications
 *     description: Retrieve the current user's favorite applications (raw JSON)
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Favorites retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   clientId:
 *                     type: string
 *                   customLabel:
 *                     type: string
 *                   order:
 *                     type: integer
 *       401:
 *         description: Not authenticated or OIDC access token not available
 *       500:
 *         description: Failed to fetch favorites from auth server
 */
export const getFavorites = async (req, res) => {
  try {
    const oidcAccessToken = extractOidcAccessToken(req);

    if (!oidcAccessToken) {
      log.auth.warn('No OIDC access token available for favorites request');
      // Return empty array for non-OIDC users
      return res.status(200).json([]);
    }

    const authServerUrl = getAuthServerUrl(req);

    log.auth.debug('Fetching favorites from auth server', {
      authServerUrl,
      hasToken: !!oidcAccessToken,
    });

    const response = await axios.get(`${authServerUrl}/userinfo`, {
      headers: {
        Authorization: `Bearer ${oidcAccessToken}`,
        'Content-Type': 'application/json',
      },
    });

    // Extract favorite_apps from userinfo claims and return raw favorites format
    const favoriteApps = response.data?.favorite_apps || [];
    // Convert enriched format back to raw format (just clientId, customLabel, order)
    const rawFavorites = favoriteApps.map(app => ({
      clientId: app.clientId,
      customLabel: app.customLabel,
      order: app.order,
    }));

    return res.status(200).json(rawFavorites);
  } catch (error) {
    log.error.error('Error fetching favorites from auth server:', {
      error: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });

    // Return empty array on error to prevent frontend breakage
    return res.status(200).json([]);
  }
};
