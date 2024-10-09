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

exports.create = async (req, res) => {
    const { organization, boxId, versionNumber } = req.params;
    const { name } = req.body;

    try {
      const version = await Version.findOne({
        where: { versionNumber: versionNumber },
        include: [{ model: db.box, as: "box", where: { name: boxId, organization } }]
      });
      if (!version) {
        return res.status(404).send({
          message: `Version ${versionNumber} not found for box ${boxId} in organization ${organization}.`
        });
      }

      const provider = await Provider.create({
        name,
        description: req.body.description,
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

  try {
    const version = await Version.findOne({
      where: { versionNumber: versionNumber },
      include: [{ model: db.box, as: "box", where: { name: boxId, organization } }]
    });

    if (!version) {
      return res.status(404).send({
        message: `Version ${versionNumber} not found for box ${boxId} in organization ${organization}.`
      });
    }

    const box = version.box;

    // Check if the box is public
    if (box.isPublic) {
      // Return limited data for public boxes
      const providers = await Provider.findAll({
        where: { versionId: version.id },
        attributes: ['name', 'description'] // Specify limited fields
      });
      return res.send(providers);
    }

    // If the box is not public, check for authentication
    if (token) {
      jwt.verify(token, authConfig.jwt.jwt_secret, async (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Unauthorized!" });
        }

        // If authenticated, return full provider details
        const providers = await Provider.findAll({ where: { versionId: version.id } });
        return res.send(providers);
      });
    } else {
      // If no token is provided, return unauthorized for private boxes
      return res.status(403).send({ message: "Unauthorized access to private providers." });
    }
  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while retrieving providers." });
  }
};

exports.findOne = async (req, res) => {
  const { organization, boxId, versionNumber, providerName } = req.params;
  const token = req.headers["x-access-token"];

  try {
    const version = await Version.findOne({
      where: { versionNumber: versionNumber },
      include: [{ model: db.box, as: "box", where: { name: boxId, organization } }]
    });

    if (!version) {
      return res.status(404).send({
        message: `Version not found for box ${boxId} in organization ${organization}.`
      });
    }

    const box = version.box;

    if (box.isPublic) {
      // Return limited data for public boxes
      const provider = await Provider.findOne({
        where: { name: providerName, versionId: version.id },
        attributes: ['name', 'description'] // Specify limited fields
      });
      if (!provider) {
        return res.status(404).send({
          message: `Provider ${providerName} not found for version ${versionNumber} in box ${boxId} in organization ${organization}.`
        });
      }
      return res.send(provider);
    }

    // If the box is not public, check for authentication
    if (token) {
      jwt.verify(token, authConfig.jwt.jwt_secret, async (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Unauthorized!" });
        }

        // If authenticated, return full provider details
        const provider = await Provider.findOne({ where: { name: providerName, versionId: version.id } });
        if (!provider) {
          return res.status(404).send({
            message: `Provider ${providerName} not found for version ${versionNumber} in box ${boxId} in organization ${organization}.`
          });
        }
        return res.send(provider);
      });
    } else {
      // If no token is provided, return unauthorized for private boxes
      return res.status(403).send({ message: "Unauthorized access to private provider." });
    }
  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while retrieving the Provider." });
  }
};

exports.update = async (req, res) => {
    const { organization, boxId, versionNumber, providerName } = req.params;
    const { name, description } = req.body;
    const oldFilePath = path.join(__basedir, "resources/static/assets/uploads", organization, boxId, versionNumber, providerName);
    const newFilePath = path.join(__basedir, "resources/static/assets/uploads", organization, boxId, versionNumber, name);

    try {
      const version = await Version.findOne({
        where: { versionNumber: versionNumber },
        include: [{ model: db.box, as: "box", where: { name: boxId, organization } }]
      });
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
        const updatedProvider = await Provider.findOne({ where: { name: providerName } });
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
    const version = await Version.findOne({
      where: { versionNumber: versionNumber },
      include: [{ model: db.box, as: "box", where: { name: boxId, organization } }]
    });
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
      const filePath = path.join(__basedir, "resources/static/assets/uploads", organization, boxId, versionNumber, providerName, architecture.name);
      
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
      const providerPath = path.join(__basedir, "resources/static/assets/uploads", organization, boxId, versionNumber, providerName);
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
    const version = await Version.findOne({
      where: { versionNumber: versionNumber },
      include: [{ model: db.box, as: "box", where: { name: boxId, organization } }]
    });
    if (!version) {
      return res.status(404).send({
        message: `Version not found for box ${boxId} in organization ${organization}.`
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