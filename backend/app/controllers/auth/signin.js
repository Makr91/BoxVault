// signin.js
import { compareSync } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { loadConfig } from '../../utils/config-loader.js';
import { getJwtClaimOptions } from '../../utils/auth.js';
import { hashServiceAccountToken } from '../../utils/serviceAccountAuth.js';
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
 * Look up a regular user for signin, with roles and primary organization.
 * @param {string} username - Presented username
 * @returns {Promise<Object|null>} User instance or null
 */
const findSigninUser = username =>
  User.findOne({
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

/**
 * Look up a service account for signin (tokens are stored as sha256 hashes —
 * hash the presented token before comparing).
 * @param {string} username - Presented username
 * @param {string} password - Presented raw token
 * @returns {Promise<Object|null>} Service account instance or null
 */
const findSigninServiceAccount = (username, password) =>
  ServiceAccount.findOne({
    where: { username, token: hashServiceAccountToken(password || '') },
    include: [
      {
        model: Organization,
        as: 'organization',
        attributes: ['name'],
      },
      {
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'suspended'],
      },
    ],
  });

/**
 * Run the local-account signin gates in order; returns the rejection to send,
 * or null when the signin may proceed.
 * @param {Object} user - User instance
 * @param {string} password - Presented password
 * @param {Object} authConfig - Loaded auth config
 * @param {Object} req - Express request (for i18n)
 * @returns {{status: number, body: Object}|null}
 */
const getLocalSigninRejection = (user, password, authConfig, req) => {
  // Username/password authentication can be switched off entirely (#18)
  if (authConfig.auth?.jwt?.local_enabled?.value === false) {
    return { status: 403, body: { message: req.__('auth.localAuthDisabled') } };
  }

  const passwordIsValid = compareSync(password, user.password);
  if (!passwordIsValid) {
    return {
      status: 401,
      body: { accessToken: null, message: req.__('auth.invalidCredentials') },
    };
  }

  // Checked after password verification so suspension status is only
  // revealed to the account holder.
  if (user.suspended) {
    return { status: 403, body: { message: req.__('auth.accountSuspended') } };
  }

  // Email-verification enforcement for local accounts (#18): when the knob
  // is on, unverified accounts may not sign in. Checked after password
  // verification so the status is only revealed to the account holder.
  if (authConfig.auth?.local?.local_require_email_verification?.value && !user.verified) {
    return { status: 403, body: { message: req.__('auth.emailNotVerified') } };
  }

  return null;
};

/**
 * Resolve the organizations to embed in the signin response/JWT.
 * @param {Object} user - User or service-account instance
 * @param {boolean} isServiceAccount
 * @returns {Promise<{userOrganizations: Object[], primaryOrgName: string|null|undefined}>}
 */
const resolveSigninOrganizations = async (user, isServiceAccount) => {
  if (isServiceAccount) {
    // Service account has one organization
    return { userOrganizations: [], primaryOrgName: user.organization?.name || null };
  }

  // Get all user's organizations with roles
  const userOrgs = await UserOrg.getUserOrganizations(user.id);
  const userOrganizations = userOrgs.map(userOrg => ({
    name: userOrg.organization.name,
    role: userOrg.role,
    isPrimary: userOrg.is_primary,
  }));

  // Find primary organization
  const primaryOrg = userOrgs.find(userOrg => userOrg.is_primary);
  const primaryOrgName = primaryOrg?.organization.name || user.primaryOrganization?.name;
  return { userOrganizations, primaryOrgName };
};

/**
 * Provider tag stamped on the token and response.
 * @param {Object} user - User or service-account instance
 * @param {boolean} isServiceAccount
 * @returns {string}
 */
const resolveSigninProvider = (user, isServiceAccount) => {
  if (isServiceAccount) {
    return 'service_account';
  }
  return user.authProvider || 'local';
};

/**
 * Sign the BoxVault session JWT for a successful signin.
 * @param {Object} params - { user, isServiceAccount, stayLoggedIn, provider,
 *   userOrganizations, authConfig }
 * @returns {string} Signed JWT
 */
const buildSigninToken = ({
  user,
  isServiceAccount,
  stayLoggedIn,
  provider,
  userOrganizations,
  authConfig,
}) => {
  // Use the configured session timeout for stayLoggedIn sessions (#18:
  // auth.local.local_session_timeout, hours), default expiry otherwise.
  const sessionTimeoutHours = authConfig.auth?.local?.local_session_timeout?.value || 24;
  const tokenExpiry = stayLoggedIn
    ? `${sessionTimeoutHours}h`
    : authConfig.auth.jwt.jwt_expiration.value || '24h';

  return jwt.sign(
    {
      id: isServiceAccount ? user.userId : user.id, // For service accounts, use creator's user ID
      serviceAccountId: isServiceAccount ? user.id : null, // Store service account's own ID
      isServiceAccount,
      stayLoggedIn,
      provider,
      organizations: userOrganizations, // Multi-org data for frontend
    },
    authConfig.auth.jwt.jwt_secret.value,
    {
      algorithm: 'HS256',
      allowInsecureKeySizes: true,
      expiresIn: tokenExpiry,
      ...getJwtClaimOptions(),
    }
  );
};

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
 *                 avatarUrl:
 *                   type: string
 *                   nullable: true
 *                   description: Stored avatar URL from the identity provider (null for service accounts or when unset; clients fall back to the emailHash gravatar)
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
 *                   example: "Invalid username or password."
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
    let user = await findSigninUser(username);
    let isServiceAccount = false;

    // If no user found, check for a service account
    if (!user) {
      const serviceAccount = await findSigninServiceAccount(username, password);

      if (serviceAccount) {
        // expiresAt: null = never expires
        if (serviceAccount.expiresAt && new Date() > serviceAccount.expiresAt) {
          return res.status(401).send({ message: req.__('auth.serviceAccountExpired') });
        }
        // Service accounts impersonate their owning user — a suspended owner
        // may not sign in through their API keys either.
        if (serviceAccount.user?.suspended) {
          return res.status(403).send({ message: req.__('auth.accountSuspended') });
        }
        user = serviceAccount;
        isServiceAccount = true;
      } else {
        // Uniform response for unknown username and wrong password (no enumeration)
        return res
          .status(401)
          .send({ accessToken: null, message: req.__('auth.invalidCredentials') });
      }
    }

    if (!isServiceAccount) {
      const rejection = getLocalSigninRejection(user, password, authConfig, req);
      if (rejection) {
        return res.status(rejection.status).send(rejection.body);
      }
    }

    const { userOrganizations, primaryOrgName } = await resolveSigninOrganizations(
      user,
      isServiceAccount
    );

    const provider = resolveSigninProvider(user, isServiceAccount);
    const token = buildSigninToken({
      user,
      isServiceAccount,
      stayLoggedIn,
      provider,
      userOrganizations,
      authConfig,
    });

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
      avatarUrl: isServiceAccount ? null : user.avatar_url,
    });
  } catch (err) {
    log.error.error('Error in signin:', err);
    return res.status(500).send({ message: req.__('auth.signinError') });
  }
};
