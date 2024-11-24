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

const authConfigPath = path.join(__dirname, '../config/auth.config.yaml');
let authConfig;
try {
  const fileContents = fs.readFileSync(authConfigPath, 'utf8');
  authConfig = yaml.load(fileContents);
} catch (e) {
  console.error(`Failed to load auth configuration: ${e.message}`);
}

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

exports.userBoard = (req, res) => {
  res.status(200).send("User Content.");
};

exports.adminBoard = (req, res) => {
  res.status(200).send("Admin Content.");
};

exports.organization = (req, res) => {
  res.status(200).send("Moderator Content.");
};

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

    const token = jwt.sign({ id: user.id }, authConfig.jwt.jwt_secret.value, {
      expiresIn: authConfig.jwt.jwt_token_time_valid.value,
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
      console.error("Error retrieving user profile:", error); // Ensure this is logging the error
      res.status(500).send({ message: "Error retrieving user profile" });
    }
};

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