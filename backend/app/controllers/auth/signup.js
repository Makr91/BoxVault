// signup.js
import { hashSync } from 'bcryptjs';
import { randomBytes } from 'crypto';
import { log } from '../../utils/Logger.js';
import { refuse } from '../../utils/problem.js';
import db from '../../models/index.js';
const { user: User, role: Role, organization: Organization, invitation: Invitation, UserOrg } = db;
import { sendVerificationMail } from '../mail/verification.js';
import { generateEmailHash, generateOrgCode } from '../../utils/identity.js';
import { getBcryptRounds, getPasswordPolicyErrors } from './helpers.js';
import { loadConfig } from '../../utils/config-loader.js';
import { notifyInvitationAccepted } from './invitation/notifications.js';
import { toSupportedLanguage } from '../../utils/userLanguage.js';

/**
 * Enforce the invitation rules for a token signup: the invitation must exist,
 * be unused, be unexpired, and be addressed to the signup email. Sends the 400
 * and returns the response when a rule fails; returns null when valid.
 * @param {Object|null} invitation - Invitation row matched by token (or null)
 * @param {string} email - Signup email from the request body
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @returns {Promise<Object|null>} The sent rejection response, or null
 */
const rejectInvalidInvitation = async (invitation, email, req, res) => {
  if (!invitation) {
    return res.status(400).send({ message: req.__('auth.invalidInvitationToken') });
  }

  // Single-use: a consumed invitation can never register a second account.
  if (invitation.accepted) {
    return res.status(400).send({ message: req.__('auth.invitationAlreadyUsed') });
  }

  if (invitation.expired || invitation.expires < Date.now()) {
    // Set the expired flag to true
    await invitation.update({ expired: true });
    return res.status(400).send({ message: req.__('auth.invitationTokenExpired') });
  }

  // Email-bound: the invitation is addressed to a specific mailbox
  // (mirrors the accept-invitation controller).
  if (!email || email.toLowerCase() !== invitation.email.toLowerCase()) {
    return res.status(400).send({
      message: req.__('auth.invitationEmailMismatch', { email: invitation.email }),
    });
  }

  return null;
};

/**
 * The taken values of a signup, username and email checked against every
 * account, each as a `unique` failure scoped `global`.
 * @param {string} username - Signup username
 * @param {string} email - Signup email
 * @returns {Promise<Array<{pointer: string, rule: string, params: Object}>>} Failing rules, or none
 */
const getTakenValues = async (username, email) => {
  const errors = [];
  if (await User.findOne({ where: { username } })) {
    errors.push({ pointer: '/username', rule: 'unique', params: { scope: 'global' } });
  }
  if (await User.findOne({ where: { email } })) {
    errors.push({ pointer: '/email', rule: 'unique', params: { scope: 'global' } });
  }
  return errors;
};

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
 *                 description: Unique username for the user (the slug pattern of /api/rules, 3 to 64 characters)
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *               password:
 *                 type: string
 *                 format: password
 *                 description: User's password, at least the host's configured minimum (15 by default) and at most 128 characters
 *               name:
 *                 type: string
 *                 description: Optional display name
 *               invitation_token:
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
 *         description: The invitation token is invalid, used, expired or addressed to another email
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: The username or email is already taken
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the register form, or the password is on the blocklist
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const signup = async (req, res) => {
  const { username, email, password, invitation_token: invitationToken, name } = req.body || {};

  try {
    const authConfig = loadConfig('auth');
    let organization;
    let invitation;

    // local_enabled=false switches off LOCAL SIGNUP too (same knob that gates
    // local signin). The very first account (fresh install bootstrap) is
    // always allowed.
    const existingUsers = await User.count();
    if (existingUsers > 0 && authConfig.auth?.jwt?.local_enabled === false) {
      return res.status(403).send({ message: req.__('auth.localAuthDisabled') });
    }

    const passwordErrors = getPasswordPolicyErrors(password, '/password');
    if (passwordErrors.length > 0) {
      return refuse(res, req, passwordErrors);
    }

    const takenValues = await getTakenValues(username, email);
    if (takenValues.length > 0) {
      return refuse(res, req, takenValues);
    }

    if (invitationToken) {
      // Handle signup with invitation token
      invitation = await Invitation.findOne({ where: { token: invitationToken } });

      const rejection = await rejectInvalidInvitation(invitation, email, req, res);
      if (rejection) {
        return rejection;
      }

      organization = await Organization.findByPk(invitation.organizationId);
    } else {
      // Handle signup without invitation token — this creates a new (personal)
      // organization, which the local_allow_new_organizations knob gates (#18).
      // The very first account (fresh install bootstrap) is always allowed.
      if (existingUsers > 0 && !authConfig.auth?.local?.local_allow_new_organizations) {
        return res.status(403).send({ message: req.__('auth.newOrganizationsDisabled') });
      }

      organization = await Organization.create({
        name: username,
        org_code: await generateOrgCode(db),
      });
    }

    if (!organization) {
      return res.status(400).send({ message: req.__('organizations.organizationNotFound') });
    }

    const emailHash = generateEmailHash(email);

    const user = await User.create({
      username,
      name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 255) : null,
      email,
      password: hashSync(password, getBcryptRounds()),
      emailHash,
      // Registration is the only point a local account states a language, so
      // the request locale is captured as the initial preference.
      preferredLanguage: toSupportedLanguage(req.getLocale()),
      primary_organization_id: organization.id,
      verificationToken: randomBytes(20).toString('hex'),
      verificationTokenExpires:
        Date.now() + (authConfig.auth?.jwt?.verification_token_expiry_hours || 24) * 60 * 60 * 1000,
    });

    const userCount = await User.count();

    // Per-org role: invited users get the invited role; a self-signup creates
    // a personal organization with the creator as its owner.
    let assignedRole = invitation ? invitation.invited_role || 'member' : 'owner';

    if (userCount === 1) {
      // First user gets the global admin role; their personal org role is owner
      assignedRole = 'owner';
      const adminRole = await Role.findOne({ where: { name: 'admin' } });
      await user.setRoles([adminRole]);
    } else {
      const userRole = await Role.findOne({ where: { name: 'user' } });
      await user.setRoles([userRole]);
    }

    // Create user-organization relationship
    await UserOrg.create({
      user_id: user.id,
      organization_id: organization.id,
      role: assignedRole,
      is_primary: true, // First/primary organization
    });

    // If signup was done with an invitation, mark it as accepted
    if (invitation) {
      await invitation.update({ accepted: true, accepted_at: new Date() });
      await notifyInvitationAccepted(invitation, organization, user.email);
    }

    // Send verification email asynchronously
    sendVerificationMail(
      user,
      user.verificationToken,
      user.verificationTokenExpires,
      user.preferredLanguage
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
      message: req.__('auth.signupError'),
    });
  }
};
