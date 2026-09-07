import axios from 'axios';
import { getAuthServerUrl, extractOidcAccessToken } from './helpers.js';
import { proxyNotificationRequest } from '../notification.controller.js';

const buildUserFavoritesUrl = req => `${getAuthServerUrl(req)}/api/user/favorites`;

/**
 * @swagger
 * /api/user/favorites:
 *   get:
 *     summary: The caller's favorites
 *     description: Forwards to the identity provider's GET /api/user/favorites with the session's OIDC access token and answers its status and body unmapped. A session without an OIDC access token answers an empty list.
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The favorites as the identity provider answers them
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       401:
 *         description: The identity provider refused the token
 *       403:
 *         description: The identity provider refused the request
 *       502:
 *         description: The identity provider is unreachable
 */
export const getUserFavorites = (req, res) => {
  if (!extractOidcAccessToken(req)) {
    return res.json([]);
  }
  return proxyNotificationRequest(req, res, headers =>
    axios.get(buildUserFavoritesUrl(req), { headers })
  );
};

/**
 * @swagger
 * /api/user/favorites:
 *   put:
 *     summary: Replace the caller's favorites
 *     description: Forwards the body to the identity provider's PUT /api/user/favorites with the session's OIDC access token and answers its status and body unmapped.
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
 *     responses:
 *       200:
 *         description: The favorites as the identity provider answers them
 *       401:
 *         description: No OIDC access token on the session, or the identity provider refused the token
 *       403:
 *         description: The identity provider refused the request
 *       502:
 *         description: The identity provider is unreachable
 */
export const saveUserFavorites = (req, res) =>
  proxyNotificationRequest(req, res, headers =>
    axios.put(buildUserFavoritesUrl(req), req.body, { headers })
  );
