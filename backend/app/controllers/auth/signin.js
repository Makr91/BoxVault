// signin.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { loadConfig } = require('../../utils/config-loader');
const { log } = require('../../utils/Logger');
const db = require('../../models');

const User = db.user;
const Role = db.role;
const Organization = db.organization;
const ServiceAccount = db.service_account;

let authConfig;
try {
  authConfig = loadConfig('auth');
} catch (e) {
  log.error.error(`Failed to load auth configuration: ${e.message}`);
}

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
exports.signin = async (req, res) => {
  try {
    const { username, password, stayLoggedIn } = req.body;

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
          as: 'organization',
          attributes: ['name'],
        },
      ],
    });

    let isServiceAccount = false;

    // If no user found, check for a service account
    if (!user) {
      const serviceAccount = await ServiceAccount.findOne({
        where: { username, token: password },
      });

      if (serviceAccount) {
        if (new Date() > serviceAccount.expiresAt) {
          return res.status(401).send({ message: 'Service account has expired.' });
        }
        user = serviceAccount;
        isServiceAccount = true;
      } else {
        return res.status(404).send({ message: 'User Not found.' });
      }
    }

    if (!isServiceAccount) {
      const passwordIsValid = bcrypt.compareSync(password, user.password);
      if (!passwordIsValid) {
        return res.status(401).send({ accessToken: null, message: 'Invalid Password!' });
      }
    }

    // Use longer expiry for stayLoggedIn
    const tokenExpiry = stayLoggedIn ? '24h' : authConfig.auth.jwt.jwt_expiration.value || '24h';

    const token = jwt.sign(
      {
        id: user.id,
        isServiceAccount,
        stayLoggedIn,
        provider: isServiceAccount ? 'service_account' : user.authProvider || 'local',
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

    const organizationName = isServiceAccount ? null : (user.organization?.name ?? null);

    return res.status(200).send({
      id: user.id,
      username: user.username,
      email: isServiceAccount ? null : user.email,
      verified: isServiceAccount ? null : user.verified,
      emailHash: isServiceAccount ? null : user.emailHash,
      roles: authorities,
      organization: organizationName,
      accessToken: token,
      isServiceAccount,
      provider: isServiceAccount ? 'service_account' : user.authProvider || 'local',
      gravatarUrl: isServiceAccount ? null : user.gravatarUrl,
    });
  } catch (err) {
    log.error.error('Error in signin:', err);
    return res.status(500).send({ message: 'Error during signin process' });
  }
};
