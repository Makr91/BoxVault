const multer = require("multer");
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

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

// Configure multer storage with overwrite support
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
      
      // Load config for each request to ensure we have the latest
      const configContents = fs.readFileSync(appConfigPath, 'utf8');
      const config = yaml.load(configContents);
      const uploadDir = path.join(config.boxvault.box_storage_directory.value, organization, boxId, versionNumber, providerName, architectureName);
      
      // Create directory if it doesn't exist
      fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
      
      // Log directory creation/access
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
    try {
      const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
      const config = yaml.load(fs.readFileSync(appConfigPath, 'utf8'));
      const filePath = path.join(
        config.boxvault.box_storage_directory.value,
        organization,
        boxId,
        versionNumber,
        providerName,
        architectureName,
        'vagrant.box'
      );

      // If file exists, delete it first to ensure clean overwrite
      if (fs.existsSync(filePath)) {
        console.log('Existing file found, will overwrite:', filePath);
        fs.unlinkSync(filePath);
      }

      // Always use vagrant.box as filename
      cb(null, 'vagrant.box');
    } catch (error) {
      console.error('Error in multer filename handler:', error);
      cb(error);
    }
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
      // Log upload start
      console.log('Starting file upload:', {
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        maxSize: maxFileSize,
        params: req.params
      });
      cb(null, true);
    } catch (error) {
      console.error('Error in multer fileFilter:', error);
      cb(error);
    }
  }
}).single('file'); // Use single file upload with field name 'file'

// Main upload middleware
const uploadMiddleware = (req, res, next) => {
  const startTime = Date.now();
  
  // Log upload request
  console.log('Upload request received:', {
    params: req.params,
    contentLength: req.headers['content-length'],
    contentType: req.headers['content-type']
  });

  try {
    upload(req, res, async (err) => {
      const duration = Date.now() - startTime;
      
      if (err) {
        // Log error details
        console.error('Upload error:', {
          type: err instanceof multer.MulterError ? 'MulterError' : 'GeneralError',
          message: err.message,
          code: err.code,
          field: err.field,
          stack: err.stack,
          duration: duration
        });

        // Don't try to send response if headers are already sent
        if (!res.headersSent) {
          if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({
              error: 'FILE_TOO_LARGE',
              message: `File size cannot be larger than ${maxFileSize / (1024 * 1024 * 1024)}GB`,
              details: {
                maxSize: maxFileSize,
                duration: duration
              }
            });
          } else {
            res.status(500).json({
              error: err instanceof multer.MulterError ? err.code : 'UPLOAD_ERROR',
              message: err.message,
              details: { duration }
            });
          }
        }
        return;
      }

      // Check if file was uploaded
      if (!req.file) {
        if (!res.headersSent) {
          res.status(400).json({
            error: 'NO_FILE',
            message: 'No file was uploaded'
          });
        }
        return;
      }

      // Log successful upload
      console.log('Upload completed:', {
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size,
        duration: duration
      });

      // Continue only if headers haven't been sent
      if (!res.headersSent) {
        next();
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
      } else {
        resolve();
      }
    });
  });
};

module.exports = {
  uploadFile: uploadMiddleware,
  uploadSSLFile: uploadSSLMiddleware
};
