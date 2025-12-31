// enriched.js
const axios = require('axios');
const { log } = require('../../utils/Logger');
const { getAuthServerUrl, extractOidcAccessToken } = require('./helpers');

/**
 * @swagger
 * /api/userinfo/favorites:
 *   get:
 *     summary: Get enriched favorite apps (lightweight endpoint)
 *     description: Get only the enriched favorite applications
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Favorites retrieved successfully
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Failed to fetch from auth server
 */
exports.getEnrichedFavorites = async (req, res) => {
  try {
    const oidcAccessToken = extractOidcAccessToken(req);

    if (!oidcAccessToken) {
      return res.status(200).json([]);
    }

    const authServerUrl = getAuthServerUrl(req);

    const response = await axios.get(`${authServerUrl}/userinfo`, {
      headers: {
        Authorization: `Bearer ${oidcAccessToken}`,
        'Content-Type': 'application/json',
      },
    });

    return res.status(200).json(response.data?.favorite_apps || []);
  } catch (error) {
    log.error.error('Error fetching enriched favorites:', error.message);
    return res.status(200).json([]);
  }
};
