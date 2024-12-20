// provider.controller.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const jwt = require("jsonwebtoken");
const db = require("../models");
const Provider = db.providers;
const Version = db.versions;
const Architecture = db.architectures;

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
  const { organization, boxId, versionNumber } = req.params;
  const { name, description } = req.body;
  const newFilePath = path.join(appConfig.boxvault.box_storage_directory.value, organization, boxId, versionNumber, name);

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
      return res.status(404).send({ message: `Organization not found with name: ${organization}.` });
    }

    // Extract the box and version from the organization data
    const box = organizationData.users.flatMap(user => user.box)
      .find(box => box.name === boxId);

    // Create the new directory if it doesn't exist
    if (!fs.existsSync(newFilePath)) {
      fs.mkdirSync(newFilePath, { recursive: true });
    }

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

    // Create the provider
    const provider = await Provider.create({
      name,
      description,
      versionId: version.id
    });

    res.send(provider);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while creating the Provider."
    });
  }
};

exports.findAllByVersion = async (req, res) => {
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
          model: db.box,
          as: 'box',
          where: { name: boxId },
          attributes: ['id', 'name', 'isPublic'], // Include isPublic attribute
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

    const box = organizationData.users.flatMap(user => user.box).find(box => box.name === boxId);

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

    // If the box is public, allow access
    if (box.isPublic) {
      const providers = await Provider.findAll({ where: { versionId: version.id } });
      return res.send(providers);
    }

    // If the box is private, check if the user belongs to the organization
    if (!userId) {
      return res.status(403).send({ message: "Unauthorized access to providers." });
    }

    const user = organizationData.users.find(user => user.id === userId);
    if (!user) {
      return res.status(403).send({ message: "Unauthorized access to providers." });
    }

    // If the user belongs to the organization, allow access
    const providers = await Provider.findAll({ where: { versionId: version.id } });
    return res.send(providers);

  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while retrieving providers." });
  }
};

exports.findOne = async (req, res) => {
  const { organization, boxId, versionNumber, providerName } = req.params;
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
          model: db.box,
          as: 'box',
          where: { name: boxId },
          attributes: ['id', 'name', 'isPublic'], // Include isPublic attribute
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

    const box = organizationData.users.flatMap(user => user.box).find(box => box.name === boxId);

    if (!box) {
      return res.status(404).send({
        message: `Box ${boxId} not found in organization ${organization}.`
      });
    }

    const version = box.versions.find(version => version.versionNumber === versionNumber);

    if (!version) {
      return res.status(404).send({
        message: `Version not found for box ${boxId} in organization ${organization}.`
      });
    }

    // If the box is public, allow access
    if (box.isPublic) {
      const provider = await Provider.findOne({ where: { name: providerName, versionId: version.id } });
      if (!provider) {
        return res.status(404).send({
          message: `Provider ${providerName} not found for version ${versionNumber} in box ${boxId} in organization ${organization}.`
        });
      }
      return res.send(provider);
    }

    // If the box is private, check if the user belongs to the organization
    if (!userId) {
      return res.status(403).send({ message: "Unauthorized access to provider." });
    }

    const user = organizationData.users.find(user => user.id === userId);
    if (!user) {
      return res.status(403).send({ message: "Unauthorized access to provider." });
    }

    // If the user belongs to the organization, allow access
    const provider = await Provider.findOne({ where: { name: providerName, versionId: version.id } });
    if (!provider) {
      return res.status(404).send({
        message: `Provider ${providerName} not found for version ${versionNumber} in box ${boxId} in organization ${organization}.`
      });
    }
    return res.send(provider);

  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while retrieving the Provider." });
  }
};

exports.update = async (req, res) => {
  const { organization, boxId, versionNumber, providerName } = req.params;
  const { name, description } = req.body;
  const oldFilePath = path.join(appConfig.boxvault.box_storage_directory.value, organization, boxId, versionNumber, providerName);
  const newFilePath = path.join(appConfig.boxvault.box_storage_directory.value, organization, boxId, versionNumber, name);

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

    const [updated] = await Provider.update(
      { name, description },
      { where: { name: providerName, versionId: version.id } }
    );

    if (updated) {
      const updatedProvider = await Provider.findOne({ where: { name: name, versionId: version.id } });
      return res.send(updatedProvider);
    }

    throw new Error('Provider not found');
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while updating the Provider."
    });
  }
};

exports.delete = async (req, res) => {
  const { organization, boxId, versionNumber, providerName } = req.params;

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

    // Find all architectures associated with the provider
    const architectures = await Architecture.findAll({
      where: { providerId: version.id }
    });

    // Delete all files and directories associated with each architecture
    for (const architecture of architectures) {
      const filePath = path.join(appConfig.boxvault.box_storage_directory.value, organization, boxId, versionNumber, providerName, architecture.name);
      
      // Delete files from the file system
      fs.rm(filePath, { recursive: true, force: true }, (err) => {
        if (err) {
          console.log(`Could not delete the architecture directory: ${err}`);
        }
      });

      // Delete architecture from the database
      await architecture.destroy();
    }

    // Delete the provider from the database
    const deleted = await Provider.destroy({
      where: { name: providerName, versionId: version.id }
    });

    if (deleted) {
      // Delete the provider's directory
      const providerPath = path.join(appConfig.boxvault.box_storage_directory.value, organization, boxId, versionNumber, providerName);
      fs.rm(providerPath, { recursive: true, force: true }, (err) => {
        if (err) {
          console.log(`Could not delete the provider directory: ${err}`);
        }
      });

      return res.send({ message: "Provider and associated architectures deleted successfully!" });
    }

    res.status(404).send({
      message: "Provider not found."
    });
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while deleting the Provider."
    });
  }
};

exports.deleteAllByVersion = async (req, res) => {
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

    const deleted = await Provider.destroy({
      where: { versionId: version.id }
    });

    if (deleted) {
      return res.send({ message: "All providers deleted successfully!" });
    }

    res.status(404).send({
      message: "No providers found to delete."
    });
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while deleting the providers."
    });
  }
};