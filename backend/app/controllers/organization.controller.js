// organization.controller.js
const fs = require("fs");
const path = require("path");
const db = require("../models");
const User = db.user;
const Role = db.role;
const Box = db.box;
const Organization = db.organization; 
const Op = db.Sequelize.Op;

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
      description: req.body.description
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

// In organization.controller.js

exports.findAllWithUsers = async (req, res) => {
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
        totalBoxes: user.box.length
      })),
      totalBoxes: org.users.reduce((acc, user) => acc + user.box.length, 0)
    }));

    res.status(200).send(result);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while retrieving organizations."
    });
  }
};

// In organization.controller.js

exports.findOneWithUsers = async (req, res) => {
  const { organizationName } = req.params;

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

    if (!organization) {
      return res.status(404).send({
        message: `Cannot find Organization with name=${organizationName}.`
      });
    }

    const users = organization.users.map(user => ({
      ...user.toJSON(),
      roles: user.roles.map(role => role.name),
      totalBoxes: user.box.length
    }));

    res.status(200).send(users);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while retrieving the organization users."
    });
  }
};

// Retrieve all Organizations from the database.
exports.findAll = (req, res) => {
    const organization = req.query.organization;
    var condition = organization ? { organization: { [Op.like]: `%${organization}%` } } : null;
  
    Organization.findAll({ where: condition })
      .then(data => {
        res.send(data);
      })
      .catch(err => {
        res.status(500).send({
          message:
            err.message || "Some error occurred while retrieving organizations."
        });
      });
  };

// Find a single Organization with an id
exports.findOne = (req, res) => {
  const { organizationName } = req.params;

  Organization.findOne({ where: { name: organizationName } })
    .then(data => {
      if (data) {
        res.send(data);
      } else {
        res.status(404).send({
          message: `Cannot find Organization with name=${organizationName}.`
        });
      }
    })
    .catch(err => {
      res.status(500).send({
        message: "Error retrieving Organization with name=" + organizationName
      });
    });
};

// Update a Organization by the id in the request
exports.update = async (req, res) => {
    const { organizationName } = req.params;
    const { organization, description } = req.body;
    const oldFilePath = path.join(__basedir, "resources/static/assets/uploads", organizationName);
    const newFilePath = path.join(__basedir, "resources/static/assets/uploads", organization || organizationName);

    try {
      const organization_name = await Organization.findOne({
        where: { name: organizationName }
      });

      if (!organization_name) {
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

      await organization_name.update({
        name: organization || organization_name.name,
        ...description
      });

      res.status(200).send({
        message: "Organization updated successfully.",
        organization
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
    const dirPath = path.join(__basedir, "resources/static/assets/uploads", organizationName);

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