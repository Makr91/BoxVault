// version.controller.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const jwt = require("jsonwebtoken");
const db = require("../models");
const Version = db.versions;
const Box = db.box;

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

exports.create = async (req, res) => {
  const { organization, boxId } = req.params;
  const { versionNumber, description } = req.body;

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
      include: [{
        model: db.user,
        as: 'users',
        include: [{
          model: Box,
          as: 'box',
          where: { name: boxId }
        }]
      }]
    });

    if (!organizationData) {
      return res.status(404).send({ message: `Organization not found with name: ${organization}.` });
    }

    // Extract the box from the organization data
    const box = organizationData.users.flatMap(user => user.box).find(box => box.name === boxId);

    if (!box) {
      return res.status(404).send({ message: `Box not found with name: ${boxId}.` });
    }

    // Create the version
    const version = await Version.create({
      versionNumber,
      description,
      boxId: box.id
    });

    res.send(version);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while creating the Version."
    });
  }
};

exports.findAllByBox = async (req, res) => {
  const { organization, boxId } = req.params;
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
    const organizationData = await db.organization.findOne({
      where: { name: organization },
      include: [{
        model: db.user,
        as: 'users',
        include: [{
          model: Box,
          as: 'box',
          where: { name: boxId }
        }]
      }]
    });

    if (!organizationData) {
      return res.status(404).send({ message: `Organization not found with name: ${organization}.` });
    }

    const box = organizationData.users.flatMap(user => user.box).find(box => box.name === boxId);

    if (!box) {
      return res.status(404).send({ message: `Box not found with name: ${boxId}.` });
    }

    // If the box is public, allow access
    if (box.isPublic) {
      const versions = await Version.findAll({ where: { boxId: box.id } });
      return res.send(versions);
    }

    // If the box is private, check if the user belongs to the organization
    if (!userId) {
      return res.status(403).send({ message: "Unauthorized access to versions." });
    }

    const user = organizationData.users.find(user => user.id === userId);
    if (!user) {
      return res.status(403).send({ message: "Unauthorized access to versions." });
    }

    // If the user belongs to the organization, allow access
    const versions = await Version.findAll({ where: { boxId: box.id } });
    return res.send(versions);

  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while retrieving versions."
    });
  }
};

exports.findPublicBoxVersions = async (req, res) => {
  const { organization, boxId } = req.params;

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
      include: [{
        model: db.user,
        as: 'users',
        include: [{
          model: Box,
          as: 'box',
          where: { name: boxId, isPublic: true }
        }]
      }]
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`
      });
    }

    // Extract the box from the organization data
    const box = organizationData.users.flatMap(user => user.box).find(box => box.name === boxId);

    if (!box) {
      return res.status(404).send({
        message: `Public box not found with name: ${boxId}.`
      });
    }

    const versions = await Version.findAll({
      where: { boxId: box.id },
      include: [
        {
          model: db.providers,
          as: 'providers',
          include: [
            {
              model: db.architectures,
              as: 'architectures',
              include: [
                {
                  model: db.files,
                  as: 'files'
                }
              ]
            }
          ]
        }
      ]
    });

    res.send(versions);
  } catch (err) {
    res.status(500).send({
      message: "Error retrieving versions for public box with name=" + boxId
    });
  }
};

exports.findOne = async (req, res) => {
  const { organization, boxId, versionNumber } = req.params;
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
    const organizationData = await db.organization.findOne({
      where: { name: organization },
      include: [{
        model: db.user,
        as: 'users',
        include: [{
          model: Box,
          as: 'box',
          where: { name: boxId }
        }]
      }]
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`
      });
    }

    const box = organizationData.users.flatMap(user => user.box).find(box => box.name === boxId);

    if (!box) {
      return res.status(404).send({
        message: `Box not found in organization ${organization}.`
      });
    }

    const version = await Version.findOne({ where: { versionNumber: versionNumber, boxId: box.id } });
    if (!version) {
      return res.status(404).send({
        message: `Version not found for box ${boxId} in organization ${organization}.`
      });
    }

    // If the box is public, allow access
    if (box.isPublic) {
      return res.send(version);
    }

    // If the box is private, check if the user belongs to the organization
    if (!userId) {
      return res.status(403).send({ message: "Unauthorized access to version." });
    }

    const user = organizationData.users.find(user => user.id === userId);
    if (!user) {
      return res.status(403).send({ message: "Unauthorized access to version." });
    }

    // If the user belongs to the organization, allow access
    return res.send(version);

  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while retrieving the Version."
    });
  }
};

exports.update = async (req, res) => {
  const { organization, boxId, versionNumber } = req.params;
  const { versionNumber: version, description } = req.body;
  const oldFilePath = path.join(appConfig.boxvault.box_storage_directory.value, organization, boxId, versionNumber);
  const newFilePath = path.join(appConfig.boxvault.box_storage_directory.value, organization, boxId, version);

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
      include: [{
        model: db.user,
        as: 'users',
        include: [{
          model: Box,
          as: 'box',
          where: { name: boxId }
        }]
      }]
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`
      });
    }

    // Extract the box from the organization data
    const box = organizationData.users.flatMap(user => user.box).find(box => box.name === boxId);

    if (!box) {
      return res.status(404).send({
        message: `Box ${boxId} not found in organization ${organization}.`
      });
    }

    const [updated] = await Version.update(
      { versionNumber: version, description: description },
      { where: { versionNumber: versionNumber, boxId: box.id } }
    );

    if (updated) {
      // Create the new directory if it doesn't exist
      if (!fs.existsSync(newFilePath)) {
        fs.mkdirSync(newFilePath, { recursive: true });
      }

      // Rename the directory if necessary
      if (oldFilePath !== newFilePath) {
        fs.renameSync(oldFilePath, newFilePath);

        // Clean up the old directory if it still exists
        if (fs.existsSync(oldFilePath)) {
          fs.rmdirSync(oldFilePath, { recursive: true });
        }
      }

      const updatedVersion = await Version.findOne({ where: { versionNumber: version, boxId: box.id } });
      return res.send(updatedVersion);
    }

    throw new Error(`Version ${versionNumber} not found`);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while updating the Version."
    });
  }
};

exports.delete = async (req, res) => {
  const { organization, boxId, versionNumber } = req.params;

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
      include: [{
        model: db.user,
        as: 'users',
        include: [{
          model: db.box,
          as: 'box',
          where: { name: boxId },
          include: [{
            model: db.versions,
            as: 'versions',
            where: { versionNumber: versionNumber }
          }]
        }]
      }]
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`
      });
    }

    // Extract the box and version from the organization data
    const box = organizationData.users.flatMap(user => user.box)
      .find(box => box.name === boxId);

    if (!box) {
      return res.status(404).send({
        message: `Box ${boxId} not found in organization ${organization}.`
      });
    }

    const version = box.versions.find(version => version.versionNumber === versionNumber);

    if (!version) {
      return res.status(404).send({
        message: `Version ${versionNumber} not found for box ${boxId} in organization ${organization}.`
      });
    }

    const deleted = await Version.destroy({
      where: { id: version.id }
    });

    if (deleted) {
      const versionPath = path.join(appConfig.boxvault.box_storage_directory.value, organization, boxId, versionNumber);
      fs.rm(versionPath, { recursive: true, force: true }, (err) => {
        if (err) {
          console.log(`Could not delete the version directory: ${err}`);
        }
      });

      return res.send({ message: "Version deleted successfully!" });
    }

    res.status(404).send({
      message: "Version not found."
    });
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while deleting the Version."
    });
  }
};

exports.deleteAllByBox = async (req, res) => {
  const { organization, boxId } = req.params;

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
      include: [{
        model: db.user,
        as: 'users',
        include: [{
          model: Box,
          as: 'box',
          where: { name: boxId }
        }]
      }]
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`
      });
    }

    // Extract the box from the organization data
    const box = organizationData.users.flatMap(user => user.box).find(box => box.name === boxId);

    if (!box) {
      return res.status(404).send({
        message: `Box not found in organization ${organization}.`
      });
    }

    const deleted = await Version.destroy({
      where: { boxId: box.id }
    });

    if (deleted) {
      const boxPath = path.join(appConfig.boxvault.box_storage_directory.value, organization, boxId);
      fs.rm(boxPath, { recursive: true, force: true }, (err) => {
        if (err) {
          console.log(`Could not delete the box directory: ${err}`);
        }
      });

      return res.send({ message: "All versions deleted successfully!" });
    }

    res.status(404).send({
      message: "No versions found to delete."
    });
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while deleting the versions."
    });
  }
};