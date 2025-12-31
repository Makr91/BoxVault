// token.js
const jwt = require('jsonwebtoken');
const { loadConfig } = require('../../utils/config-loader');
const { log } = require('../../utils/Logger');

let authConfig;
try {
  authConfig = loadConfig('auth');
} catch (e) {
  log.error.error(`Failed to load auth configuration: ${e.message}`);
}

/**
 * @swagger
 * /api/auth/refresh-token:
 *   post:
 *     summary: Refresh JWT token
 *     description: Generate a new JWT token for stay-logged-in sessions
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               stayLoggedIn:
 *                 type: boolean
 *                 description: Whether to enable stay-logged-in for the new token
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   description: New JWT access token
 *                 stayLoggedIn:
 *                   type: boolean
 *                   description: Stay-logged-in status
 *       403:
 *         description: Token refresh not allowed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
exports.refreshToken = (req, res) => {
  try {
    // Get user from request (set by authJwt middleware)
    const { user } = req;
    const { stayLoggedIn } = req.body;

    // Check if either the current token or the request wants stayLoggedIn
    if (!user.stayLoggedIn && !stayLoggedIn) {
      return res
        .status(403)
        .send({ message: 'Token refresh only allowed for stay-logged-in sessions' });
    }

    // Generate new token with the requested stayLoggedIn state
    const token = jwt.sign(
      {
        id: user.id,
        isServiceAccount: false,
        stayLoggedIn: stayLoggedIn || user.stayLoggedIn, // Keep existing state if not provided
      },
      authConfig.auth.jwt.jwt_secret.value,
      {
        algorithm: 'HS256',
        allowInsecureKeySizes: true,
        expiresIn: '24h',
      }
    );

    return res.status(200).send({
      accessToken: token,
      stayLoggedIn: stayLoggedIn || user.stayLoggedIn,
    });
  } catch (err) {
    log.error.error('Error in refreshToken:', err);
    return res.status(500).send({ message: 'Error refreshing token' });
  }
};
