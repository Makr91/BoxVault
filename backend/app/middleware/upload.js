const multer = require("multer");
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { pipeline } = require('stream/promises');

// Load app config for max file size
const appConfigPath = path.join(__dirname, '../config/app.config.yaml');
let appConfig;
try {
  const fileContents = fs.readFileSync(appConfigPath, 'utf8');
  appConfig = yaml.load(fileContents);
  maxFileSize = appConfig.boxvault.box_max_file_size.value * 1024 * 1024 * 1024; // Convert GB to bytes
} catch (e) {
  console.error(`Failed to load app configuration: ${e.message}`);
  maxFileSize = 10 * 1024 * 1024 * 1024; // Default to 10GB
}

// Configure multer storage to write directly to final location
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Get the final path from the request parameters
    const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
    const finalDir = path.join(
      appConfig.boxvault.box_storage_directory.value,
      organization,
      boxId,
      versionNumber,
      providerName,
      architectureName
    );

    // Create directory if it doesn't exist
    fs.mkdir(finalDir, { recursive: true, mode: 0o755 }, (err) => {
      if (err) {
        console.error('Error creating directory:', {
          path: finalDir,
          error: err.message
        });
        return cb(err);
      }
      cb(null, finalDir);
    });
  },
  filename: (req, file, cb) => {
    // Always use vagrant.box as the filename
    cb(null, 'vagrant.box');
  }
});

// Configure multer upload with detailed error handling
const uploadFile = multer({
  storage: storage,
  limits: {
    fileSize: maxFileSize,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Log upload start
    console.log('Starting file upload:', {
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      params: req.params
    });

    // Accept the file
    cb(null, true);
  }
}).single("file");

// Main upload middleware with enhanced error handling
const uploadFileMiddleware = (req, res, next) => {
  const uploadStartTime = Date.now();
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;

  // Log upload attempt
  console.log('Upload attempt:', {
    startTime: new Date(uploadStartTime).toISOString(),
    params: { organization, boxId, versionNumber, providerName, architectureName }
  });

  uploadFile(req, res, async (err) => {
    const uploadDuration = (Date.now() - uploadStartTime) / 1000;

    if (err instanceof multer.MulterError) {
      // Handle Multer-specific errors
      console.error('Multer error during upload:', {
        code: err.code,
        field: err.field,
        message: err.message,
        duration: uploadDuration,
        params: req.params
      });

      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).send({
          error: 'FILE_TOO_LARGE',
          message: `File size cannot be larger than ${maxFileSize / (1024 * 1024 * 1024)}GB!`,
          details: {
            maxSize: maxFileSize,
            duration: uploadDuration
          }
        });
      }

      return res.status(500).send({
        error: err.code,
        message: `Upload failed: ${err.message}`,
        details: {
          duration: uploadDuration
        }
      });
    } else if (err) {
      // Handle other errors
      console.error('Error during upload:', {
        error: err.message,
        stack: err.stack,
        duration: uploadDuration,
        params: req.params
      });

      // Check for specific error types
      if (err.code === 'ENOSPC') {
        return res.status(507).send({
          error: 'NO_STORAGE_SPACE',
          message: 'Not enough storage space available',
          details: {
            duration: uploadDuration
          }
        });
      }

      if (err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
        return res.status(408).send({
          error: 'UPLOAD_TIMEOUT',
          message: 'Upload timed out',
          details: {
            duration: uploadDuration
          }
        });
      }

      return res.status(500).send({
        error: 'UPLOAD_FAILED',
        message: `Could not upload the file: ${err.message}`,
        details: {
          duration: uploadDuration
        }
      });
    }

    // Verify the uploaded file
    if (!req.file) {
      console.error('No file in request after successful upload');
      return res.status(400).send({
        error: 'NO_FILE',
        message: 'No file was uploaded'
      });
    }

    // Log successful upload
    console.log('Upload completed successfully:', {
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size,
      duration: uploadDuration
    });

    next();
  });
};

// SSL file upload middleware (Promise-based)
const uploadSSLFileMiddleware = (req, res) => {
  return new Promise((resolve, reject) => {
    uploadFile(req, res, (err) => {
      if (err) {
        console.error('SSL file upload error:', {
          error: err.message,
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
  uploadFile: uploadFileMiddleware,
  uploadSSLFile: uploadSSLFileMiddleware
};
