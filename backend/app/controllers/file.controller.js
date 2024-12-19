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
  // Handle both API and Vagrant URL formats
  const params = req.isVagrantRequest ? {
    organization: req.vagrantInfo.organization,
    name: req.vagrantInfo.boxName,
    version: req.vagrantInfo.version,
    provider: req.vagrantInfo.provider,
    architecture: req.vagrantInfo.architecture
  } : {
    organization: req.params.organization,
    name: req.params.name,
    version: req.params.version,
    provider: req.params.provider,
    architecture: req.params.architecture
  };
  const fileName = `vagrant.box`;
  const filePath = path.join(appConfig.boxvault.box_storage_directory.value, params.organization, params.name, params.version, params.provider, params.architecture, fileName);
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

    const architectureRecord = await Architecture.findOne({
      where: { name: params.architecture },
      include: [{
        model: db.providers,
        as: "provider",
        where: { name: params.provider },
        include: [{
          model: db.versions,
          as: "version",
          where: { versionNumber: params.version },
          include: [{
            model: db.box,
            as: "box",
            where: { name: params.name },
            include: [{
              model: db.user,
              as: "user",
              include: [{
                model: db.organization,
                as: "organization",
                where: { name: params.organization }
              }]
            }]
          }]
        }]
      }]
    });

    if (!architectureRecord) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: `Architecture not found for provider ${params.provider} in version ${params.version} of box ${params.name}.`
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
          architectureId: architectureRecord.id
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
          architectureId: architectureRecord.id,
          fileSize: req.file.size,
          path: req.file.path
        });
      } else {
        // Create new record
        fileRecord = await File.create({
          fileName: fileName,
          checksum: checksum,
          checksumType: checksumType,
          architectureId: architectureRecord.id,
          fileSize: req.file.size
        });
        console.log('File record created:', {
          fileName,
          checksum,
          checksumType,
          architectureId: architectureRecord.id,
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
      params: params
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
  // Handle both API and Vagrant URL formats
  const params = req.isVagrantRequest ? {
    organization: req.vagrantInfo.organization,
    name: req.vagrantInfo.boxName,
    version: req.vagrantInfo.version,
    provider: req.vagrantInfo.provider,
    architecture: req.vagrantInfo.architecture
  } : {
    organization: req.params.organization,
    name: req.params.name,
    version: req.params.version,
    provider: req.params.provider,
    architecture: req.params.architecture
  };
  const fileName = `vagrant.box`;
  const filePath = path.join(appConfig.boxvault.box_storage_directory.value, params.organization, params.name, params.version, params.provider, params.architecture, fileName);
  // Get auth info from middleware
  const userId = req.userId;
  const isServiceAccount = req.isServiceAccount;
  
  console.log('Auth info:', {
    userId,
    isServiceAccount,
    hasUser: !!req.user
  });

  try {
    // First find the box and its organization
    const box = await db.box.findOne({
      where: { name: params.name },
      attributes: ['id', 'name', 'isPublic', 'published', 'userId'],
      include: [
        {
          model: db.user,
          as: 'user',
          include: [{
            model: db.organization,
            as: 'organization',
            where: { name: params.organization }
          }]
        },
        {
          model: db.versions,
          as: 'versions',
          where: { versionNumber: params.version },
          include: [{
            model: db.providers,
            as: 'providers',
            where: { name: params.provider },
            include: [{
              model: db.architectures,
              as: 'architectures',
              where: { name: params.architecture }
            }]
          }]
        }
      ]
    });

    if (!box || !box.user || !box.user.organization) {
      return res.status(404).send({
        message: `Box ${params.name} not found in organization ${params.organization}.`
      });
    }

    const organization = box.user.organization;

    // Log box status and auth details
    console.log('Box access check:', {
      box: {
        name: box.name,
        published: box.published,
        isPublic: box.isPublic
      },
      auth: {
        userId,
        isServiceAccount,
        hasUser: !!req.user
      }
    });

    // Check access based on box status and user permissions
    let accessReason = '';
    const canAccess = await (async () => {
      // Published + Public: Anyone can download
      if (box.published && box.isPublic) {
        accessReason = 'Public published box';
        return true;
      }

      // Unpublished boxes cannot be downloaded
      if (!box.published) {
        accessReason = 'Box is not published';
        return false;
      }

      // If user is authenticated
      if (userId) {
        // Service accounts can access all published boxes
        if (isServiceAccount) {
          accessReason = 'Service account access';
          return true;
        }

        // For regular users, check organization membership
        if (box.published && !box.isPublic) {
          // Get user's organization
          const user = await db.user.findByPk(userId, {
            include: [{ model: db.organization, as: 'organization' }]
          });

          if (!user) {
            accessReason = 'User not found';
            return false;
          }

          const hasAccess = user.organization.id === organization.id;
          accessReason = hasAccess ? 'Organization member access to private box' : 'User not in organization';
          return hasAccess;
        }
      } else {
        accessReason = 'No authenticated user';
      }

      accessReason = 'No access rule matched';
      return false;
    })();

    // Log access check result
    console.log('Access check result:', {
      canAccess,
      reason: accessReason,
      url: req.url,
      method: req.method,
      headers: req.headers
    });

    if (!canAccess) {
      return res.status(403).json({ 
        message: !box.published
          ? "This box is not published and cannot be downloaded."
          : "This box is private. Please authenticate to download it.",
        details: {
          reason: accessReason
        }
      });
    }

    // Check if file exists before attempting to create stream
    if (!fs.existsSync(filePath)) {
      return res.status(404).send({
        message: "File not found",
        error: "ENOENT"
      });
    }

    // If access is granted and file exists, stream the file
    const stream = fs.createReadStream(filePath);
    
    // Handle stream errors
    stream.on('error', (err) => {
      console.error('Stream error:', err);
      // Only send error if headers haven't been sent yet
      if (!res.headersSent) {
        res.status(500).send({
          message: "Could not download the file. " + err.message
        });
      }
    });

    // Handle client disconnect and cleanup
    let isDisconnected = false;
    req.on('close', () => {
      isDisconnected = true;
      stream.destroy();
      console.log('Download interrupted - client disconnected');
    });

    // Handle stream end
    stream.on('end', () => {
      if (!isDisconnected) {
        console.log('Download completed successfully');
      }
    });

    // Handle stream errors with cleanup
    stream.on('error', (err) => {
      console.error('Stream error:', err);
      if (!isDisconnected && !res.headersSent) {
        res.status(500).send({
          message: "Could not download the file. " + err.message
        });
      }
      stream.destroy();
    });

    // Set response headers for Vagrant box downloads
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Get file stats for Content-Length
    const stats = fs.statSync(filePath);
    if (!req.headers.range) {
      res.setHeader('Content-Length', stats.size);
    }

    // Handle range requests
    if (req.headers.range) {
      let rangeStream;
      try {
        // Check if file exists before attempting to create stream
        if (!fs.existsSync(filePath)) {
          throw Object.assign(new Error('File not found'), { code: 'ENOENT' });
        }
        
        const stats = fs.statSync(filePath);
        const range = req.headers.range;
        
        // Parse range header
        const match = range.match(/bytes=(\d+)-(\d*)/);
        if (!match) {
          throw new Error('Invalid range format');
        }

        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : stats.size - 1;
        const chunksize = (end - start) + 1;

        // Validate range values
        if (start >= stats.size || end >= stats.size || start > end) {
          throw new Error('Invalid range values');
        }

        console.log('Range request:', { 
          range,
          start,
          end,
          chunksize,
          fileSize: stats.size,
          headers: req.headers
        });

        // Set response headers for partial content
        res.setHeader('Content-Range', `bytes ${start}-${end}/${stats.size}`);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', chunksize);
        res.status(206);

        // Create a new stream for the range
        const rangeStream = fs.createReadStream(filePath, { start, end });
        
        // Track stream state
        let isDisconnected = false;

        // Handle client disconnect and cleanup
        req.on('close', () => {
          isDisconnected = true;
          rangeStream.destroy();
          console.log('Range download interrupted - client disconnected:', {
            range,
            start,
            end,
            bytesRead: end - start + 1
          });
        });

        // Handle stream end
        rangeStream.on('end', () => {
          if (!isDisconnected) {
            console.log('Range download completed successfully:', {
              range,
              start,
              end,
              chunksize
            });
          }
        });

        // Handle stream errors with cleanup
        rangeStream.on('error', (err) => {
          console.error('Range stream error:', {
            error: err.message,
            code: err.code,
            range,
            start,
            end
          });
          if (!isDisconnected && !res.headersSent) {
            res.status(500).send({
              message: "Could not download the file range. " + err.message
            });
          }
          rangeStream.destroy();
        });

        rangeStream.pipe(res);
      } catch (err) {
        // Log detailed error info
        console.error('Range request error:', {
          error: err.message,
          code: err.code,
          range: req.headers.range,
          headers: req.headers,
          filePath,
          fileExists: fs.existsSync(filePath)
        });

        // Clean up any existing stream
        if (rangeStream) {
          rangeStream.destroy();
        }

        // Send appropriate error response if headers haven't been sent
        if (!res.headersSent) {
          if (err.message.includes('Invalid range')) {
            res.status(416).send({
              message: "Invalid range request",
              error: err.message
            });
          } else if (err.code === 'ENOENT') {
            res.status(404).send({
              message: "File not found",
              error: err.message
            });
          } else {
            res.status(500).send({
              message: "Error processing range request",
              error: err.message
            });
          }
        }
      }
    } else {
      // Stream the entire file
      stream.pipe(res);
    }

  } catch (err) {
    console.error('Download error:', {
      error: err.message,
      code: err.code,
      url: req.url,
      range: req.headers.range
    });
    
    // Only send error response if headers haven't been sent
    if (!res.headersSent) {
      res.status(500).send({ 
        message: err.message || "Some error occurred while downloading the file.",
        code: err.code || 'UNKNOWN_ERROR'
      });
    }
  }
};

const info = async (req, res) => {
  const params = {
    organization: req.params.organization,
    name: req.params.name,
    version: req.params.version,
    provider: req.params.provider,
    architecture: req.params.architecture
  };
  // Get auth info from middleware
  const userId = req.userId;
  const isServiceAccount = req.isServiceAccount;
  
  console.log('Auth info:', {
    userId,
    isServiceAccount,
    hasUser: !!req.user
  });

  try {
    const organizationData = await db.organization.findOne({
      where: { name: params.organization },
      include: [{
        model: db.user,
        as: 'users',
        include: [{
          model: db.box,
          as: 'box',
          where: { name: params.name },
          attributes: ['id', 'name', 'isPublic', 'published'],
          include: [{
            model: db.versions,
            as: 'versions',
            where: { versionNumber: params.version },
            include: [{
              model: db.providers,
              as: 'providers',
              where: { name: params.provider },
              include: [{
                model: db.architectures,
                as: 'architectures',
                where: { name: params.architecture }
              }]
            }]
          }]
        }]
      }]
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${params.organization}.`
      });
    }

    const box = organizationData.users.flatMap(user => user.box).find(box => box.name === params.name);

    if (!box) {
      return res.status(404).send({
        message: `Box ${params.name} not found in organization ${params.organization}.`
      });
    }

    // Check access based on box status and user permissions
    const canAccess = await (async () => {
      // Published + Public: Anyone can access
      if (box.published && box.isPublic) {
        return true;
      }

      // Unpublished boxes cannot be accessed
      if (!box.published) {
        return false;
      }

      // If user is authenticated
      if (userId) {
        // Service accounts can access all published boxes
        if (isServiceAccount) {
          return true;
        }

        // For regular users, check organization membership
        if (box.published && !box.isPublic) {
          // Get user's organization
          const user = await db.user.findOne({
            where: { id: userId },
            include: [{ model: db.organization, as: 'organization' }]
          });

          if (!user) {
            return false;
          }

          return user.organization.id === organizationData.id;
        }
      }

      return false;
    })();

    if (!canAccess) {
      return res.status(403).json({ 
        message: !box.published
          ? "This box is not published. File information is not available."
          : "This box is private. Please authenticate to access file information."
      });
    }

    // If access is granted, return file information
    const fileRecord = await File.findOne({
      where: {
        fileName: 'vagrant.box',
        architectureId: box.versions[0].providers[0].architectures[0].id
      }
    });

    if (fileRecord) {
      return res.send({
        fileName: fileRecord.fileName,
        downloadUrl: `${appConfig.boxvault.api_url.value}/api/organization/${params.organization}/box/${params.name}/version/${params.version}/provider/${params.provider}/architecture/${params.architecture}/file/download`,
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
  const params = {
    organization: req.params.organization,
    name: req.params.name,
    version: req.params.version,
    provider: req.params.provider,
    architecture: req.params.architecture
  };
  const fileName = `vagrant.box`;
  const basefilePath = path.join(appConfig.boxvault.box_storage_directory.value, params.organization, params.name, params.version, params.provider, params.architecture);
  const filePath = path.join(basefilePath, fileName);

  try {
    const architectureRecord = await Architecture.findOne({
      where: { name: params.architecture },
      include: [{
        model: db.providers,
        as: "provider",
        where: { name: params.provider },
        include: [{
          model: db.versions,
          as: "version",
          where: { versionNumber: params.version },
          include: [{
            model: db.box,
            as: "box",
            where: { name: params.name },
            include: [{
              model: db.user,
              as: "user",
              include: [{
                model: db.organization,
                as: "organization",
                where: { name: params.organization }
              }]
            }]
          }]
        }]
      }]
    });

    if (!architectureRecord) {
      return res.status(404).send({
        message: `Architecture not found for provider ${params.provider} in version ${params.version} of box ${params.name}.`
      });
    }

    const fileRecord = await File.findOne({
      where: {
        fileName: fileName,
        architectureId: architectureRecord.id
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
  const params = {
    organization: req.params.organization,
    name: req.params.name,
    version: req.params.version,
    provider: req.params.provider,
    architecture: req.params.architecture
  };
  const fileName = `vagrant.box`;
  const oldFilePath = path.join(appConfig.boxvault.box_storage_directory.value, params.organization, params.name, params.version, params.provider, params.architecture);
  const newFilePath = path.join(appConfig.boxvault.box_storage_directory.value, 
    req.body.newOrganization || params.organization,
    req.body.newName || params.name,
    req.body.newVersion || params.version,
    req.body.newProvider || params.provider,
    req.body.newArchitecture || params.architecture);
  const uploadStartTime = Date.now();

  // Set a longer timeout for the request
  req.setTimeout(24 * 60 * 60 * 1000); // 24 hours
  res.setTimeout(24 * 60 * 60 * 1000); // 24 hours

  try {
    const architectureRecord = await Architecture.findOne({
      where: { name: params.architecture },
      include: [{
        model: db.providers,
        as: "provider",
        where: { name: params.provider },
        include: [{
          model: db.versions,
          as: "version",
          where: { versionNumber: params.version },
          include: [{
            model: db.box,
            as: "box",
            where: { name: params.name },
            include: [{
              model: db.user,
              as: "user",
              include: [{
                model: db.organization,
                as: "organization",
                where: { name: params.organization }
              }]
            }]
          }]
        }]
      }]
    });

    if (!architectureRecord) {
      return res.status(404).send({
        message: `Architecture not found for provider ${params.provider} in version ${params.version} of box ${params.name}.`
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
      architectureId: architectureRecord.id,
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

module.exports = {
  upload,
  download,
  remove,
  update,
  info,
};
