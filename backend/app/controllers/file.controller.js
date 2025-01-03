// file.controller.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const jwt = require("jsonwebtoken");
const db = require("../models");
const { uploadFile: uploadFileMiddleware } = require("../middleware/upload");

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
  const filePath = path.join(appConfig.boxvault.box_storage_directory.value, organization, boxId, versionNumber, providerName, architectureName, fileName);
  const uploadStartTime = Date.now();

  // Set a longer timeout for the request
  req.setTimeout(24 * 60 * 60 * 1000); // 24 hours
  res.setTimeout(24 * 60 * 60 * 1000); // 24 hours

  try {
    // Create directory if it doesn't exist
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

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
          include: [{
            model: db.box,
            as: "box",
            where: { name: boxId },
            include: [{
              model: db.user,
              as: "user",
              include: [{
                model: db.organization,
                as: "organization",
                where: { name: organization }
              }]
            }]
          }]
        }]
      }]
    });

    if (!architecture) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: `Architecture not found for provider ${providerName} in version ${versionNumber} of box ${boxId}.`
      });
    }

    // Process the upload using Promise-based middleware
    await new Promise((resolve, reject) => {
      uploadFileMiddleware(req, res, (err) => {
        if (err) {
          reject(err);
        } else if (!req.file) {
          reject(new Error('No file uploaded'));
        } else {
          resolve(req.file);
        }
      });
    });

    // If headers are already sent by middleware, return
    if (res.headersSent) {
      console.log('Headers already sent by middleware');
      return;
    }

    // Log successful file upload
    console.log('File uploaded successfully:', {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: req.file.path
    });

    try {
      // Get checksum info
      let checksum = req.body.checksum;
      let checksumType = req.body.checksumType;

      if (!checksumType || checksumType.toUpperCase() === 'NULL') {
        checksum = null;
        checksumType = 'NULL';
      }

      // Find existing file record or create new one
      let fileRecord = await File.findOne({
        where: {
          fileName: fileName,
          architectureId: architecture.id
        }
      });

      if (fileRecord) {
        // Update existing record
        await fileRecord.update({
          checksum: checksum,
          checksumType: checksumType,
          fileSize: req.file.size
        });
        console.log('File record updated:', {
          fileName,
          checksum,
          checksumType,
          architectureId: architecture.id,
          fileSize: req.file.size,
          path: req.file.path
        });
      } else {
        // Create new record
        fileRecord = await File.create({
          fileName: fileName,
          checksum: checksum,
          checksumType: checksumType,
          architectureId: architecture.id,
          fileSize: req.file.size
        });
        console.log('File record created:', {
          fileName,
          checksum,
          checksumType,
          architectureId: architecture.id,
          fileSize: req.file.size,
          path: req.file.path
        });
      }

      // Send detailed success response
      return res.status(200).json({
        message: fileRecord ? "File updated successfully" : "File uploaded successfully",
        fileName: fileName,
        originalName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        path: req.file.path,
        checksum: checksum,
        checksumType: checksumType,
        fileRecord: fileRecord
      });
    } catch (dbError) {
      console.error('Database error during file upload:', dbError);
      throw dbError;
    }
  } catch (err) {
    // Log detailed error information
    console.error('File upload error:', {
      error: err.message,
      code: err.code,
      stack: err.stack,
      params: {
        organization,
        boxId,
        versionNumber,
        providerName,
        architectureName
      }
    });

    // Handle specific error types
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).send({
        message: `File size cannot be larger than ${appConfig.boxvault.box_max_file_size.value}GB!`,
        error: "FILE_TOO_LARGE"
      });
    }

    if (err.message.includes('Upload timeout') || err.code === 'ETIMEDOUT') {
      const uploadDuration = (Date.now() - uploadStartTime) / 1000;
      return res.status(408).send({
        message: "Upload timed out - Request took too long to complete",
        error: "UPLOAD_TIMEOUT",
        details: {
          duration: `${uploadDuration} seconds`,
          maxFileSize: `${appConfig.boxvault.box_max_file_size.value}GB`
        }
      });
    }

    // Handle disk space errors
    if (err.code === 'ENOSPC') {
      return res.status(507).send({
        message: "Not enough storage space available",
        error: "NO_STORAGE_SPACE"
      });
    }

    // Generic error response with more details
    if (!res.headersSent) {
      res.status(500).json({
        error: 'UPLOAD_ERROR',
        message: "Could not upload the file",
        details: {
          error: err.message,
          code: err.code || 'UNKNOWN_ERROR',
          duration: (Date.now() - uploadStartTime) / 1000
        }
      });
    }
  }
};

const download = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  const fileName = `vagrant.box`;
  const filePath = path.join(appConfig.boxvault.box_storage_directory.value, organization, boxId, versionNumber, providerName, architectureName, fileName);
  // Get auth info from download token
  let userId;
  let isServiceAccount;
  
  const downloadToken = req.query.token;
  if (downloadToken) {
    try {
      const decoded = jwt.verify(downloadToken, authConfig.jwt.jwt_secret.value);
      userId = decoded.userId;
      isServiceAccount = decoded.isServiceAccount;
      
      // Verify the token matches the requested download
      if (decoded.organization !== organization ||
          decoded.boxId !== boxId ||
          decoded.versionNumber !== versionNumber ||
          decoded.providerName !== providerName ||
          decoded.architectureName !== architectureName) {
        return res.status(403).send({ message: "Invalid download token." });
      }
    } catch (err) {
      console.warn("Invalid download token:", err.message);
      return res.status(403).send({ message: "Invalid or expired download token." });
    }
  } else if (req.isVagrantRequest) {
    // For Vagrant requests, use the auth info set by vagrantHandler
    userId = req.userId;
    isServiceAccount = req.isServiceAccount;
  } else {
    return res.status(403).send({ message: "No download token provided." });
  }

  console.log('Auth context in download:', {
    userId,
    isServiceAccount,
    isVagrantRequest: req.isVagrantRequest,
    headers: req.headers
  });

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
          attributes: ['id', 'name', 'isPublic'],
          include: [{
            model: db.versions,
            as: 'versions',
            where: { versionNumber: versionNumber },
            include: [{
              model: db.providers,
              as: 'providers',
              where: { name: providerName },
              include: [{
                model: db.architectures,
                as: 'architectures',
                where: { name: architectureName }
              }]
            }]
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

    // Function to handle file download and increment counter
    const sendFile = async () => {
      // Find and increment download count
      const fileRecord = await File.findOne({
        where: {
          fileName: 'vagrant.box',
          architectureId: box.versions[0].providers[0].architectures[0].id
        }
      });

      if (fileRecord) {
        await fileRecord.increment('downloadCount');
        console.log('Download count incremented:', {
          fileName: fileRecord.fileName,
          newCount: fileRecord.downloadCount + 1,
          userAgent: req.headers['user-agent']
        });
      }

      // Get file stats for content-length
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;

      // Set common headers
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', fileSize);

      // Handle range requests
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;

        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        res.setHeader('Content-Length', chunksize);
        res.status(206); // Partial Content

        const fileStream = fs.createReadStream(filePath, { start, end });
        fileStream.pipe(res);

        fileStream.on('error', (err) => {
          if (!res.headersSent) {
            res.status(500).send({
              message: "Could not download the file. " + err,
            });
          }
        });
      } else {
        // For Vagrant requests without range, still use proper headers
        if (req.isVagrantRequest) {
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
          
          const fileStream = fs.createReadStream(filePath);
          fileStream.pipe(res);

          fileStream.on('error', (err) => {
            if (!res.headersSent) {
              res.status(500).send({
                message: "Could not download the file. " + err,
              });
            }
          });
        } else {
          // For browser downloads, use express's res.download
          res.download(filePath, fileName, (err) => {
            if (err && !res.headersSent) {
              res.status(500).send({
                message: "Could not download the file. " + err,
              });
            }
          });
        }
      }
    };

    // If the box is public or the requester is a service account, allow download
    if (box.isPublic || isServiceAccount) {
      return sendFile();
    }

    // If the box is private, check if the user belongs to the organization
    if (!userId) {
      return res.status(403).send({ message: "Unauthorized access to file download." });
    }

    const user = organizationData.users.find(user => user.id === userId);
    if (!user) {
      return res.status(403).send({ message: "Unauthorized access to file download." });
    }

    // If the user belongs to the organization, allow download
    return sendFile();

  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while downloading the file." });
  }
};

const info = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  
  // Get auth info either from vagrantHandler or x-access-token
  let userId = req.userId;  // Set by vagrantHandler for Vagrant requests
  let isServiceAccount = req.isServiceAccount;  // Set by vagrantHandler for Vagrant requests

  // If not set by vagrantHandler, try x-access-token
  if (!userId) {
    const token = req.headers["x-access-token"];
    if (token) {
      try {
        const decoded = jwt.verify(token, authConfig.jwt.jwt_secret.value);
        userId = decoded.id;
        isServiceAccount = decoded.isServiceAccount || false;
      } catch (err) {
        console.warn("Invalid x-access-token:", err.message);
      }
    }
  }

  console.log('Auth context in info:', {
    userId,
    isServiceAccount,
    isVagrantRequest: req.isVagrantRequest,
    headers: req.headers
  });

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
          attributes: ['id', 'name', 'isPublic'],
          include: [{
            model: db.versions,
            as: 'versions',
            where: { versionNumber: versionNumber },
            include: [{
              model: db.providers,
              as: 'providers',
              where: { name: providerName },
              include: [{
                model: db.architectures,
                as: 'architectures',
                where: { name: architectureName }
              }]
            }]
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

    // If the box is public or the requester is a service account, allow access
    if (box.isPublic || isServiceAccount) {
      const fileRecord = await File.findOne({
        where: {
          fileName: 'vagrant.box',
          architectureId: box.versions[0].providers[0].architectures[0].id
        }
      });

      if (fileRecord) {
        // Generate a secure download token
        const downloadToken = jwt.sign(
          { 
            userId,
            isServiceAccount,
            organization,
            boxId,
            versionNumber,
            providerName,
            architectureName
          },
          authConfig.jwt.jwt_secret.value,
          { expiresIn: '1h' }
        );

        // Create secure download URL
        const downloadUrl = `${appConfig.boxvault.api_url.value}/organization/${organization}/box/${boxId}/version/${versionNumber}/provider/${providerName}/architecture/${architectureName}/file/download?token=${downloadToken}`;

        return res.send({
          fileName: fileRecord.fileName,
          downloadUrl,
          downloadCount: fileRecord.downloadCount,
          checksum: fileRecord.checksum,
          checksumType: fileRecord.checksumType,
          fileSize: fileRecord.fileSize
        });
      } else {
        return res.status(404).send({ message: "File not found." });
      }
    }

    // If the box is private, check if the user belongs to the organization
    if (!userId) {
      return res.status(403).send({ message: "Unauthorized access to file information." });
    }

    const user = organizationData.users.find(user => user.id === userId);
    if (!user) {
      return res.status(403).send({ message: "Unauthorized access to file information." });
    }

    // If the user belongs to the organization, allow access
    const fileRecord = await File.findOne({
      where: {
        fileName: 'vagrant.box',
        architectureId: box.versions[0].providers[0].architectures[0].id
      }
    });

    if (fileRecord) {
      // Generate a secure download token
      const downloadToken = jwt.sign(
        { 
          userId,
          isServiceAccount,
          organization,
          boxId,
          versionNumber,
          providerName,
          architectureName
        },
        authConfig.jwt.jwt_secret.value,
        { expiresIn: '1h' }
      );

      // Create secure download URL
      const downloadUrl = `${appConfig.boxvault.api_url.value}/organization/${organization}/box/${boxId}/version/${versionNumber}/provider/${providerName}/architecture/${architectureName}/file/download?token=${downloadToken}`;

      return res.send({
        fileName: fileRecord.fileName,
        downloadUrl,
        downloadCount: fileRecord.downloadCount,
        checksum: fileRecord.checksum,
        checksumType: fileRecord.checksumType,
        fileSize: fileRecord.fileSize
      });
    } else {
      return res.status(404).send({ message: "File not found." });
    }

  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while retrieving the file information." });
  }
};

const remove = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  const fileName = `vagrant.box`;
  const basefilePath = path.join(appConfig.boxvault.box_storage_directory.value, organization, boxId, versionNumber, providerName, architectureName);
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
          include: [{
            model: db.box,
            as: "box",
            where: { name: boxId },
            include: [{
              model: db.user,
              as: "user",
              include: [{
                model: db.organization,
                as: "organization",
                where: { name: organization }
              }]
            }]
          }]
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
  const oldFilePath = path.join(appConfig.boxvault.box_storage_directory.value, organization, boxId, versionNumber, providerName, architectureName);
  const newFilePath = path.join(appConfig.boxvault.box_storage_directory.value, req.body.newOrganization || organization, req.body.newBoxId || boxId, req.body.newVersionNumber || versionNumber, req.body.newProviderName || providerName, req.body.newArchitectureName || architectureName);
  const uploadStartTime = Date.now();

  // Set a longer timeout for the request
  req.setTimeout(24 * 60 * 60 * 1000); // 24 hours
  res.setTimeout(24 * 60 * 60 * 1000); // 24 hours

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
          include: [{
            model: db.box,
            as: "box",
            where: { name: boxId },
            include: [{
              model: db.user,
              as: "user",
              include: [{
                model: db.organization,
                as: "organization",
                where: { name: organization }
              }]
            }]
          }]
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

    // Process the upload using Promise-based middleware
    await new Promise((resolve, reject) => {
      uploadFileMiddleware(req, res, (err) => {
        if (err) {
          reject(err);
        } else if (!req.file) {
          reject(new Error('No file uploaded'));
        } else {
          resolve(req.file);
        }
      });
    });

    // If headers are already sent by middleware, return
    if (res.headersSent) {
      console.log('Headers already sent by middleware');
      return;
    }

    // Log successful file upload
    console.log('File updated successfully:', {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: req.file.path
    });

    let checksum = req.body.checksum;
    let checksumType = req.body.checksumType;

    if (!checksumType || checksumType.toUpperCase() === 'NULL') {
      checksum = null;
      checksumType = null;
    }

    // Update the file record with new information
    await fileRecord.update({
      fileName: fileName,
      checksum: checksum,
      checksumType: checksumType,
      fileSize: req.file.size
    });

    // Log successful update
    console.log('File record updated:', {
      fileName,
      checksum,
      checksumType,
      architectureId: architecture.id,
      fileSize: req.file.size,
      path: req.file.path
    });

    return res.status(200).send({
      message: "Updated the file successfully",
      fileName: fileName,
      fileSize: req.file.size,
      path: req.file.path
    });
  } catch (err) {
    console.log(err);

    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: "FILE_TOO_LARGE",
        message: `File size cannot be larger than ${appConfig.boxvault.box_max_file_size.value}GB!`,
        details: {
          maxSize: appConfig.boxvault.box_max_file_size.value * 1024 * 1024 * 1024,
          duration: (Date.now() - uploadStartTime) / 1000
        }
      });
    }

    if (err.message.includes('Upload timeout') || err.code === 'ETIMEDOUT') {
      const uploadDuration = (Date.now() - uploadStartTime) / 1000;
      return res.status(408).json({
        error: "UPLOAD_TIMEOUT",
        message: "Upload timed out - Request took too long to complete",
        details: {
          duration: uploadDuration,
          maxFileSize: appConfig.boxvault.box_max_file_size.value * 1024 * 1024 * 1024
        }
      });
    }

    // Handle disk space errors
    if (err.code === 'ENOSPC') {
      return res.status(507).json({
        error: "NO_STORAGE_SPACE",
        message: "Not enough storage space available",
        details: {
          path: filePath,
          duration: (Date.now() - uploadStartTime) / 1000
        }
      });
    }

    res.status(500).send({
      message: `Could not update the file: ${req.file ? req.file.originalname : ''}`,
      error: err.message,
      code: err.code || 'UNKNOWN_ERROR',
      details: {
        duration: (Date.now() - uploadStartTime) / 1000
      }
    });
  }
};

const getDownloadLink = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  
  // Get auth info from x-access-token
  let userId = req.userId;
  let isServiceAccount = req.isServiceAccount;

  // If not set, try x-access-token
  if (!userId) {
    const token = req.headers["x-access-token"];
    if (token) {
      try {
        const decoded = jwt.verify(token, authConfig.jwt.jwt_secret.value);
        userId = decoded.id;
        isServiceAccount = decoded.isServiceAccount || false;
      } catch (err) {
        console.warn("Invalid x-access-token:", err.message);
      }
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
          attributes: ['id', 'name', 'isPublic'],
          include: [{
            model: db.versions,
            as: 'versions',
            where: { versionNumber: versionNumber },
            include: [{
              model: db.providers,
              as: 'providers',
              where: { name: providerName },
              include: [{
                model: db.architectures,
                as: 'architectures',
                where: { name: architectureName }
              }]
            }]
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

    // Check authorization
    if (!box.isPublic && !isServiceAccount) {
      if (!userId) {
        return res.status(403).send({ message: "Unauthorized access to file." });
      }

      const user = organizationData.users.find(user => user.id === userId);
      if (!user) {
        return res.status(403).send({ message: "Unauthorized access to file." });
      }
    }

    // Generate a secure download token
    const downloadToken = jwt.sign(
      { 
        userId,
        isServiceAccount,
        organization,
        boxId,
        versionNumber,
        providerName,
        architectureName
      },
      authConfig.jwt.jwt_secret.value,
      { expiresIn: '1h' }
    );

    // Return the secure download URL
    const downloadUrl = `${appConfig.boxvault.api_url.value}/organization/${organization}/box/${boxId}/version/${versionNumber}/provider/${providerName}/architecture/${architectureName}/file/download?token=${downloadToken}`;

    return res.status(200).json({ downloadUrl });

  } catch (err) {
    res.status(500).send({ 
      message: err.message || "Some error occurred while generating the download link.",
      error: err
    });
  }
};

module.exports = {
  upload,
  download,
  remove,
  update,
  info,
  getDownloadLink
};
