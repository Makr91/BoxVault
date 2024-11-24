const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const jwt = require("jsonwebtoken");
const db = require("../models");
const crypto = require('crypto');
const User = db.user;
const Role = db.role;
const Box = db.box;
const Organization = db.organization; 
const Op = db.Sequelize.Op;
const authConfigPath = path.join(__dirname, '../config/auth.config.yaml');
let authConfig;
try {
  const fileContents = fs.readFileSync(authConfigPath, 'utf8');
  authConfig = yaml.load(fileContents);
} catch (e) {
  console.error(`Failed to load auth configuration: ${e.message}`);
}

const appConfigPath = path.join(__dirname, '../config/app.config.yaml');
let appConfig;
try {
  const fileContents = fs.readFileSync(appConfigPath, 'utf8');
  appConfig = yaml.load(fileContents);
} catch (e) {
  console.error(`Failed to load App configuration: ${e.message}`);
}

const generateEmailHash = (email) => {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
};

exports.getOrganizationsWithUsers = async (req, res) => {
  try {
    const organizations = await Organization.findAll({
      include: [
        {
          model: User,
          as: 'users',
          include: [
            {
              model: Role,
              as: 'roles',
              attributes: ['name'], 
            },
          ],
        },
      ],
    });
    res.status(200).send(organizations);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
};

// Create and Save a new Organization
exports.create = async (req, res) => {
    // Validate request
    if (!req.body.organization) {
      res.status(400).send({
        message: "Organization cannot be empty!"
      });
      return;
    }
  
    // Create a Organization
    const organization = {
      name: req.body.organization,
      description: req.body.description,
      details: ""
    };
  
    // Save Organization in the database
    Organization.create(organization)
      .then(data => {
        res.send(data);
      })
      .catch(err => {
        res.status(500).send({
          message:
            err.message || "Some error occurred while creating the Organization."
        });
      });
    };

exports.findAllWithUsers = async (req, res) => {
  const token = req.headers["x-access-token"];
  let userId = null;
  if (token) {
    try {
      // Verify the token and extract the user ID
      const decoded = jwt.verify(token, authConfig.jwt.jwt_secret.value);
      userId = decoded.id;
      console.log("Decoded user ID:", userId);
    } catch (err) {
      console.error("JWT verification error:", err.message);
      return res.status(401).send({ message: "Unauthorized!!!!" });
    }
  }

  try {
    const organizations = await Organization.findAll({
      include: [
        {
          model: User,
          as: 'users',
          include: [
            {
              model: Role,
              as: 'roles',
              attributes: ['name'],
              through: { attributes: [] }
            },
            {
              model: Box,
              as: 'box',
              attributes: ['id']
            }
          ]
        }
      ]
    });

    const result = organizations.map(org => ({
      ...org.toJSON(),
      users: org.users.map(user => ({
        ...user.toJSON(),
        totalBoxes: user.box.filter(box => box.isPublic || (userId && user.id === userId)).length
      })),
      totalBoxes: org.users.reduce((acc, user) => acc + user.box.filter(box => box.isPublic || (userId && user.id === userId)).length, 0)
    }));

    res.status(200).send(result);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while retrieving organizations."
    });
  }
};

exports.findOneWithUsers = async (req, res) => {
  const { organizationName } = req.params;
  const userId = req.userId;

  try {
    const organization = await Organization.findOne({
      where: { name: organizationName },
      include: [
        {
          model: User,
          as: 'users',
          include: [
            {
              model: Role,
              as: 'roles',
              through: { attributes: [] },
            },
            {
              model: Box,
              as: 'box',
            },
          ],
        },
      ],
    });

    if (!organization) {
      return res.status(404).send({ message: "Organization not found." });
    }

    const users = organization.users.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      verified: user.verified,
      suspended: user.suspended,
      roles: user.roles.map(role => role.name),
      totalBoxes: user.box.filter(box => box.isPublic || (userId && user.id === userId)).length
    }));

    res.status(200).send(users);
  } catch (err) {
    console.error("Error in findOneWithUsers:", err);
    res.status(500).send({
      message: err.message || "Some error occurred while retrieving users."
    });
  }
};

// Retrieve all Organizations from the database.
exports.findAll = async (req, res) => {
  const organization = req.query.organization;
  const token = req.headers["x-access-token"];
  let userId = null;

  if (token) {
    try {
      // Verify the token and extract the user ID
      const decoded = jwt.verify(token, authConfig.jwt.jwt_secret.value);
      userId = decoded.id;
    } catch (err) {
      return res.status(401).send({ message: "Unauthorized!" });
    }
  }

  try {
    const condition = organization ? { name: { [Op.like]: `%${organization}%` } } : null;
    const organizations = await Organization.findAll({ where: condition });

    const result = organizations.map(org => ({
      ...org.toJSON(),
      totalBoxes: org.users.reduce((acc, user) => acc + user.box.filter(box => box.isPublic || (userId && user.id === userId)).length, 0)
    }));

    res.status(200).send(result);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while retrieving organizations."
    });
  }
};

exports.findOne = async (req, res) => {
  const { organizationName } = req.params;
  const token = req.headers["x-access-token"];
  let userId = null;

  if (token) {
    try {
      // Verify the token and extract the user ID
      const decoded = jwt.verify(token, authConfig.jwt.jwt_secret.value);
      userId = decoded.id;
    } catch (err) {
      return res.status(401).send({ message: "Unauthorized!" });
    }
  }

  try {
    const organization = await Organization.findOne({
      where: { name: organizationName },
      include: [{
        model: User,
        as: 'users',
        include: [{
          model: Box,
          as: 'box'
        }]
      }]
    });

    console.log("Organization found:", JSON.stringify(organization, null, 2));

    if (!organization) {
      return res.status(404).send({
        message: `Cannot find Organization with name=${organizationName}.`
      });
    }

    console.log("Org Detected!");

    let totalBoxes = 0;
    if (organization.users && Array.isArray(organization.users)) {
      totalBoxes = organization.users.reduce((acc, user) => {
        if (user.box && Array.isArray(user.box)) {
          return acc + user.box.filter(box => box.isPublic || (userId && user.id === userId)).length;
        }
        return acc;
      }, 0);
    }

    console.log("Total Boxes calculated:", totalBoxes);

    res.send({ ...organization.toJSON(), totalBoxes });
  } catch (err) {
    console.error("Error in findOne:", err);
    res.status(500).send({
      message: "Error retrieving Organization with name=" + organizationName
    });
  }
};

// Update the 'update' function
exports.update = async (req, res) => {
  const { organizationName } = req.params;
  const { organization, description, email, website } = req.body;
  const oldFilePath = path.join(appConfig.boxvault.box_storage_directory.value, organizationName);
  const newFilePath = path.join(appConfig.boxvault.box_storage_directory.value, organization || organizationName);

  try {
    const org = await Organization.findOne({
      where: { name: organizationName }
    });

    if (!org) {
      return res.status(404).send({
        message: "Organization not found."
      });
    }

    // Create the new directory if it doesn't exist
    if (!fs.existsSync(newFilePath)) {
      fs.mkdirSync(newFilePath, { recursive: true });
    }

    // Create the new directory if it doesn't exist
    if (!fs.existsSync(oldFilePath)) {
      fs.mkdirSync(oldFilePath, { recursive: true });
    }

    // Rename the directory if necessary
    if (oldFilePath !== newFilePath) {
      fs.renameSync(oldFilePath, newFilePath);

      // Clean up the old directory if it still exists
      if (fs.existsSync(oldFilePath)) {
        fs.rmdirSync(oldFilePath, { recursive: true });
      }
    }

    // Generate email hash if email is provided
    let emailHash = null;
    if (email) {
      emailHash = generateEmailHash(email);
    }

    await org.update({
      name: organization || org.name,
      description: description || org.description,
      email: email || org.email,
      emailHash: emailHash || org.emailHash,
      website: website || org.website
    });

    res.status(200).send({
      message: "Organization updated successfully.",
      organization: org
    });
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while updating the organization."
    });
  }
};
  
// Delete a Organization with the specified id in the request
exports.delete = async (req, res) => {
  const { organizationName } = req.params;

  try {
    // Find the organization by name
    const organization = await Organization.findOne({
      where: { name: organizationName }
    });

    if (!organization) {
      return res.status(404).send({
        message: "Organization not found."
      });
    }

    // Determine the directory path
    const dirPath = path.join(appConfig.boxvault.box_storage_directory.value, organizationName);

    // Delete the organization
    await organization.destroy();

    // Delete the directory
    if (fs.existsSync(dirPath)) {
      fs.rmdirSync(dirPath, { recursive: true });
    }

    res.status(200).send({
      message: "Organization and its files deleted successfully."
    });
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while deleting the organization."
    });
  }
};

exports.suspendOrganization = async (req, res) => {
  const { organizationName } = req.params;

  try {
    const organization = await Organization.findOne({
      where: { name: organizationName }
    });

    if (!organization) {
      return res.status(404).send({ message: "Organization not found." });
    }

    organization.suspended = true;
    await organization.save();

    res.status(200).send({ message: "Organization suspended successfully!" });
  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while suspending the organization." });
  }
};

exports.resumeOrganization = async (req, res) => {
  const { organizationName } = req.params;

  try {
    const organization = await Organization.findOne({
      where: { name: organizationName }
    });

    if (!organization) {
      return res.status(404).send({ message: "Organization not found." });
    }

    organization.suspended = false;
    await organization.save();

    res.status(200).send({ message: "Organization resumed successfully!" });
  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while resuming the organization." });
  }
};