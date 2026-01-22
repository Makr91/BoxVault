// claims.js
import axios from 'axios';
import { log } from '../../utils/Logger.js';
import { getAuthServerUrl, extractOidcAccessToken } from './helpers.js';

/**
 * @swagger
 * /api/userinfo/claims:
 *   get:
 *     summary: Get enriched user claims including favorites
 *     description: Retrieve user claims with enriched favorite applications data
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Claims retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sub:
 *                   type: string
 *                 name:
 *                   type: string
 *                 email:
 *                   type: string
 *                 favorite_apps:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       clientId:
 *                         type: string
 *                       clientName:
 *                         type: string
 *                       customLabel:
 *                         type: string
 *                       icon:
 *                         type: string
 *                       iconUrl:
 *                         type: string
 *                       homeUrl:
 *                         type: string
 *                       order:
 *                         type: integer
 *       401:
 *         description: Not authenticated or OIDC access token not available
 *       500:
 *         description: Failed to fetch claims from auth server
 */
export const getUserInfoClaims = async (req, res) => {
  try {
    const oidcAccessToken = extractOidcAccessToken(req);

    if (!oidcAccessToken) {
      log.auth.warn('No OIDC access token available for claims request');
      // Return minimal claims for non-OIDC users
      return res.status(200).json({
        sub: req.userId,
        favorite_apps: [],
      });
    }

    const authServerUrl = getAuthServerUrl(req);

    log.auth.debug('Fetching enriched claims from auth server', {
      authServerUrl,
      hasToken: !!oidcAccessToken,
    });

    const response = await axios.get(`${authServerUrl}/userinfo`, {
      headers: {
        Authorization: `Bearer ${oidcAccessToken}`,
        'Content-Type': 'application/json',
      },
    });

    return res.status(200).json(response.data);
  } catch (error) {
    log.error.error('Error fetching claims from auth server:', {
      error: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });

    // Return minimal claims on error
    return res.status(200).json({
      sub: req.userId,
      favorite_apps: [],
    });
  }
};
