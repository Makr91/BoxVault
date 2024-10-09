// architecture.controller.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const jwt = require("jsonwebtoken");
const db = require("../models");
const Architecture = db.architectures;
const Provider = db.providers;
const authConfigPath = path.join(__dirname, '../config/auth.config.yaml');
let authConfig;
try {
  const fileContents = fs.readFileSync(authConfigPath, 'utf8');
  authConfig = yaml.load(fileContents);
} catch (e) {
  console.error(`Failed to load auth configuration: ${e.message}`);
}


exports.create = async (req, res) => {
  const { organization, boxId, versionNumber, providerName } = req.params;
  const { name, defaultBox } = req.body;

  try {
    const provider = await Provider.findOne({
      where: { name: providerName },
      include: [{
        model: db.versions,
        as: "version",
        where: { versionNumber },
        include: [{ model: db.box, as: "box", where: { name: boxId, organization } }]
      }]
    });
    if (!provider) {
      return res.status(404).send({
        message: `Provider ${providerName} not found for version ${versionNumber} in box ${boxId}.`
      });
    }

    const architecture = await Architecture.create({
      name,
      defaultBox: defaultBox || false,
      providerId: provider.id
    });

    res.send(architecture);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while creating the Architecture."
    });
  }
};

exports.findAllByProvider = async (req, res) => {
  const { organization, boxId, versionNumber, providerName } = req.params;
  const token = req.headers["x-access-token"];

  try {
    const provider = await Provider.findOne({
      where: { name: providerName },
      include: [{
        model: db.versions,
        as: "version",
        where: { versionNumber },
        include: [{ model: db.box, as: "box", where: { name: boxId, organization } }]
      }]
    });

    if (!provider) {
      return res.status(404).send({
        message: `Provider not found for version ${versionNumber} in box ${boxId}.`
      });
    }

    const box = provider.version.box;

    // Check if the box is public
    if (box.isPublic) {
      // Return limited data for public boxes
      const architectures = await Architecture.findAll({
        where: { providerId: provider.id },
        attributes: ['name'] // Specify limited fields
      });
      return res.send(architectures);
    }

    // If the box is not public, check for authentication
    if (token) {
      jwt.verify(token, authConfig.jwt.jwt_secret, async (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Unauthorized!" });
        }

        // If authenticated, return full architecture details
        const architectures = await Architecture.findAll({ where: { providerId: provider.id } });
        return res.send(architectures);
      });
    } else {
      // If no token is provided, return unauthorized for private boxes
      return res.status(403).send({ message: "Unauthorized access to private architectures." });
    }
  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while retrieving architectures." });
  }
};

exports.delete = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;

  try {
    const provider = await Provider.findOne({
      where: { name: providerName },
      include: [{
        model: db.versions,
        as: "version",
        where: { versionNumber },
        include: [{ model: db.box, as: "box", where: { name: boxId, organization } }]
      }]
    });
    if (!provider) {
      return res.status(404).send({
        message: `Provider not found for version ${versionNumber} in box ${boxId}.`
      });
    }

    const deleted = await Architecture.destroy({
      where: { name: architectureName, providerId: provider.id }
    });

    if (deleted) {
      return res.send({ message: "Architecture deleted successfully!" });
    }

    res.status(404).send({
      message: "Architecture not found."
    });
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while deleting the Architecture."
    });
  }
};

exports.deleteAllByProvider = async (req, res) => {
  const { organization, boxId, versionNumber, providerName } = req.params;

  try {
    const provider = await Provider.findOne({
      where: { name: providerName },
      include: [{
        model: db.versions,
        as: "version",
        where: { versionNumber },
        include: [{ model: db.box, as: "box", where: { name: boxId, organization } }]
      }]
    });
    if (!provider) {
      return res.status(404).send({
        message: `Provider not found for version ${versionNumber} in box ${boxId}.`
      });
    }

    const deleted = await Architecture.destroy({
      where: { providerId: provider.id }
    });

    if (deleted) {
      return res.send({ message: "All architectures deleted successfully!" });
    }

    res.status(404).send({
      message: "No architectures found to delete."
    });
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while deleting the architectures."
    });
  }
};

exports.findOne = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  const token = req.headers["x-access-token"];

  try {
    const provider = await Provider.findOne({
      where: { name: providerName },
      include: [{
        model: db.versions,
        as: "version",
        where: { versionNumber },
        include: [{ model: db.box, as: "box", where: { name: boxId, organization } }]
      }]
    });

    if (!provider) {
      return res.status(404).send({
        message: `Provider not found for version ${versionNumber} in box ${boxId}.`
      });
    }

    const box = provider.version.box;

    // Check if the box is public
    if (box.isPublic) {
      // Return limited data for public boxes
      const architecture = await Architecture.findOne({
        where: { name: architectureName, providerId: provider.id },
        attributes: ['name'] // Specify limited fields
      });
      return res.send(architecture);
    }

    // If the box is not public, check for authentication
    if (token) {
      jwt.verify(token, authConfig.jwt.jwt_secret, async (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Unauthorized!" });
        }

        // If authenticated, return full architecture details
        const architecture = await Architecture.findOne({ where: { name: architectureName, providerId: provider.id } });
        return res.send(architecture);
      });
    } else {
      // If no token is provided, return unauthorized for private boxes
      return res.status(403).send({ message: "Unauthorized access to private architecture." });
    }
  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while retrieving the Architecture." });
  }
};
  
exports.update = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  const { name, defaultBox } = req.body;
  const oldFilePath = path.join(__basedir, "resources/static/assets/uploads", organization, boxId, versionNumber, providerName, architectureName);
  const newFilePath = path.join(__basedir, "resources/static/assets/uploads", organization, boxId, versionNumber, providerName, name);

  try {
    const provider = await Provider.findOne({
      where: { name: providerName },
      include: [{
        model: db.versions,
        as: "version",
        where: { versionNumber: versionNumber },
        include: [{ model: db.box, as: "box", where: { name: boxId, organization } }]
      }]
    });
    if (!provider) {
      return res.status(404).send({
        message: `Provider not found for version ${versionNumber} in box ${boxId}.`
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

    const [updated] = await Architecture.update(
      { name, defaultBox },
      { where: { name: architectureName, providerId: provider.id } }
    );

    if (updated) {
      const updatedArchitecture = await Architecture.findOne({ where: { name: name } });
      return res.send(updatedArchitecture);
    }

    throw new Error('Architecture not found');
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while updating the Architecture."
    });
  }
};