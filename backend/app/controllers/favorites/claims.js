import axios from 'axios';
import jwt from 'jsonwebtoken';
import { log } from '../../utils/Logger.js';
import { getAuthServerUrl, extractOidcAccessToken } from './helpers.js';
import { forwardToProvider } from '../notification.controller.js';

const { decode } = jwt;

/**
 * @swagger
 * /api/userinfo/claims:
 *   get:
 *     summary: Get enriched user claims including favorites
 *     description: Retrieve user claims with enriched favorite applications data. A session without an OIDC access token answers minimal claims; a provider 401 is answered with one fresh token and one retry.
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
 *                       client_id:
 *                         type: string
 *                       client_name:
 *                         type: string
 *                       custom_label:
 *                         type: string
 *                       icon_url:
 *                         type: string
 *                       home_url:
 *                         type: string
 *                       order:
 *                         type: integer
 *                 scope:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Scopes granted on the OIDC access token BoxVault holds for this session (absent for local sessions)
 *       401:
 *         description: The identity provider refused the token twice
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       403:
 *         description: The identity provider refused the request
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       502:
 *         description: The identity provider is unreachable
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const getUserInfoClaims = async (req, res) => {
  if (!extractOidcAccessToken(req)) {
    log.auth.warn('No OIDC access token available for claims request');
    return res.status(200).json({
      sub: req.userId,
      favorite_apps: [],
    });
  }

  const forwarded = await forwardToProvider(req, res, headers =>
    axios.get(`${getAuthServerUrl(req)}/userinfo`, { headers })
  );
  if (!forwarded) {
    return undefined;
  }
  const scope = decode(extractOidcAccessToken(req))?.scope;
  return res.status(200).json({ ...forwarded.response.data, ...(scope ? { scope } : {}) });
};
