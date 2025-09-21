const db = require("../models");
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require('crypto');
const User = db.user;
const Role = db.role;
const Organization = db.organization;

const { loadConfig } = require('../utils/config-loader');
const { log } = require('../utils/Logger');
let authConfig;
try {
  authConfig = loadConfig('auth');
} catch (e) {
  log.error.error(`Failed to load auth configuration: ${e.message}`);
}

/**
 * @swagger
 * /api/users/all:
 *   get:
 *     summary: Get project information
 *     description: Retrieve general information about the BoxVault project (public access)
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Project information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 title:
 *                   type: string
 *                   example: "BoxVault Project Synopsis"
 *                 description:
 *                   type: string
 *                   example: "BoxVault is a self-hosted solution designed to store and manage Virtual Machine templates."
 *                 components:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       title:
 *                         type: string
 *                       details:
 *                         type: array
 *                         items:
 *                           type: string
 *                 features:
 *                   type: array
 *                   items:
 *                     type: string
 *                 goal:
 *                   type: string
 */
exports.allAccess = (req, res) => {
  const projectData = {
    title: "BoxVault Project Synopsis",
    description: "BoxVault is a self-hosted solution designed to store and manage Virtual Machine templates.",
    components: [
      {
        title: "Backend API",
        details: [
          "Built using Node.js and Express.js",
          "Handles user authentication and authorization",
          "Provides endpoints for uploading, storing, and retrieving Vagrant boxes",
          "Uses MariaDB for database operations"
        ]
      },
      {
        title: "Frontend Interface",
        details: [
          "Created with React and React Hooks",
          "Offers a user-friendly interface for interacting with the backend API",
          "Allows users to register, login, upload boxes, view box listings, and manage their accounts"
        ]
      }
    ],
    features: [
      "User authentication and role-based access control",
      "File upload and storage management for Vagrant boxes",
      "Box listing and filtering capabilities",
      "User profile management"
    ],
    goal: "The project aims to provide a secure, scalable, and easy-to-use platform for developers to store and share their Virtual Machine templates within their own infrastructure."
  };

  res.status(200).json(projectData);
};

/**
 * @swagger
 * /api/organizations/{organizationName}/only-user:
 *   get:
 *     summary: Check if user is the only user in organization
 *     description: Determine if the current user is the only user in the specified organization
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationName
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *     responses:
 *       200:
 *         description: Check completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isOnlyUser:
 *                   type: boolean
 *                   description: Whether the user is the only user in the organization
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
exports.isOnlyUserInOrg = async (req, res) => {
  const { organizationName } = req.params;

  try {
    const organization = await Organization.findOne({
      where: { name: organizationName }
    });

    if (!organization) {
      return res.status(404).send({ message: `Organization ${organizationName} not found.` });
    }

    const users = await User.findAll({
      where: { organizationId: organization.id }
    });

    if (users.length === 1) {
      return res.status(200).send({ isOnlyUser: true });
    } else {
      return res.status(200).send({ isOnlyUser: false });
    }
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while checking the organization users."
    });
  }
};

/**
 * @swagger
 * /api/users/user:
 *   get:
 *     summary: Get user board content
 *     description: Retrieve content for authenticated users
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User content retrieved successfully
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "User Content."
 */
exports.userBoard = (req, res) => {
  res.status(200).send("User Content.");
};

/**
 * @swagger
 * /api/users/admin:
 *   get:
 *     summary: Get admin board content
 *     description: Retrieve content for admin users only
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin content retrieved successfully
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "Admin Content."
 */
exports.adminBoard = (req, res) => {
  res.status(200).send("Admin Content.");
};

/**
 * @swagger
 * /api/organizations:
 *   get:
 *     summary: Get organization content
 *     description: Retrieve organization-related content for authenticated users
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Organization content retrieved successfully
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "Moderator Content."
 */
exports.organization = (req, res) => {
  res.status(200).send("Moderator Content.");
};

/**
 * @swagger
 * /api/organization/{organizationName}/users:
 *   get:
 *     summary: Get all users in an organization
 *     description: Retrieve all users belonging to a specific organization
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationName
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *     responses:
 *       200:
 *         description: List of users in the organization
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
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
exports.findAll = async (req, res) => {
  try {
    const { organizationName } = req.params;
    const organization = await Organization.findOne({
      where: { name: organizationName },
      include: ["users"]
    });

    if (!organization) {
      return res.status(404).send({
        message: `Organization ${organizationName} not found.`
      });
    }

    res.send(organization.users);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while retrieving users."
    });
  }
};

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
          through: { attributes: [] }
        },
        {
          model: Organization,
          as: 'organization',
          attributes: ['name']
        }
      ]
    });

    if (!user) {
      return res.status(404).send({ message: "User Not found." });
    }

    const token = jwt.sign({ id: user.id }, authConfig.auth.jwt.jwt_secret.value, {
      expiresIn: authConfig.auth.jwt.jwt_expiration.value || '24h',
    });

    const authorities = user.roles.map(role => "ROLE_" + role.name.toUpperCase());

    res.status(200).send({
      id: user.id,
      username: user.username,
      email: user.email,
      verified: user.verified,
      emailHash: user.emailHash,
      roles: authorities,
      organization: user.organization ? user.organization.name : null,
      accessToken: token,
      gravatarUrl: user.gravatarUrl
    });
  } catch (error) {
      log.error.error("Error retrieving user profile:", error); // Ensure this is logging the error
      res.status(500).send({ message: "Error retrieving user profile" });
    }
};

/**
 * @swagger
 * /api/organization/{organizationName}/users/{userName}:
 *   get:
 *     summary: Get a specific user in an organization
 *     description: Retrieve information about a specific user within an organization (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationName
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: path
 *         name: userName
 *         required: true
 *         schema:
 *           type: string
 *         description: Username
 *     responses:
 *       200:
 *         description: User information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: User or organization not found
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
exports.findOne = async (req, res) => {
  const { organizationName, userName } = req.params;

  try {
    const organization = await Organization.findOne({
      where: { name: organizationName }
    });

    if (!organization) {
      return res.status(404).send({
        message: `Organization ${organizationName} not found.`
      });
    }
    
    const user = await User.findOne({
      where: {
        username: userName,
        organizationId: organization.id
      }
    });

    if (!user) {
      return res.status(404).send({
        message: `User ${userName} not found.`
      });
    }

    res.status(200).send(user);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while retrieving the user."
    });
  }
};

/**
 * @swagger
 * /api/organization/{organizationName}/users/{userName}:
 *   put:
 *     summary: Update a user in an organization
 *     description: Update user information within an organization (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationName
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: path
 *         name: userName
 *         required: true
 *         schema:
 *           type: string
 *         description: Username
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 description: New username
 *               email:
 *                 type: string
 *                 format: email
 *                 description: New email address
 *               password:
 *                 type: string
 *                 format: password
 *                 description: New password
 *               roles:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: User roles
 *               organization:
 *                 type: string
 *                 description: New organization name
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: User or organization not found
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
exports.update = async (req, res) => {
  const { organizationName, userName } = req.params;
  const { username, email, password, roles, organization } = req.body;

  try {
    const old_organization = await Organization.findOne({
      where: { name: organizationName }
    });

    const new_organization = await Organization.findOne({
      where: { name: organization }
    });

    if (!organization) {
      return res.status(404).send({
        message: `Organization ${old_organization} not found.`
      });
    }

    if (!new_organization) {
      return res.status(404).send({
        message: `New Organization ${new_organization} not found.`
      });
    }

    const user = await User.findOne({
      where: {
        username: userName,
        organizationId: new_organization.id || old_organization.id
      }
    });

    if (!user) {
      return res.status(404).send({
        message: `User ${userName} not found.`
      });
    }

    await user.update({
      username: username || user.username,
      email: email || user.email,
      password: password || user.password,
      roles: roles || user.roles,
      organizationId: new_organization || organization.id
    });

    res.status(200).send(user);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while updating the user."
    });
  }
};

/**
 * @swagger
 * /api/organization/{organizationName}/users/{username}:
 *   delete:
 *     summary: Delete a user from an organization
 *     description: Remove a user from a specific organization (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationName
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         description: Username to delete
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
 *                   example: "User john deleted successfully."
 *       404:
 *         description: User or organization not found
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
exports.delete = async (req, res) => {
  const { organizationName, userName } = req.params;

  try {
    const organization = await Organization.findOne({
      where: { name: organizationName }
    });

    if (!organization) {
      return res.status(404).send({
        message: `Organization ${organizationName} not found.`
      });
    }

    const user = await User.findOne({
      where: {
        username: userName,
        organizationId: organization.id
      }
    });

    if (!user) {
      return res.status(404).send({
        message: `User ${userName} not found.`
      });
    }

    await user.destroy();
    res.status(200).send({ message: `User ${userName} deleted successfully.` });
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while deleting the user."
    });
  }
};

/**
 * @swagger
 * /api/users/{userId}/change-password:
 *   put:
 *     summary: Change user password
 *     description: Change the password for a specific user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newPassword
 *             properties:
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 description: New password
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Password changed successfully!"
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
exports.changePassword = async (req, res) => {
  const { userId } = req.params;
  const { newPassword } = req.body;

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).send({ message: "User not found." });
    }

    user.password = bcrypt.hashSync(newPassword, 8);
    await user.save();

    res.status(200).send({ message: "Password changed successfully!" });
  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while changing the password." });
  }
};

/**
 * @swagger
 * /api/users/{userId}/change-email:
 *   put:
 *     summary: Change user email
 *     description: Change the email address for a specific user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newEmail
 *             properties:
 *               newEmail:
 *                 type: string
 *                 format: email
 *                 description: New email address
 *     responses:
 *       200:
 *         description: Email changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Email changed successfully!"
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
exports.changeEmail = async (req, res) => {
  const { userId } = req.params;
  const { newEmail } = req.body;

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).send({ message: "User not found." });
    }

    user.email = newEmail;
    await user.save();

    res.status(200).send({ message: "Email changed successfully!" });
  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while changing the email." });
  }
};

/**
 * @swagger
 * /api/users/{userId}/promote:
 *   put:
 *     summary: Promote user to moderator
 *     description: Promote a user to moderator role
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: User promoted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Promoted to moderator successfully!"
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
exports.promoteToModerator = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).send({ message: "User not found." });
    }

    const userRole = await Role.findOne({ where: { name: "user" } });
    const moderatorRole = await Role.findOne({ where: { name: "moderator" } });

    // Remove the user role if it exists
    await user.removeRole(userRole);

    // Add the moderator role
    await user.addRole(moderatorRole);

    res.status(200).send({ message: "Promoted to moderator successfully!" });
  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while promoting the user." });
  }
};

/**
 * @swagger
 * /api/users/{userId}/demote:
 *   put:
 *     summary: Demote moderator to user
 *     description: Demote a moderator back to regular user role
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: User demoted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Demoted to user successfully!"
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
exports.demoteToUser = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).send({ message: "User not found." });
    }

    const userRole = await Role.findOne({ where: { name: "user" } });
    const moderatorRole = await Role.findOne({ where: { name: "moderator" } });

    // Remove the moderator role if it exists
    await user.removeRole(moderatorRole);

    // Add the user role
    await user.addRole(userRole);

    res.status(200).send({ message: "Demoted to user successfully!" });
  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while demoting the user." });
  }
};


/**
 * @swagger
 * /api/users/roles:
 *   get:
 *     summary: Get current user roles
 *     description: Retrieve the roles of the currently authenticated user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User roles retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *               example: ["user", "moderator"]
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
exports.getUserRoles = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId, {
      include: [
        {
          model: Role,
          as: 'roles',
          attributes: ['name'],
          through: { attributes: [] },
        },
      ],
    });

    if (!user) {
      return res.status(404).send({ message: "User not found." });
    }

    const roles = user.roles.map((role) => role.name);
    res.status(200).send(roles);
  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while retrieving user roles." });
  }
};
