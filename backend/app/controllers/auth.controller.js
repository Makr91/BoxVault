// auth.controller.js
const db = require("../models");
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require('crypto');
const mailController = require("./mail.controller");
const User = db.user;
const Role = db.role;
const Organization = db.organization;
const Invitation = db.invitation;
const ServiceAccount = db.service_account;
const Op = db.Sequelize.Op;
const authConfigPath = path.join(__dirname, '../config/auth.config.yaml');
let authConfig;
try {
  const fileContents = fs.readFileSync(authConfigPath, 'utf8');
  authConfig = yaml.load(fileContents);
} catch (e) {
  console.error(`Failed to load auth configuration: ${e.message}`);
}

const generateEmailHash = (email) => {
  return crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');
};

exports.signup = async (req, res) => {
  const { username, email, password, invitationToken } = req.body;

  try {
    let organization;
    let invitation;

    if (invitationToken) {
      // Handle signup with invitation token
      invitation = await Invitation.findOne({ where: { token: invitationToken } });

      if (!invitation) {
        return res.status(400).send({ message: "Invalid invitation token." });
      }

      if (invitation.expires < Date.now()) {
        // Set the expired flag to true
        await invitation.update({ expired: true });
        return res.status(400).send({ message: "Invitation token has expired." });
      }

      organization = await Organization.findByPk(invitation.organizationId);
    } else {
      // Handle signup without invitation token
      organization = await Organization.create({
        name: username
      });
    }

    if (!organization) {
      return res.status(400).send({ message: "Organization not found." });
    }

    // Check for duplicate username or email
    const duplicateUser = await User.findOne({
      where: {
        [Op.or]: [{ username }, { email }]
      }
    });

    if (duplicateUser) {
      return res.status(400).send({ message: "Username or email already in use." });
    }

    const emailHash = generateEmailHash(email);

    const user = await User.create({
      username,
      email,
      password: bcrypt.hashSync(password, 8),
      emailHash,
      organizationId: organization.id,
      verificationToken: crypto.randomBytes(20).toString('hex'),
      verificationTokenExpires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    });

    const userCount = await User.count();

    if (userCount === 1) {
      // Assign "admin" role to the first user
      const adminRole = await Role.findOne({ where: { name: "admin" } });
      const moderatorRole = await Role.findOne({ where: { name: "moderator" } });
      await user.setRoles([adminRole, moderatorRole]);
    } else {
      // Assign "user" role to all subsequent users
      const userRole = await Role.findOne({ where: { name: "user" } });
      await user.setRoles([userRole]);
    }

    // If signup was done with an invitation, mark it as accepted
    if (invitation) {
      await invitation.update({ accepted: true });
    }

    // Send verification email asynchronously
    mailController.sendVerificationMail(user, user.verificationToken, user.verificationTokenExpires)
      .then(() => {
        console.log(`Verification email sent successfully to ${user.email}`);
      })
      .catch((error) => {
        console.error(`Failed to send verification email to ${user.email}:`, error);
      });

    res.status(201).send({ message: "User registered successfully! If configured, a verification email will be sent to your email address." });
  } catch (err) {
    console.error("Error during signup:", err);
    res.status(500).send({
      message: err.message || "Some error occurred while signing up the user."
    });
  }
};

exports.sendInvitation = async (req, res) => {
  const { email, organizationName } = req.body;

  try {
    const organization = await Organization.findOne({ where: { name: organizationName } });

    if (!organization) {
      return res.status(404).send({ message: "Organization not found." });
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
    const invitationLink = await mailController.sendInvitationMail(email, invitationToken, organizationName, invitationTokenExpires);

    res.status(200).send({ 
      message: "Invitation sent successfully!",
      invitationToken: invitationToken,
      invitationTokenExpires: invitationTokenExpires,
      organizationId: organization.id,
      invitationLink: invitationLink
    });
  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while sending the invitation." });
  }
};

exports.getActiveInvitations = async (req, res) => {
  const { organizationName } = req.params;

  try {
    // First, find the organization by name
    const organization = await Organization.findOne({
      where: { name: organizationName }
    });

    if (!organization) {
      return res.status(404).send({ message: "Organization not found." });
    }

    const activeInvitations = await Invitation.findAll({
      where: {
        organizationId: organization.id,
        // Remove the 'accepted: false' and 'expired: false' conditions to get all invitations
      },
      attributes: ['id', 'email', 'token', 'expires', 'accepted', 'expired', 'createdAt']
    });

    res.status(200).send(activeInvitations);
  } catch (err) {
    console.error("Error in getActiveInvitations:", err);
    res.status(500).send({
      message: err.message || "Some error occurred while retrieving active invitations."
    });
  }
};

exports.deleteInvitation = async (req, res) => {
  const { invitationId } = req.params;

  try {
    const invitation = await Invitation.findByPk(invitationId);

    if (!invitation) {
      return res.status(404).send({ message: "Invitation not found." });
    }

    await invitation.destroy();
    res.status(200).send({ message: "Invitation deleted successfully." });
  } catch (err) {
    console.error("Error in deleteInvitation:", err);
    res.status(500).send({
      message: err.message || "Some error occurred while deleting the invitation."
    });
  }
};


exports.validateInvitationToken = async (req, res) => {
  const { token } = req.params;

  try {
    const invitation = await Invitation.findOne({ where: { token } });

    if (!invitation || invitation.expires < Date.now()) {
      return res.status(400).send({ message: "Invalid or expired invitation token." });
    }

    const organization = await Organization.findByPk(invitation.organizationId);

    res.status(200).send({ organizationName: organization.name });
  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while validating the invitation token." });
  }
};


exports.verifyMail = async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({ where: { verificationToken: token } });

    if (!user) {
      return res.status(400).send({ message: "Invalid or expired verification token." });
    }

    if (user.verificationTokenExpires < Date.now()) {
      return res.status(400).send({ 
        message: "Verification token has expired.",
        expirationTime: user.verificationTokenExpires
      });
    }

    user.verified = true;
    user.verificationToken = null;
    user.verificationTokenExpires = null;
    await user.save();

    res.send({ 
      message: "Email verified successfully.",
      expirationTime: user.verificationTokenExpires
    });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

exports.signin = async (req, res) => {
  try {
    const { username, password, stayLoggedIn } = req.body;

    // First, try to find a regular user
    let user = await User.findOne({
      where: { username: username },
      include: [
        {
          model: Role,
          as: 'roles',
          attributes: ['name'],
          through: { attributes: [] }
        },
        {
          model: Organization,
          as: 'organization',
          attributes: ['name']
        }
      ]
    });

    let isServiceAccount = false;

    // If no user found, check for a service account
    if (!user) {
      const serviceAccount = await ServiceAccount.findOne({
        where: { username: username, token: password }
      });

      if (serviceAccount) {
        if (new Date() > serviceAccount.expiresAt) {
          return res.status(401).send({ message: "Service account has expired." });
        }
        user = serviceAccount;
        isServiceAccount = true;
      } else {
        return res.status(404).send({ message: "User Not found." });
      }
    }

    if (!isServiceAccount) {
      const passwordIsValid = bcrypt.compareSync(password, user.password);
      if (!passwordIsValid) {
        return res.status(401).send({ accessToken: null, message: "Invalid Password!" });
      }
    }

    // Use longer expiry for stayLoggedIn
    const tokenExpiry = stayLoggedIn ? '24h' : authConfig.jwt.jwt_token_time_valid.value;
    
    const token = jwt.sign(
      { 
        id: user.id, 
        isServiceAccount: isServiceAccount,
        stayLoggedIn: stayLoggedIn
      },
      authConfig.jwt.jwt_secret.value,
      {
        algorithm: 'HS256',
        allowInsecureKeySizes: true,
        expiresIn: tokenExpiry,
      }
    );

    const authorities = isServiceAccount 
      ? ["ROLE_SERVICE_ACCOUNT"]
      : user.roles.map(role => "ROLE_" + role.name.toUpperCase());

    res.status(200).send({
      id: user.id,
      username: user.username,
      email: isServiceAccount ? null : user.email,
      verified: isServiceAccount ? null : user.verified,
      emailHash: isServiceAccount ? null : user.emailHash,
      roles: authorities,
      organization: isServiceAccount ? null : (user.organization ? user.organization.name : null),
      accessToken: token,
      isServiceAccount: isServiceAccount,
      gravatarUrl: isServiceAccount ? null : user.gravatarUrl
    });
  } catch (err) {
    console.error("Error in signin:", err);
    res.status(500).send({ message: "Error during signin process" });
  }
};

exports.deleteUser = (req, res) => {
  const userId = req.params.userId;

  User.destroy({
    where: { id: userId }
  })
    .then(num => {
      if (num == 1) {
        res.send({ message: "User was deleted successfully!" });
      } else {
        res.send({ message: `Cannot delete User with id=${userId}. Maybe User was not found!` });
      }
    })
    .catch(err => {
      res.status(500).send({
        message: "Could not delete User with id=" + userId
      });
    });
};

   // Method to suspend a user
   exports.suspendUser = async (req, res) => {
     const { userId } = req.params;
     try {
       const user = await User.findByPk(userId);
       if (!user) {
         return res.status(404).send({ message: "User not found." });
       }
       // Assuming there's a 'suspended' field in the User model
       await user.update({ suspended: true });
       res.status(200).send({ message: "User suspended successfully." });
     } catch (err) {
       res.status(500).send({ message: err.message || "Some error occurred while suspending the user." });
     }
   };

   exports.resumeUser = async (req, res) => {
    const { userId } = req.params;

    try {
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).send({ message: "User not found." });
      }

      user.suspended = false;
      await user.save();

      res.status(200).send({ message: "User resumed successfully!" });
    } catch (err) {
      res.status(500).send({ message: err.message || "Some error occurred while resuming the user." });
    }
  };

// If you have an update user function, ensure it also updates the email hash
// Refresh token endpoint
exports.refreshToken = async (req, res) => {
  try {
    // Get user from request (set by authJwt middleware)
    const user = req.user;
    const { stayLoggedIn } = req.body;
    
    // Check if either the current token or the request wants stayLoggedIn
    if (!user.stayLoggedIn && !stayLoggedIn) {
      return res.status(403).send({ message: "Token refresh only allowed for stay-logged-in sessions" });
    }

    // Generate new token with the requested stayLoggedIn state
    const token = jwt.sign(
      { 
        id: user.id, 
        isServiceAccount: false,
        stayLoggedIn: stayLoggedIn || user.stayLoggedIn // Keep existing state if not provided
      },
      authConfig.jwt.jwt_secret.value,
      {
        algorithm: 'HS256',
        allowInsecureKeySizes: true,
        expiresIn: '24h',
      }
    );

    res.status(200).send({
      accessToken: token,
      stayLoggedIn: stayLoggedIn || user.stayLoggedIn
    });
  } catch (err) {
    console.error("Error in refreshToken:", err);
    res.status(500).send({ message: "Error refreshing token" });
  }
};

exports.updateUser = async (req, res) => {
  const { userId } = req.params;
  const { email } = req.body;

  try {
    const emailHash = generateEmailHash(email);

    await User.update(
      { email, emailHash },
      { where: { id: userId } }
    );

    res.send({ message: "User updated successfully!" });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};
