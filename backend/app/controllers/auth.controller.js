// auth.controller.js
const db = require('../models');
const { loadConfig } = require('../utils/config-loader');
const { log } = require('../utils/Logger');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const mailController = require('./mail.controller');
const User = db.user;
const Role = db.role;
const Organization = db.organization;
const Invitation = db.invitation;
const ServiceAccount = db.service_account;
const { Op } = db.Sequelize;
let authConfig;
try {
  authConfig = loadConfig('auth');
} catch (e) {
  log.error.error(`Failed to load auth configuration: ${e.message}`);
}

const generateEmailHash = email =>
  crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');

/**
 * @swagger
 * /api/auth/signup:
 *   post:
 *     summary: Register a new user
 *     description: Create a new user account, optionally with an invitation token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: Unique username for the user
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *               password:
 *                 type: string
 *                 format: password
 *                 description: User's password
 *               invitationToken:
 *                 type: string
 *                 description: Optional invitation token for joining an organization
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User registered successfully! If configured, a verification email will be sent to your email address."
 *       400:
 *         description: Bad request - invalid data or duplicate user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Username or email already in use."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
exports.signup = async (req, res) => {
  const { username, email, password, invitationToken } = req.body;

  try {
    let organization;
    let invitation;

    if (invitationToken) {
      // Handle signup with invitation token
      invitation = await Invitation.findOne({ where: { token: invitationToken } });

      if (!invitation) {
        return res.status(400).send({ message: 'Invalid invitation token.' });
      }

      if (invitation.expires < Date.now()) {
        // Set the expired flag to true
        await invitation.update({ expired: true });
        return res.status(400).send({ message: 'Invitation token has expired.' });
      }

      organization = await Organization.findByPk(invitation.organizationId);
    } else {
      // Handle signup without invitation token
      organization = await Organization.create({
        name: username,
      });
    }

    if (!organization) {
      return res.status(400).send({ message: 'Organization not found.' });
    }

    // Check for duplicate username or email
    const duplicateUser = await User.findOne({
      where: {
        [Op.or]: [{ username }, { email }],
      },
    });

    if (duplicateUser) {
      return res.status(400).send({ message: 'Username or email already in use.' });
    }

    const emailHash = generateEmailHash(email);

    const user = await User.create({
      username,
      email,
      password: bcrypt.hashSync(password, 8),
      emailHash,
      organizationId: organization.id,
      verificationToken: crypto.randomBytes(20).toString('hex'),
      verificationTokenExpires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    });

    const userCount = await User.count();

    if (userCount === 1) {
      // Assign "admin" role to the first user
      const adminRole = await Role.findOne({ where: { name: 'admin' } });
      const moderatorRole = await Role.findOne({ where: { name: 'moderator' } });
      await user.setRoles([adminRole, moderatorRole]);
    } else {
      // Assign "user" role to all subsequent users
      const userRole = await Role.findOne({ where: { name: 'user' } });
      await user.setRoles([userRole]);
    }

    // If signup was done with an invitation, mark it as accepted
    if (invitation) {
      await invitation.update({ accepted: true });
    }

    // Send verification email asynchronously
    mailController
      .sendVerificationMail(user, user.verificationToken, user.verificationTokenExpires)
      .then(() => {
        log.app.info(`Verification email sent successfully to ${user.email}`);
      })
      .catch(error => {
        log.error.error(`Failed to send verification email to ${user.email}:`, error);
      });

    res.status(201).send({
      message:
        'User registered successfully! If configured, a verification email will be sent to your email address.',
    });
  } catch (err) {
    log.error.error('Error during signup:', err);
    res.status(500).send({
      message: err.message || 'Some error occurred while signing up the user.',
    });
  }
};

/**
 * @swagger
 * /api/auth/invite:
 *   post:
 *     summary: Send an invitation to join an organization
 *     description: Send an email invitation for a user to join a specific organization
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - organizationName
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address to send invitation to
 *               organizationName:
 *                 type: string
 *                 description: Name of the organization to invite user to
 *     responses:
 *       200:
 *         description: Invitation sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Invitation sent successfully!"
 *                 invitationToken:
 *                   type: string
 *                   description: The invitation token
 *                 invitationTokenExpires:
 *                   type: number
 *                   description: Expiration timestamp
 *                 organizationId:
 *                   type: integer
 *                   description: ID of the organization
 *                 invitationLink:
 *                   type: string
 *                   description: Direct link to accept invitation
 *       404:
 *         description: Organization not found
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
exports.sendInvitation = async (req, res) => {
  const { email, organizationName } = req.body;

  try {
    const organization = await Organization.findOne({ where: { name: organizationName } });

    if (!organization) {
      return res.status(404).send({ message: 'Organization not found.' });
    }

    const invitationToken = crypto.randomBytes(20).toString('hex');
    const invitationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    // Save the invitation details in the database
    const invitation = await Invitation.create({
      email,
      token: invitationToken,
      expires: invitationTokenExpires,
      organizationId: organization.id,
    });

    // Send the invitation email and get the invitation link
    const invitationLink = await mailController.sendInvitationMail(
      email,
      invitationToken,
      organizationName,
      invitationTokenExpires
    );

    res.status(200).send({
      message: 'Invitation sent successfully!',
      invitationToken,
      invitationTokenExpires,
      organizationId: organization.id,
      invitationLink,
    });
  } catch (err) {
    res
      .status(500)
      .send({ message: err.message || 'Some error occurred while sending the invitation.' });
  }
};

/**
 * @swagger
 * /api/invitations/active/{organizationName}:
 *   get:
 *     summary: Get active invitations for an organization
 *     description: Retrieve all invitations (active, expired, accepted) for a specific organization
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the organization
 *     responses:
 *       200:
 *         description: List of invitations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     description: Invitation ID
 *                   email:
 *                     type: string
 *                     format: email
 *                     description: Invited email address
 *                   token:
 *                     type: string
 *                     description: Invitation token
 *                   expires:
 *                     type: string
 *                     format: date-time
 *                     description: Expiration date
 *                   accepted:
 *                     type: boolean
 *                     description: Whether invitation was accepted
 *                   expired:
 *                     type: boolean
 *                     description: Whether invitation has expired
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *                     description: Creation date
 *       404:
 *         description: Organization not found
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
exports.getActiveInvitations = async (req, res) => {
  const { organizationName } = req.params;

  try {
    // First, find the organization by name
    const organization = await Organization.findOne({
      where: { name: organizationName },
    });

    if (!organization) {
      return res.status(404).send({ message: 'Organization not found.' });
    }

    const activeInvitations = await Invitation.findAll({
      where: {
        organizationId: organization.id,
        // Remove the 'accepted: false' and 'expired: false' conditions to get all invitations
      },
      attributes: ['id', 'email', 'token', 'expires', 'accepted', 'expired', 'createdAt'],
    });

    res.status(200).send(activeInvitations);
  } catch (err) {
    log.error.error('Error in getActiveInvitations:', err);
    res.status(500).send({
      message: err.message || 'Some error occurred while retrieving active invitations.',
    });
  }
};

/**
 * @swagger
 * /api/invitations/{invitationId}:
 *   delete:
 *     summary: Delete an invitation
 *     description: Remove an invitation from the system
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: invitationId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the invitation to delete
 *     responses:
 *       200:
 *         description: Invitation deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Invitation deleted successfully."
 *       404:
 *         description: Invitation not found
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
exports.deleteInvitation = async (req, res) => {
  const { invitationId } = req.params;

  try {
    const invitation = await Invitation.findByPk(invitationId);

    if (!invitation) {
      return res.status(404).send({ message: 'Invitation not found.' });
    }

    await invitation.destroy();
    res.status(200).send({ message: 'Invitation deleted successfully.' });
  } catch (err) {
    log.error.error('Error in deleteInvitation:', err);
    res.status(500).send({
      message: err.message || 'Some error occurred while deleting the invitation.',
    });
  }
};

/**
 * @swagger
 * /api/auth/validate-invitation/{token}:
 *   get:
 *     summary: Validate an invitation token
 *     description: Check if an invitation token is valid and get organization information
 *     tags: [Authentication]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Invitation token to validate
 *     responses:
 *       200:
 *         description: Valid invitation token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 organizationName:
 *                   type: string
 *                   description: Name of the organization
 *       400:
 *         description: Invalid or expired invitation token
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
exports.validateInvitationToken = async (req, res) => {
  const { token } = req.params;

  try {
    const invitation = await Invitation.findOne({ where: { token } });

    if (!invitation || invitation.expires < Date.now()) {
      return res.status(400).send({ message: 'Invalid or expired invitation token.' });
    }

    const organization = await Organization.findByPk(invitation.organizationId);

    res.status(200).send({ organizationName: organization.name });
  } catch (err) {
    res.status(500).send({
      message: err.message || 'Some error occurred while validating the invitation token.',
    });
  }
};

/**
 * @swagger
 * /api/auth/verify-mail/{token}:
 *   get:
 *     summary: Verify email address
 *     description: Verify a user's email address using a verification token
 *     tags: [Authentication]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Email verification token
 *     responses:
 *       200:
 *         description: Email verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Email verified successfully."
 *                 expirationTime:
 *                   type: number
 *                   description: Token expiration timestamp
 *       400:
 *         description: Invalid or expired verification token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Verification token has expired."
 *                 expirationTime:
 *                   type: number
 *                   description: Token expiration timestamp
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
exports.verifyMail = async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({ where: { verificationToken: token } });

    if (!user) {
      return res.status(400).send({ message: 'Invalid or expired verification token.' });
    }

    if (user.verificationTokenExpires < Date.now()) {
      return res.status(400).send({
        message: 'Verification token has expired.',
        expirationTime: user.verificationTokenExpires,
      });
    }

    user.verified = true;
    user.verificationToken = null;
    user.verificationTokenExpires = null;
    await user.save();

    res.send({
      message: 'Email verified successfully.',
      expirationTime: user.verificationTokenExpires,
    });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
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

    res.status(200).send({
      id: user.id,
      username: user.username,
      email: isServiceAccount ? null : user.email,
      verified: isServiceAccount ? null : user.verified,
      emailHash: isServiceAccount ? null : user.emailHash,
      roles: authorities,
      organization: isServiceAccount ? null : user.organization ? user.organization.name : null,
      accessToken: token,
      isServiceAccount,
      provider: isServiceAccount ? 'service_account' : user.authProvider || 'local',
      gravatarUrl: isServiceAccount ? null : user.gravatarUrl,
    });
  } catch (err) {
    log.error.error('Error in signin:', err);
    res.status(500).send({ message: 'Error during signin process' });
  }
};

/**
 * @swagger
 * /api/users/{userId}:
 *   delete:
 *     summary: Delete a user
 *     description: Remove a user from the system
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to delete
 *     responses:
 *       200:
 *         description: User deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User was deleted successfully!"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Could not delete User with id=1"
 */
exports.deleteUser = (req, res) => {
  const { userId } = req.params;

  User.destroy({
    where: { id: userId },
  })
    .then(num => {
      if (num == 1) {
        res.send({ message: 'User was deleted successfully!' });
      } else {
        res.send({ message: `Cannot delete User with id=${userId}. Maybe User was not found!` });
      }
    })
    .catch(err => {
      res.status(500).send({
        message: `Could not delete User with id=${userId}`,
      });
    });
};

/**
 * @swagger
 * /api/users/{userId}/suspend:
 *   put:
 *     summary: Suspend a user
 *     description: Suspend a user account
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to suspend
 *     responses:
 *       200:
 *         description: User suspended successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User suspended successfully."
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
// Method to suspend a user
exports.suspendUser = async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).send({ message: 'User not found.' });
    }
    // Assuming there's a 'suspended' field in the User model
    await user.update({ suspended: true });
    res.status(200).send({ message: 'User suspended successfully.' });
  } catch (err) {
    res
      .status(500)
      .send({ message: err.message || 'Some error occurred while suspending the user.' });
  }
};

/**
 * @swagger
 * /api/users/{userId}/resume:
 *   put:
 *     summary: Resume a suspended user
 *     description: Reactivate a suspended user account
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to resume
 *     responses:
 *       200:
 *         description: User resumed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User resumed successfully!"
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
exports.resumeUser = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).send({ message: 'User not found.' });
    }

    user.suspended = false;
    await user.save();

    res.status(200).send({ message: 'User resumed successfully!' });
  } catch (err) {
    res
      .status(500)
      .send({ message: err.message || 'Some error occurred while resuming the user.' });
  }
};

// If you have an update user function, ensure it also updates the email hash
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
// Refresh token endpoint
exports.refreshToken = async (req, res) => {
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

    res.status(200).send({
      accessToken: token,
      stayLoggedIn: stayLoggedIn || user.stayLoggedIn,
    });
  } catch (err) {
    log.error.error('Error in refreshToken:', err);
    res.status(500).send({ message: 'Error refreshing token' });
  }
};

/**
 * @swagger
 * /api/users/{userId}:
 *   put:
 *     summary: Update user information
 *     description: Update a user's email address and email hash
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: New email address
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User updated successfully!"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
exports.updateUser = async (req, res) => {
  const { userId } = req.params;
  const { email } = req.body;

  try {
    const emailHash = generateEmailHash(email);

    await User.update({ email, emailHash }, { where: { id: userId } });

    res.send({ message: 'User updated successfully!' });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};
