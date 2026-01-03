// getuserprofile.js
const jwt = require('jsonwebtoken');

const { loadConfig } = require('../../utils/config-loader');
const { log } = require('../../utils/Logger');
const db = require('../../models');

const User = db.user;
const Role = db.role;
const Organization = db.organization;

let authConfig;
try {
  authConfig = loadConfig('auth');
} catch (e) {
  log.error.error(`Failed to load auth configuration: ${e.message}`);
}

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
 *                 gravatarUrl:
 *                   type: string
 *                   description: Gravatar URL
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
exports.getUserProfile = async (req, res) => {
  try {
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
      return res.status(404).send({ message: 'User Not found.' });
    }

    const token = jwt.sign({ id: user.id }, authConfig.auth.jwt.jwt_secret.value, {
      expiresIn: authConfig.auth.jwt.jwt_expiration.value || '24h',
    });

    const authorities = user.roles.map(role => `ROLE_${role.name.toUpperCase()}`);

    return res.status(200).send({
      id: user.id,
      username: user.username,
      email: user.email,
      verified: user.verified,
      emailHash: user.emailHash,
      roles: authorities,
      organization: user.primaryOrganization ? user.primaryOrganization.name : null,
      accessToken: token,
      gravatarUrl: user.gravatarUrl,
    });
  } catch (error) {
    log.error.error('Error retrieving user profile:', error);
    return res.status(500).send({ message: 'Error retrieving user profile' });
  }
};
