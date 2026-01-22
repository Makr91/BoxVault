// token.js
import jwt from 'jsonwebtoken';
import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
const { UserOrg } = db;

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
export const refreshToken = async (req, res) => {
  try {
    const authConfig = loadConfig('auth');
    // Get user from request (set by authJwt middleware)
    const { user } = req;
    const { stayLoggedIn } = req.body || {};

    // Get user's organizations for multi-org JWT
    const userOrgs = await UserOrg.getUserOrganizations(user.id);
    const userOrganizations = userOrgs.map(userOrg => ({
      name: userOrg.organization.name,
      role: userOrg.role,
      isPrimary: userOrg.is_primary,
    }));

    // Find primary organization
    const primaryOrg = userOrgs.find(userOrg => userOrg.is_primary);
    const primaryOrgName = primaryOrg?.organization.name || user.primaryOrganization?.name;

    let provider = user.authProvider;
    if (!provider) {
      provider = 'local';
    }

    const finalStayLoggedIn = stayLoggedIn || req.stayLoggedIn;

    // Generate new token with multi-org data
    const token = jwt.sign(
      {
        id: user.id,
        isServiceAccount: false,
        stayLoggedIn: finalStayLoggedIn,
        provider,
        organizations: userOrganizations,
      },
      authConfig.auth.jwt.jwt_secret.value,
      {
        algorithm: 'HS256',
        allowInsecureKeySizes: true,
        expiresIn: '24h',
      }
    );

    const authorities = user.roles.map(role => `ROLE_${role.name.toUpperCase()}`);

    return res.status(200).send({
      id: user.id,
      username: user.username,
      email: user.email,
      verified: user.verified,
      emailHash: user.emailHash,
      roles: authorities,
      organization: primaryOrgName,
      organizations: userOrganizations,
      accessToken: token,
      isServiceAccount: false,
      provider,
      stayLoggedIn: finalStayLoggedIn,
    });
  } catch (err) {
    log.error.error('Error in refreshToken:', err);
    return res.status(500).send({ message: req.__('auth.tokenRefreshError') });
  }
};
