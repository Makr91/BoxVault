// signup.js
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { log } = require('../../utils/Logger');
const db = require('../../models');
const mailController = require('../mail.controller');
const { generateEmailHash } = require('./helpers');
const { loadConfig } = require('../../utils/config-loader');

let authConfig;
try {
  authConfig = loadConfig('auth');
} catch {
  // Config will be loaded when needed
}

const User = db.user;
const Role = db.role;
const Organization = db.organization;
const Invitation = db.invitation;
const { Op } = db.Sequelize;

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
        return res.status(400).send({ message: req.__('auth.invalidInvitationToken') });
      }

      if (invitation.expires < Date.now()) {
        // Set the expired flag to true
        await invitation.update({ expired: true });
        return res.status(400).send({ message: req.__('auth.invitationTokenExpired') });
      }

      organization = await Organization.findByPk(invitation.organizationId);
    } else {
      // Handle signup without invitation token
      const generateOrgCode = () => Math.random().toString(16).substr(2, 6).toUpperCase();
      organization = await Organization.create({
        name: username,
        org_code: generateOrgCode(),
      });
    }

    if (!organization) {
      return res.status(400).send({ message: req.__('organizations.organizationNotFound') });
    }

    // Check for duplicate username or email
    const duplicateUser = await User.findOne({
      where: {
        [Op.or]: [{ username }, { email }],
      },
    });

    if (duplicateUser) {
      return res.status(400).send({ message: req.__('auth.usernameOrEmailInUse') });
    }

    const emailHash = generateEmailHash(email);

    const user = await User.create({
      username,
      email,
      password: bcrypt.hashSync(password, 8),
      emailHash,
      primary_organization_id: organization.id,
      verificationToken: crypto.randomBytes(20).toString('hex'),
      verificationTokenExpires:
        Date.now() +
        (authConfig.auth?.jwt?.verification_token_expiry_hours?.value || 24) * 60 * 60 * 1000,
    });

    const userCount = await User.count();
    let assignedRole = 'user';

    if (userCount === 1) {
      // First user gets admin role
      assignedRole = 'admin';
      const adminRole = await Role.findOne({ where: { name: 'admin' } });
      const moderatorRole = await Role.findOne({ where: { name: 'moderator' } });
      await user.setRoles([adminRole, moderatorRole]);
    } else {
      // Use invited role or default to user
      assignedRole = invitation?.invited_role || 'user';
      const userRole = await Role.findOne({ where: { name: 'user' } });
      await user.setRoles([userRole]);
    }

    // Create user-organization relationship
    await db.UserOrg.create({
      user_id: user.id,
      organization_id: organization.id,
      role: assignedRole,
      is_primary: true, // First/primary organization
    });

    // If signup was done with an invitation, mark it as accepted
    if (invitation) {
      await invitation.update({ accepted: true });
    }

    // Send verification email asynchronously
    mailController
      .sendVerificationMail(
        user,
        user.verificationToken,
        user.verificationTokenExpires,
        req.getLocale()
      )
      .then(() => {
        log.app.info(`Verification email sent successfully to ${user.email}`);
      })
      .catch(error => {
        log.error.error(`Failed to send verification email to ${user.email}:`, error);
      });

    return res.status(201).send({
      message: req.__('auth.userRegistered'),
    });
  } catch (err) {
    log.error.error('Error during signup:', err);
    return res.status(500).send({
      message: err.message || req.__('auth.signupError'),
    });
  }
};
