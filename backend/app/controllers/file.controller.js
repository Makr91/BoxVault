// file.controller.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const jwt = require("jsonwebtoken");
const db = require("../models");
const uploadFile = require("../middleware/upload");

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

const Architecture = db.architectures;
const File = db.files;

const upload = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  const fileName = `vagrant.box`;
  const filePath = path.join(__basedir, "resources/static/assets/uploads", organization, boxId, versionNumber, providerName, architectureName, fileName);

  try {
    const architecture = await Architecture.findOne({
      where: { name: architectureName },
      include: [{
        model: db.providers,
        as: "provider",
        where: { name: providerName },
        include: [{
          model: db.versions,
          as: "version",
          where: { versionNumber },
          include: [{ model: db.box, as: "box", where: { name: boxId, organization } }]
        }]
      }]
    });

    if (!architecture) {
      return res.status(404).send({
        message: `Architecture not found for provider ${providerName} in version ${versionNumber} of box ${boxId}.`
      });
    }

    // Proceed with upload only if the file does not exist
    if (!fs.existsSync(filePath)) {
      await uploadFile(req, res);

      let checksum = req.body.checksum;
      let checksumType = req.body.checksumType;

      if (!req.files['file']) {
        return res.status(404).send({ message: "No file uploaded!" });
      }

      if (!checksumType || checksumType.toUpperCase() === 'NULL') {
        checksum = null;
        checksumType = 'NULL';
      }

      // Get the file size
      const fileSize = req.files['file'][0].size;

      await File.create({
        fileName: fileName,
        checksum: checksum,
        checksumType: checksumType,
        architectureId: architecture.id,
        fileSize: fileSize
      });

      return res.status(200).send({
        message: "Uploaded the file successfully: " + req.files['file'][0].originalname,
      });
    } else {
      return res.status(400).send({ message: "File already exists. Please use the update function to replace it." });
    }
  } catch (err) {
    console.log(err);

    if (err.code == "LIMIT_FILE_SIZE") {
      return res.status(500).send({
        message: "File size cannot be larger than 10GB!",
      });
    }

    res.status(500).send({
      message: `Could not upload the file: ${req.files ? req.files['file'][0].originalname : ''}. ${err}`,
    });
  }
};

const download = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  const fileName = `vagrant.box`;
  const filePath = path.join(__basedir, "resources/static/assets/uploads", organization, boxId, versionNumber, providerName, architectureName, fileName);
  const token = req.headers["x-access-token"];

  try {
    const architecture = await Architecture.findOne({
      where: { name: architectureName },
      include: [{
        model: db.providers,
        as: "provider",
        where: { name: providerName },
        include: [{
          model: db.versions,
          as: "version",
          where: { versionNumber },
          include: [{ model: db.box, as: "box", where: { name: boxId, organization } }]
        }]
      }]
    });

    if (!architecture) {
      return res.status(404).send({
        message: `Architecture not found for provider ${providerName} in version ${versionNumber} of box ${boxId}.`
      });
    }

    const box = architecture.provider.version.box;

    // Check if the box is public
    if (box.isPublic) {
      // Allow download for public boxes
      return res.download(filePath, fileName, (err) => {
        if (err) {
          res.status(500).send({
            message: "Could not download the file. " + err,
          });
        }
      });
    }

    // If the box is not public, check for authentication
    if (token) {
      jwt.verify(token, authConfig.jwt.jwt_secret, async (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Unauthorized!" });
        }

        // If authenticated, allow download
        return res.download(filePath, fileName, (err) => {
          if (err) {
            res.status(500).send({
              message: "Could not download the file. " + err,
            });
          }
        });
      });
    } else {
      // If no token is provided, return unauthorized for private boxes
      return res.status(403).send({ message: "Unauthorized access to private file download." });
    }
  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while downloading the file." });
  }
};

const info = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  const fileName = `vagrant.box`;
  const token = req.headers["x-access-token"];

  try {
    const architecture = await Architecture.findOne({
      where: { name: architectureName },
      include: [{
        model: db.providers,
        as: "provider",
        where: { name: providerName },
        include: [{
          model: db.versions,
          as: "version",
          where: { versionNumber },
          include: [{ model: db.box, as: "box", where: { name: boxId, organization } }]
        }]
      }]
    });

    if (!architecture) {
      return res.status(404).send({
        message: `Architecture not found for provider ${providerName} in version ${versionNumber} of box ${boxId}.`
      });
    }

    const box = architecture.provider.version.box;

    // Check if the box is public
    if (box.isPublic) {
      // Return full data for public boxes
      const fileRecord = await File.findOne({
        where: {
          fileName: fileName,
          architectureId: architecture.id
        }
      });
      if (fileRecord) {
        return res.send({
          fileName: fileRecord.fileName,
          downloadUrl: `${appConfig.boxvault.api_url}/organization/${organization}/box/${boxId}/version/${versionNumber}/provider/${providerName}/architecture/${architectureName}/file/download`,
          downloadCount: fileRecord.downloadCount,
          checksum: fileRecord.checksum,
          checksumType: fileRecord.checksumType,
          fileSize: fileRecord.fileSize
        });
      }
    } else {
      // If the box is not public, check for authentication
      if (!token) {
        localStorage.setItem('user', JSON.stringify({ accessToken: token }));
        return res.status(403).send({ message: "Unauthorized access to private file information." });
      }

      jwt.verify(token, authConfig.jwt.jwt_secret, async (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Unauthorized!" });
        }

        // If authenticated, return full file details
        const fileRecord = await File.findOne({ where: { fileName: fileName, architectureId: architecture.id } });
        if (fileRecord) {
          return res.send({
            fileName: fileRecord.fileName,
            downloadUrl: `${appConfig.boxvault.api_url}/organization/${organization}/box/${boxId}/version/${versionNumber}/provider/${providerName}/architecture/${architectureName}/file/download`,
            downloadCount: fileRecord.downloadCount,
            checksum: fileRecord.checksum,
            checksumType: fileRecord.checksumType,
            fileSize: fileRecord.fileSize
          });
        } else {
          return res.status(404).send({ message: "File not found." });
        }
      });
    }
  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while retrieving the file information." });
  }
};

const remove = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  const fileName = `vagrant.box`;
  const basefilePath = path.join(__basedir, "resources/static/assets/uploads", organization, boxId, versionNumber, providerName, architectureName);
  const filePath = path.join(basefilePath, fileName);

  try {
    const architecture = await Architecture.findOne({
      where: { name: architectureName },
      include: [{
        model: db.providers,
        as: "provider",
        where: { name: providerName },
        include: [{
          model: db.versions,
          as: "version",
          where: { versionNumber },
          include: [{ model: db.box, as: "box", where: { name: boxId, organization } }]
        }]
      }]
    });

    if (!architecture) {
      return res.status(404).send({
        message: `Architecture not found for provider ${providerName} in version ${versionNumber} of box ${boxId}.`
      });
    }

    const fileRecord = await File.findOne({
      where: {
        fileName: fileName,
        architectureId: architecture.id
      }
    });

    // Attempt to delete the file from the disk
    fs.unlink(filePath, (err) => {
      if (err) {
        console.log(`Could not delete the file from disk: ${err}`);
      }
    });

    // Proceed to delete the database record regardless of file deletion success
    try {
      if (fileRecord) {
        await fileRecord.destroy();
        console.log("Database record deleted successfully.");
      } else {
        console.log("File record not found, but continuing with directory cleanup.");
      }

      // Attempt to delete the architecture directory
      fs.rm(basefilePath, { recursive: true, force: true }, (err) => {
        if (err) {
          console.log(`Could not delete the architecture directory: ${err}`);
        }
      });

      res.status(200).send({
        message: "File and database record are deleted, or file was not found but cleanup attempted."
      });
    } catch (dbErr) {
      console.log(`Could not delete the database record: ${dbErr}`);
      res.status(200).send({
        message: "File deletion attempted, but encountered issues with database or directory cleanup."
      });
    }
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while deleting the file."
    });
  }
};

const update = async (req, res) => {
    const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
    const fileName = `vagrant.box`;
    const oldFilePath = path.join(__basedir, "resources/static/assets/uploads", organization, boxId, versionNumber, providerName, architectureName);
    const newFilePath = path.join(__basedir, "resources/static/assets/uploads", req.body.newOrganization || organization, req.body.newBoxId || boxId, req.body.newVersionNumber || versionNumber, req.body.newProviderName || providerName, req.body.newArchitectureName || architectureName);

    try {
      const architecture = await Architecture.findOne({
        where: { name: architectureName },
        include: [{
          model: db.providers,
          as: "provider",
          where: { name: providerName },
          include: [{
            model: db.versions,
            as: "version",
            where: { versionNumber },
            include: [{ model: db.box, as: "box", where: { name: boxId, organization } }]
          }]
        }]
      });

      if (!architecture) {
        return res.status(404).send({
          message: `Architecture not found for provider ${providerName} in version ${versionNumber} of box ${boxId}.`
        });
      }

      const fileRecord = await File.findOne({
        where: {
          fileName: fileName,
          architectureId: architecture.id
        }
      });

      if (!fileRecord) {
        return res.status(404).send({
          message: "File not found. Please upload the file first."
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

      await uploadFile(req, res);

      let checksum = req.body.checksum;
      let checksumType = req.body.checksumType;

      if (!req.files['file']) {
        return res.status(400).send({ message: "Please upload a file!" });
      }

      if (!checksumType || checksumType.toUpperCase() === 'NULL') {
        checksum = null;
        checksumType = null;
      }

      await fileRecord.update({
        fileName: fileName,
        checksum: checksum,
        checksumType: checksumType
      });

      res.status(200).send({
        message: "Updated the file successfully: " + req.files['file'][0].originalname,
      });
    } catch (err) {
      console.log(err);

      if (err.code == "LIMIT_FILE_SIZE") {
        return res.status(500).send({
          message: "File size cannot be larger than 10GB!",
        });
      }

      res.status(500).send({
        message: `Could not update the file: ${req.files ? req.files['file'][0].originalname : ''}. ${err}`,
      });
    }
  };

module.exports = {
  upload,
  download,
  remove,
  update,
  info,
};