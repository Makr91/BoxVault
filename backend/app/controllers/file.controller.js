// file.controller.js
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../utils/config-loader');
const { log } = require('../utils/Logger');
const jwt = require("jsonwebtoken");
const db = require("../models");
const { uploadFile: uploadFileMiddleware } = require("../middleware/upload");

let authConfig;
try {
  authConfig = loadConfig('auth');
} catch (e) {
  log.error.error(`Failed to load auth configuration: ${e.message}`);
}

let appConfig;
try {
  appConfig = loadConfig('app');
} catch (e) {
  log.error.error(`Failed to load App configuration: ${e.message}`);
}

const Architecture = db.architectures;
const File = db.files;

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}/file/upload:
 *   post:
 *     summary: Upload a Vagrant box file
 *     description: Upload a new Vagrant box file for a specific architecture and provider
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: path
 *         name: boxId
 *         required: true
 *         schema:
 *           type: string
 *         description: Box name
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *       - in: path
 *         name: providerName
 *         required: true
 *         schema:
 *           type: string
 *         description: Provider name (e.g., virtualbox, vmware)
 *       - in: path
 *         name: architectureName
 *         required: true
 *         schema:
 *           type: string
 *         description: Architecture name (e.g., amd64, arm64)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Vagrant box file to upload
 *               checksum:
 *                 type: string
 *                 description: File checksum for verification
 *               checksumType:
 *                 type: string
 *                 description: Checksum algorithm (e.g., sha256, md5)
 *                 enum: [sha256, md5, sha1, NULL]
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "File uploaded successfully"
 *                 fileName:
 *                   type: string
 *                   example: "vagrant.box"
 *                 originalName:
 *                   type: string
 *                   description: Original filename
 *                 fileSize:
 *                   type: integer
 *                   description: File size in bytes
 *                 mimeType:
 *                   type: string
 *                   description: MIME type of the uploaded file
 *                 path:
 *                   type: string
 *                   description: File path on server
 *                 checksum:
 *                   type: string
 *                   description: File checksum
 *                 checksumType:
 *                   type: string
 *                   description: Checksum algorithm used
 *                 fileRecord:
 *                   $ref: '#/components/schemas/File'
 *       404:
 *         description: Architecture not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "NOT_FOUND"
 *                 message:
 *                   type: string
 *                   example: "Architecture not found for provider virtualbox in version 1.0.0 of box mybox."
 *       408:
 *         description: Upload timeout
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Upload timed out - Request took too long to complete"
 *                 error:
 *                   type: string
 *                   example: "UPLOAD_TIMEOUT"
 *                 details:
 *                   type: object
 *                   properties:
 *                     duration:
 *                       type: string
 *                       example: "3600 seconds"
 *                     maxFileSize:
 *                       type: string
 *                       example: "10GB"
 *       413:
 *         description: File too large
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "File size cannot be larger than 10GB!"
 *                 error:
 *                   type: string
 *                   example: "FILE_TOO_LARGE"
 *       507:
 *         description: Insufficient storage space
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Not enough storage space available"
 *                 error:
 *                   type: string
 *                   example: "NO_STORAGE_SPACE"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "UPLOAD_ERROR"
 *                 message:
 *                   type: string
 *                   example: "Could not upload the file"
 *                 details:
 *                   type: object
 *                   properties:
 *                     error:
 *                       type: string
 *                     code:
 *                       type: string
 *                     duration:
 *                       type: number
 */
const upload = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  const fileName = `vagrant.box`;
  const filePath = path.join(appConfig.boxvault.box_storage_directory.value, organization, boxId, versionNumber, providerName, architectureName, fileName);
  const uploadStartTime = Date.now();

  log.app.info('=== FILE UPLOAD STARTED ===', {
    organization,
    boxId,
    versionNumber,
    providerName,
    architectureName,
    fileName,
    filePath,
    headers: {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length'],
      'x-access-token': req.headers['x-access-token'] ? 'present' : 'missing',
      'x-checksum': req.headers['x-checksum'] || 'missing',
      'x-checksum-type': req.headers['x-checksum-type'] || 'missing',
      'x-file-name': req.headers['x-file-name'] || 'missing'
    },
    method: req.method,
    url: req.url
  });

  // Set a longer timeout for the request
  req.setTimeout(24 * 60 * 60 * 1000); // 24 hours
  res.setTimeout(24 * 60 * 60 * 1000); // 24 hours

  try {
    log.app.info('Creating upload directory if needed:', { filePath });
    
    // Create directory if it doesn't exist
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      log.app.info('Created upload directory:', { dir });
    } else {
      log.app.info('Upload directory already exists:', { dir });
    }

    log.app.info('Looking up architecture in database...');
    
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
      log.app.error('Architecture not found in database', {
        architectureName,
        providerName,
        versionNumber,
        boxId,
        organization
      });
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: `Architecture not found for provider ${providerName} in version ${versionNumber} of box ${boxId}.`
      });
    }

    log.app.info('Architecture found, calling upload middleware...', {
      architectureId: architecture.id,
      architectureName: architecture.name
    });

    // Call the upload middleware directly (it handles the response)
    await uploadFileMiddleware(req, res);
    
    log.app.info('Upload middleware completed successfully');
  } catch (err) {
    // Log detailed error information
    log.error.error('File upload error:', {
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

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}/file/download:
 *   get:
 *     summary: Download a Vagrant box file
 *     description: Download the Vagrant box file with support for range requests and authentication
 *     tags: [Files]
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: path
 *         name: boxId
 *         required: true
 *         schema:
 *           type: string
 *         description: Box name
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *       - in: path
 *         name: providerName
 *         required: true
 *         schema:
 *           type: string
 *         description: Provider name
 *       - in: path
 *         name: architectureName
 *         required: true
 *         schema:
 *           type: string
 *         description: Architecture name
 *       - in: query
 *         name: token
 *         schema:
 *           type: string
 *         description: Download token for authentication
 *       - in: header
 *         name: Range
 *         schema:
 *           type: string
 *         description: Range header for partial content requests
 *         example: "bytes=0-1023"
 *     responses:
 *       200:
 *         description: File download (full content)
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *         headers:
 *           Content-Length:
 *             schema:
 *               type: integer
 *             description: File size in bytes
 *           Accept-Ranges:
 *             schema:
 *               type: string
 *               example: "bytes"
 *             description: Indicates server supports range requests
 *       206:
 *         description: Partial content (range request)
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *         headers:
 *           Content-Range:
 *             schema:
 *               type: string
 *               example: "bytes 0-1023/2048"
 *             description: Range of bytes being returned
 *           Content-Length:
 *             schema:
 *               type: integer
 *             description: Size of the partial content
 *       403:
 *         description: Unauthorized access
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: File or organization not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       416:
 *         description: Range not satisfiable
 *         headers:
 *           Content-Range:
 *             schema:
 *               type: string
 *               example: "bytes *2048"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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
      const decoded = jwt.verify(downloadToken, authConfig.auth.jwt.jwt_secret.value);
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
      log.app.warn("Invalid download token:", err.message);
      return res.status(403).send({ message: "Invalid or expired download token." });
    }
  } else if (req.isVagrantRequest) {
    // For Vagrant requests, use the auth info set by vagrantHandler
    userId = req.userId;
    isServiceAccount = req.isServiceAccount;
  } else {
    return res.status(403).send({ message: "No download token provided." });
  }

  log.app.info('Auth context in download:', {
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
        log.app.info('Download count incremented:', {
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
        let start = parseInt(parts[0], 10);
        let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        
        // Validate range values
        if (isNaN(start)) {
          start = 0;
        }
        
        if (isNaN(end) || end >= fileSize) {
          end = fileSize - 1;
        }
        
        // Ensure start is not greater than end
        if (start > end) {
          log.app.warn(`Invalid range request: start (${start}) > end (${end}), adjusting start to 0`);
          start = 0;
        }
        
        // Ensure start is not greater than file size
        if (start >= fileSize) {
          log.app.warn(`Range start (${start}) >= file size (${fileSize}), returning 416 Range Not Satisfiable`);
          res.setHeader('Content-Range', `bytes */${fileSize}`);
          return res.status(416).send(); // Range Not Satisfiable
        }
        
        const chunksize = (end - start) + 1;
        
        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        res.setHeader('Content-Length', chunksize);
        res.status(206); // Partial Content

        try {
          const fileStream = fs.createReadStream(filePath, { start, end });
          fileStream.pipe(res);

          fileStream.on('error', (err) => {
            if (!res.headersSent) {
              res.status(500).send({
                message: "Could not download the file. " + err,
              });
            }
          });
        } catch (streamErr) {
          log.error.error('Error creating read stream:', {
            error: streamErr.message,
            range: `${start}-${end}`,
            fileSize
          });
          if (!res.headersSent) {
            res.status(500).send({
              message: "Could not create file stream: " + streamErr.message,
            });
          }
        }
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

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}/file/info:
 *   get:
 *     summary: Get file information
 *     description: Retrieve information about a Vagrant box file including download URL and metadata
 *     tags: [Files]
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: path
 *         name: boxId
 *         required: true
 *         schema:
 *           type: string
 *         description: Box name
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *       - in: path
 *         name: providerName
 *         required: true
 *         schema:
 *           type: string
 *         description: Provider name
 *       - in: path
 *         name: architectureName
 *         required: true
 *         schema:
 *           type: string
 *         description: Architecture name
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: Optional JWT token for accessing private files
 *     responses:
 *       200:
 *         description: File information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 fileName:
 *                   type: string
 *                   example: "vagrant.box"
 *                   description: Name of the file
 *                 downloadUrl:
 *                   type: string
 *                   example: "https://api.example.com/organization/myorg/box/mybox/version/1.0.0/provider/virtualbox/architecture/amd64/file/download?token=..."
 *                   description: Secure download URL with token
 *                 downloadCount:
 *                   type: integer
 *                   example: 42
 *                   description: Number of times the file has been downloaded
 *                 checksum:
 *                   type: string
 *                   example: "a1b2c3d4e5f6..."
 *                   description: File checksum
 *                 checksumType:
 *                   type: string
 *                   example: "sha256"
 *                   description: Checksum algorithm used
 *                 fileSize:
 *                   type: integer
 *                   example: 1073741824
 *                   description: File size in bytes
 *       403:
 *         description: Unauthorized access to file information
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: File, box, or organization not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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
        const decoded = jwt.verify(token, authConfig.auth.jwt.jwt_secret.value);
        userId = decoded.id;
        isServiceAccount = decoded.isServiceAccount || false;
      } catch (err) {
        log.app.warn("Invalid x-access-token:", err.message);
      }
    }
  }

  log.app.info('Auth context in info:', {
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
          authConfig.auth.jwt.jwt_secret.value,
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
        authConfig.auth.jwt.jwt_secret.value,
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

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}/file/delete:
 *   delete:
 *     summary: Delete a Vagrant box file
 *     description: Delete a Vagrant box file from both disk and database
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: path
 *         name: boxId
 *         required: true
 *         schema:
 *           type: string
 *         description: Box name
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *       - in: path
 *         name: providerName
 *         required: true
 *         schema:
 *           type: string
 *         description: Provider name
 *       - in: path
 *         name: architectureName
 *         required: true
 *         schema:
 *           type: string
 *         description: Architecture name
 *     responses:
 *       200:
 *         description: File deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "File and database record are deleted, or file was not found but cleanup attempted."
 *       404:
 *         description: Architecture not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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
        log.app.info(`Could not delete the file from disk: ${err}`);
      }
    });

    // Proceed to delete the database record regardless of file deletion success
    try {
      if (fileRecord) {
        await fileRecord.destroy();
        log.app.info("Database record deleted successfully.");
      } else {
        log.app.info("File record not found, but continuing with directory cleanup.");
      }

      // Attempt to delete the architecture directory
      fs.rm(basefilePath, { recursive: true, force: true }, (err) => {
        if (err) {
          log.app.info(`Could not delete the architecture directory: ${err}`);
        }
      });

      res.status(200).send({
        message: "File and database record are deleted, or file was not found but cleanup attempted."
      });
    } catch (dbErr) {
      log.app.info(`Could not delete the database record: ${dbErr}`);
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

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}/file/upload:
 *   put:
 *     summary: Update a Vagrant box file
 *     description: Update an existing Vagrant box file with a new version
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: path
 *         name: boxId
 *         required: true
 *         schema:
 *           type: string
 *         description: Box name
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *       - in: path
 *         name: providerName
 *         required: true
 *         schema:
 *           type: string
 *         description: Provider name
 *       - in: path
 *         name: architectureName
 *         required: true
 *         schema:
 *           type: string
 *         description: Architecture name
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Updated Vagrant box file
 *               checksum:
 *                 type: string
 *                 description: File checksum for verification
 *               checksumType:
 *                 type: string
 *                 description: Checksum algorithm
 *                 enum: [sha256, md5, sha1, NULL]
 *               newOrganization:
 *                 type: string
 *                 description: New organization name (optional)
 *               newBoxId:
 *                 type: string
 *                 description: New box name (optional)
 *               newVersionNumber:
 *                 type: string
 *                 description: New version number (optional)
 *               newProviderName:
 *                 type: string
 *                 description: New provider name (optional)
 *               newArchitectureName:
 *                 type: string
 *                 description: New architecture name (optional)
 *     responses:
 *       200:
 *         description: File updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Updated the file successfully"
 *                 fileName:
 *                   type: string
 *                   example: "vagrant.box"
 *                 fileSize:
 *                   type: integer
 *                   description: File size in bytes
 *                 path:
 *                   type: string
 *                   description: File path on server
 *       404:
 *         description: Architecture or file not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       408:
 *         description: Upload timeout
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "UPLOAD_TIMEOUT"
 *                 message:
 *                   type: string
 *                   example: "Upload timed out - Request took too long to complete"
 *                 details:
 *                   type: object
 *                   properties:
 *                     duration:
 *                       type: number
 *                     maxFileSize:
 *                       type: number
 *       413:
 *         description: File too large
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "FILE_TOO_LARGE"
 *                 message:
 *                   type: string
 *                   example: "File size cannot be larger than 10GB!"
 *                 details:
 *                   type: object
 *                   properties:
 *                     maxSize:
 *                       type: number
 *                     duration:
 *                       type: number
 *       507:
 *         description: Insufficient storage space
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "NO_STORAGE_SPACE"
 *                 message:
 *                   type: string
 *                   example: "Not enough storage space available"
 *                 details:
 *                   type: object
 *                   properties:
 *                     path:
 *                       type: string
 *                     duration:
 *                       type: number
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 error:
 *                   type: string
 *                 code:
 *                   type: string
 *                 details:
 *                   type: object
 *                   properties:
 *                     duration:
 *                       type: number
 */
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
      log.app.info('Headers already sent by middleware');
      return;
    }

    // Log successful file upload
    log.app.info('File updated successfully:', {
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
    log.app.info('File record updated:', {
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
    log.app.info(err);

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

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}/file/get-download-link:
 *   post:
 *     summary: Generate a secure download link
 *     description: Generate a time-limited secure download link for a Vagrant box file
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: path
 *         name: boxId
 *         required: true
 *         schema:
 *           type: string
 *         description: Box name
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *       - in: path
 *         name: providerName
 *         required: true
 *         schema:
 *           type: string
 *         description: Provider name
 *       - in: path
 *         name: architectureName
 *         required: true
 *         schema:
 *           type: string
 *         description: Architecture name
 *     responses:
 *       200:
 *         description: Download link generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 downloadUrl:
 *                   type: string
 *                   example: "https://api.example.com/organization/myorg/box/mybox/version/1.0.0/provider/virtualbox/architecture/amd64/file/download?token=..."
 *                   description: Secure download URL with embedded token (expires in 1 hour)
 *       403:
 *         description: Unauthorized access to file
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: File, box, or organization not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 error:
 *                   type: object
 */
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
        const decoded = jwt.verify(token, authConfig.auth.jwt.jwt_secret.value);
        userId = decoded.id;
        isServiceAccount = decoded.isServiceAccount || false;
      } catch (err) {
        log.app.warn("Invalid x-access-token:", err.message);
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
      authConfig.auth.jwt.jwt_secret.value,
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
