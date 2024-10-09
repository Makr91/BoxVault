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

exports.create = async (req, res) => {
  const { organization, boxId } = req.params;
  const { versionNumber, description } = req.body;

  try {
    const box = await Box.findOne({ where: { name: boxId, organization } });
    if (!box) {
      return res.status(404).send({
        message: `Box not found in organization ${organization}.`
      });
    }

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

  try {
    const box = await Box.findOne({ where: { name: boxId, organization } });

    if (!box) {
      return res.status(404).send({ message: `Box not found in organization ${organization}.` });
    }

    // Check if the box is public
    if (box.isPublic) {
      const versions = await Version.findAll({ where: { boxId: box.id } });
      return res.send(versions);
    }

    // If the box is not public, check for authentication
    if (token) {
      jwt.verify(token, authConfig.jwt.jwt_secret, async (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Unauthorized!" });
        }

        // If authenticated, return the versions
        const versions = await Version.findAll({ where: { boxId: box.id } });
        return res.send(versions);
      });
    } else {
      // If no token is provided, return unauthorized for private boxes
      return res.status(403).send({ message: "Unauthorized access to private box versions." });
    }
  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while retrieving versions." });
  }
};

// Method to retrieve versions of a public box
exports.findPublicBoxVersions = (req, res) => {
  const name = req.params.name;

  Version.findAll({
    where: { boxName: name },
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
                model: File,
                as: 'files'
              }
            ]
          }
        ]
      }
    ]
  })
    .then(data => {
      res.send(data);
    })
    .catch(err => {
      res.status(500).send({
        message: "Error retrieving versions for public box with name=" + name
      });
    });
};

exports.findOne = async (req, res) => {
  const { organization, boxId, versionNumber } = req.params;
  const token = req.headers["x-access-token"];

  try {
    const box = await Box.findOne({ where: { name: boxId, organization } });
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

    // Check if the box is public
    if (box.isPublic) {
      // Return full data for public boxes
      return res.send({
        versionNumber: version.versionNumber,
        description: version.description,
        createdAt: version.createdAt,
        updatedAt: version.updatedAt
      });
    }

    // If the box is not public, check for authentication
    if (token) {
      jwt.verify(token, authConfig.jwt.jwt_secret, async (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Unauthorized!" });
        }

        // If authenticated, return full version details
        return res.send({
          versionNumber: version.versionNumber,
          description: version.description,
          createdAt: version.createdAt,
          updatedAt: version.updatedAt
        });
      });
    } else {
      // If no token is provided, return unauthorized for private boxes
      return res.status(403).send({ message: "Unauthorized access to private version information." });
    }
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while retrieving the Version."
    });
  }
};

exports.update = async (req, res) => {
  const { organization, boxId, versionNumber } = req.params;
  const { version, description } = req.body;
  const oldFilePath = path.join(__basedir, "resources/static/assets/uploads", organization, boxId, versionNumber);
  const newFilePath = path.join(__basedir, "resources/static/assets/uploads", organization, boxId, version);

  try {
    const box = await Box.findOne({ where: { name: boxId, organization } });
    if (!box) {
      return res.status(404).send({
        message: `Box ${boxId} not found in organization ${organization}.`
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

    const [updated] = await Version.update(
      { versionNumber: version, description: description },
      { where: { versionNumber: versionNumber, boxId: box.id } }
    );

    if (updated) {
      const updatedVersion = await Version.findOne({ where: { versionNumber: version } });
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
    const box = await Box.findOne({ where: { name: boxId, organization } });
    if (!box) {
      return res.status(404).send({
        message: `Box not found in organization ${organization}.`
      });
    }

    const deleted = await Version.destroy({
      where: { versionNumber: versionNumber, boxId: box.id }
    });

    if (deleted) {
      // Delete the version's directory
      const versionPath = path.join(__basedir, "resources/static/assets/uploads", organization, boxId, versionNumber);
      fs.rm(versionPath, { recursive: true, force: true }, (err) => {
        if (err) {
          console.log(`Could not delete the version directory: ${err}`);
        }
      });

      return res.send({ message: "Version deleted successfully!" });
    }

    throw new Error('Version not found');
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while deleting the Version."
    });
  }
};

exports.deleteAllByBox = async (req, res) => {
  const { organization, boxId } = req.params;

  try {
    const box = await Box.findOne({ where: { name: boxId, organization } });
    if (!box) {
      return res.status(404).send({
        message: `Box not found in organization ${organization}.`
      });
    }

    const deleted = await Version.destroy({
      where: { boxId: box.id }
    });

    if (deleted) {
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