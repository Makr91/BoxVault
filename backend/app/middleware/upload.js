const multer = require("multer");
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const db = require("../models");

// Load app config for max file size
const appConfigPath = path.join(__dirname, '../config/app.config.yaml');
let maxFileSize;
let appConfig;

try {
  const fileContents = fs.readFileSync(appConfigPath, 'utf8');
  appConfig = yaml.load(fileContents);
  maxFileSize = appConfig.boxvault.box_max_file_size.value * 1024 * 1024 * 1024; // Convert GB to bytes
} catch (e) {
  console.error(`Failed to load app configuration: ${e.message}`);
  maxFileSize = 10 * 1024 * 1024 * 1024; // Default to 10GB
}

// Configure multer storage for direct streaming to final destination
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
      
      // Load config for each request to ensure we have the latest
      const configContents = fs.readFileSync(appConfigPath, 'utf8');
      const config = yaml.load(configContents);
      const uploadDir = path.join(config.boxvault.box_storage_directory.value, organization, boxId, versionNumber, providerName, architectureName);
      
      // Create upload directory
      fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
      
      // Log directory creation
      console.log('Using upload directory:', {
        path: uploadDir,
        mode: '0755',
        exists: fs.existsSync(uploadDir)
      });
      
      cb(null, uploadDir);
    } catch (error) {
      console.error('Error in multer destination handler:', error);
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    cb(null, 'vagrant.box');
  }
});

// Configure multer upload
const upload = multer({
  storage: storage,
  limits: {
    fileSize: maxFileSize
  },
  fileFilter: (req, file, cb) => {
    try {
      const contentLength = parseInt(req.headers['content-length']);
      
      if (isNaN(contentLength)) {
        console.error('Missing or invalid Content-Length header');
        return cb(new Error('Content-Length header required'));
      }

      if (contentLength > maxFileSize) {
        console.error('File too large:', {
          size: contentLength,
          maxSize: maxFileSize
        });
        return cb(new Error(`File size cannot exceed ${maxFileSize / (1024 * 1024 * 1024)}GB`));
      }

      // Store expected file size for later verification
      req.expectedSize = contentLength;

      // Log upload start
      console.log('Starting file upload:', {
        fileName: req.headers['x-file-name'] || file.originalname,
        fileSize: contentLength,
        checksum: req.headers['x-checksum'] || 'none',
        checksumType: req.headers['x-checksum-type'] || 'NULL'
      });

      cb(null, true);
    } catch (error) {
      console.error('Error in multer fileFilter:', error);
      cb(error);
    }
  }
}).single('file');

// Main upload middleware
const uploadMiddleware = (req, res) => {
  const startTime = Date.now();
  
  try {
    upload(req, res, async (err) => {
      if (err) {
        console.error('Upload error:', {
          type: err instanceof multer.MulterError ? 'MulterError' : 'GeneralError',
          message: err.message,
          code: err.code
        });

        if (!res.headersSent) {
          if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({
              error: 'FILE_TOO_LARGE',
              message: `File size cannot exceed ${maxFileSize / (1024 * 1024 * 1024)}GB`,
              details: { maxFileSize }
            });
          } else {
            res.status(500).json({
              error: 'UPLOAD_ERROR',
              message: err.message
            });
          }
        }
        return;
      }

      if (!req.file) {
        if (!res.headersSent) {
          res.status(400).json({
            error: 'NO_FILE',
            message: 'No file was uploaded'
          });
        }
        return;
      }

      try {
        const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
        const finalSize = fs.statSync(req.file.path).size;

        // Verify file size matches expected size
        if (Math.abs(finalSize - req.expectedSize) > 1024) { // Allow 1KB difference
          throw new Error('File size mismatch');
        }

        // Find the version
        const version = await db.versions.findOne({
          where: { versionNumber },
          include: [{
            model: db.box,
            as: 'box',
            where: { name: boxId }
          }]
        });

        if (!version) {
          throw new Error(`Version ${versionNumber} not found for box ${boxId}`);
        }

        // Find the provider
        const provider = await db.providers.findOne({
          where: { 
            name: providerName,
            versionId: version.id
          }
        });

        if (!provider) {
          throw new Error(`Provider ${providerName} not found`);
        }

        // Find the architecture
        const architecture = await db.architectures.findOne({
          where: { 
            name: architectureName,
            providerId: provider.id
          }
        });

        if (!architecture) {
          throw new Error(`Architecture not found for provider ${providerName}`);
        }

        // Create or update file record
        const fileRecord = await db.files.findOne({
          where: {
            fileName: 'vagrant.box',
            architectureId: architecture.id
          }
        });

        const fileData = {
          fileName: 'vagrant.box',
          checksum: req.headers['x-checksum'] || null,
          checksumType: (req.headers['x-checksum-type'] || 'NULL').toUpperCase(),
          architectureId: architecture.id,
          fileSize: finalSize
        };

        if (fileRecord) {
          await fileRecord.update(fileData);
          console.log('File record updated:', fileData);
        } else {
          await db.files.create(fileData);
          console.log('File record created:', fileData);
        }

        const duration = Date.now() - startTime;
        const speed = Math.round(finalSize / duration * 1000 / (1024 * 1024));

        console.log('Upload completed:', {
          finalSize,
          duration: `${Math.round(duration / 1000)}s`,
          speed: `${speed} MB/s`
        });

        res.status(200).json({
          message: 'File upload completed',
          details: {
            isComplete: true,
            status: 'complete',
            fileSize: finalSize
          }
        });
      } catch (error) {
        console.error('Error during database update:', error);
        if (!res.headersSent) {
          res.status(500).json({
            error: 'DATABASE_ERROR',
            message: error.message
          });
        }
      }
    });
  } catch (error) {
    console.error('Unexpected error in upload middleware:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred during upload'
      });
    }
  }
};

// SSL file upload middleware (Promise-based)
const uploadSSLMiddleware = (req, res) => {
  return new Promise((resolve, reject) => {
    upload(req, res, (err) => {
      if (err) {
        console.error('SSL upload error:', {
          message: err.message,
          code: err.code,
          stack: err.stack
        });
        reject(err);
        return;
      }

      if (!req.file) {
        const error = new Error('No file uploaded');
        console.error('SSL upload error:', {
          message: error.message,
          headers: req.headers,
          body: req.body
        });
        reject(error);
        return;
      }

      if (req.file.size === 0) {
        const error = new Error('Empty file uploaded');
        console.error('SSL upload error:', {
          message: error.message,
          file: req.file
        });
        fs.unlink(req.file.path, (unlinkErr) => {
          if (unlinkErr) console.error('Error deleting empty file:', unlinkErr);
        });
        reject(error);
        return;
      }

      console.log('SSL upload completed:', {
        filename: req.file.filename,
        originalname: req.file.originalname,
        path: req.file.path,
        size: req.file.size,
        mimetype: req.file.mimetype
      });

      resolve(req.file);
    });
  });
};

module.exports = {
  uploadFile: uploadMiddleware,
  uploadSSLFile: uploadSSLMiddleware
};
