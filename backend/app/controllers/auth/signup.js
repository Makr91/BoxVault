// signup.js
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { log } = require('../../utils/Logger');
const db = require('../../models');
const mailController = require('../mail.controller');
const { generateEmailHash } = require('./helpers');

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

    return res.status(201).send({
      message:
        'User registered successfully! If configured, a verification email will be sent to your email address.',
    });
  } catch (err) {
    log.error.error('Error during signup:', err);
    return res.status(500).send({
      message: err.message || 'Some error occurred while signing up the user.',
    });
  }
};
