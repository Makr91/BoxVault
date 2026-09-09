// getuserprofile.js
import { loadConfig } from '../../utils/config-loader.js';
import { resolveUserOrganizations } from '../../utils/userOrgs.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import db from '../../models/index.js';
import { buildSigninToken } from '../auth/signin.js';
import { idpClaimsOf } from '../auth/token.js';
const { user: User, role: Role, organization: Organization } = db;

/**
 * @swagger
 * /api/user:
 *   get:
 *     summary: Get current user profile
 *     description: Retrieve the profile information of the currently authenticated user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   description: User ID
 *                 username:
 *                   type: string
 *                   description: Username
 *                 email:
 *                   type: string
 *                   format: email
 *                   description: User email
 *                 verified:
 *                   type: boolean
 *                   description: Email verification status
 *                 emailHash:
 *                   type: string
 *                   description: Hashed email for Gravatar
 *                 roles:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: User roles
 *                 organization:
 *                   type: string
 *                   description: Organization name
 *                 accessToken:
 *                   type: string
 *                   description: JWT access token
 *                 avatarUrl:
 *                   type: string
 *                   nullable: true
 *                   description: Stored avatar URL from the identity provider (clients fall back to the emailHash gravatar)
 *                 entitlements:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       value:
 *                         type: string
 *                       type:
 *                         type: string
 *                       display:
 *                         type: string
 *                   description: RFC 7643 entitlements pushed by SCIM (empty array when none are stored)
 *       404:
 *         description: User not found
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const getUserProfile = async (req, res) => {
  try {
    const authConfig = loadConfig('auth');

    const user = await User.findByPk(req.userId, {
      include: [
        {
          model: Role,
          as: 'roles',
          attributes: ['name'],
          through: { attributes: [] },
        },
        {
          model: Organization,
          as: 'primaryOrganization',
          attributes: ['name'],
        },
      ],
    });

    if (!user) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('users.userNotFound'),
      });
    }

    const { userOrganizations: organizations } = await resolveUserOrganizations(user);
    const claims = req.tokenClaims || {};
    const token = buildSigninToken({
      user,
      isServiceAccount: false,
      stayLoggedIn: req.stayLoggedIn,
      provider: claims.provider || user.authProvider || 'local',
      userOrganizations: organizations,
      authConfig,
      idpClaims: idpClaimsOf(claims),
    });

    const authorities = user.roles.map(role => `ROLE_${role.name.toUpperCase()}`);

    return res.status(200).send({
      id: user.id,
      username: user.username,
      name: user.name || null,
      preferredLanguage: user.preferredLanguage || null,
      preferredTheme: user.preferredTheme || null,
      email: user.email,
      verified: user.verified,
      emailHash: user.emailHash,
      avatarUrl: user.avatar_url,
      roles: authorities,
      organization: user.primaryOrganization ? user.primaryOrganization.name : null,
      organizations,
      entitlements: user.entitlements || [],
      accessToken: token,
    });
  } catch (error) {
    log.error.error('Error retrieving user profile:', error);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('users.profile.error'),
    });
  }
};
