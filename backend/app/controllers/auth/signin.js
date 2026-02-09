// signin.js
import { compareSync } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
const {
  user: User,
  role: Role,
  organization: Organization,
  service_account: ServiceAccount,
  UserOrg,
} = db;

/**
 * @swagger
 * /api/auth/signin:
 *   post:
 *     summary: Sign in user
 *     description: Authenticate a user or service account and return JWT token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: Username or service account name
 *               password:
 *                 type: string
 *                 format: password
 *                 description: Password or service account token
 *               stayLoggedIn:
 *                 type: boolean
 *                 description: Whether to extend token expiration time
 *                 default: false
 *     responses:
 *       200:
 *         description: Successful authentication
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
 *                   description: User email (null for service accounts)
 *                 verified:
 *                   type: boolean
 *                   description: Email verification status (null for service accounts)
 *                 emailHash:
 *                   type: string
 *                   description: Hashed email for Gravatar (null for service accounts)
 *                 roles:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: User roles
 *                 organization:
 *                   type: string
 *                   description: Organization name (null for service accounts)
 *                 accessToken:
 *                   type: string
 *                   description: JWT access token
 *                 isServiceAccount:
 *                   type: boolean
 *                   description: Whether this is a service account
 *                 gravatarUrl:
 *                   type: string
 *                   description: Gravatar URL (null for service accounts)
 *       401:
 *         description: Invalid credentials or expired service account
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *                   example: "Invalid Password!"
 *       404:
 *         description: User not found
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
export const signin = async (req, res) => {
  try {
    const authConfig = loadConfig('auth');
    const { username, password, stayLoggedIn } = req.body || {};

    // First, try to find a regular user
    let user = await User.findOne({
      where: { username },
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

    let isServiceAccount = false;

    // If no user found, check for a service account
    if (!user) {
      const serviceAccount = await ServiceAccount.findOne({
        where: { username, token: password },
        include: [
          {
            model: Organization,
            as: 'organization',
            attributes: ['name'],
          },
          {
            model: User,
            as: 'user',
            attributes: ['id', 'username'],
          },
        ],
      });

      if (serviceAccount) {
        if (new Date() > serviceAccount.expiresAt) {
          return res.status(401).send({ message: req.__('auth.serviceAccountExpired') });
        }
        user = serviceAccount;
        isServiceAccount = true;
      } else {
        return res.status(404).send({ message: req.__('auth.userNotFound') });
      }
    }

    if (!isServiceAccount) {
      const passwordIsValid = compareSync(password, user.password);
      if (!passwordIsValid) {
        return res.status(401).send({ accessToken: null, message: req.__('auth.invalidPassword') });
      }
    }

    // Get user's organizations for multi-org JWT
    let userOrganizations = [];
    let primaryOrgName = null;

    if (isServiceAccount) {
      // Service account has one organization
      primaryOrgName = user.organization?.name || null;
    } else {
      // Get all user's organizations with roles
      const userOrgs = await UserOrg.getUserOrganizations(user.id);
      userOrganizations = userOrgs.map(userOrg => ({
        name: userOrg.organization.name,
        role: userOrg.role,
        isPrimary: userOrg.is_primary,
      }));

      // Find primary organization
      const primaryOrg = userOrgs.find(userOrg => userOrg.is_primary);
      primaryOrgName = primaryOrg?.organization.name || user.primaryOrganization?.name;
    }

    // Use longer expiry for stayLoggedIn
    const tokenExpiry = stayLoggedIn ? '24h' : authConfig.auth.jwt.jwt_expiration.value || '24h';

    let provider = user.authProvider;
    if (!provider) {
      provider = 'local';
    }

    if (isServiceAccount) {
      provider = 'service_account';
    }

    const token = jwt.sign(
      {
        id: isServiceAccount ? user.userId : user.id, // For service accounts, use creator's user ID
        serviceAccountId: isServiceAccount ? user.id : null, // Store service account's own ID
        isServiceAccount,
        stayLoggedIn,
        provider,
        organizations: userOrganizations, // Multi-org data for frontend
        serviceAccountOrgId: isServiceAccount ? user.organization_id : null,
      },
      authConfig.auth.jwt.jwt_secret.value,
      {
        algorithm: 'HS256',
        allowInsecureKeySizes: true,
        expiresIn: tokenExpiry,
      }
    );

    const authorities = isServiceAccount
      ? ['ROLE_SERVICE_ACCOUNT']
      : user.roles.map(role => `ROLE_${role.name.toUpperCase()}`);

    return res.status(200).send({
      id: user.id,
      username: user.username,
      email: isServiceAccount ? null : user.email,
      verified: isServiceAccount ? null : user.verified,
      emailHash: isServiceAccount ? null : user.emailHash,
      roles: authorities,
      organization: primaryOrgName,
      organizations: userOrganizations, // All orgs for frontend
      accessToken: token,
      isServiceAccount,
      provider,
      stayLoggedIn: !!stayLoggedIn,
      gravatarUrl: isServiceAccount ? null : user.gravatarUrl,
    });
  } catch (err) {
    log.error.error('Error in signin:', err);
    return res.status(500).send({ message: req.__('auth.signinError') });
  }
};
