const multer = require("multer");
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Load app config for max file size
const appConfigPath = path.join(__dirname, '../config/app.config.yaml');
let maxFileSize;
try {
  const fileContents = fs.readFileSync(appConfigPath, 'utf8');
  const appConfig = yaml.load(fileContents);
  maxFileSize = appConfig.boxvault.box_max_file_size.value * 1024 * 1024 * 1024; // Convert GB to bytes
} catch (e) {
  console.error(`Failed to load app configuration: ${e.message}`);
  maxFileSize = 10 * 1024 * 1024 * 1024; // Default to 10GB
}

// Ensure upload directory exists with proper permissions
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create a unique subdirectory for each upload
    const uploadSubDir = path.join(uploadDir, Date.now().toString());
    fs.mkdirSync(uploadSubDir, { recursive: true, mode: 0o755 });
    cb(null, uploadSubDir);
  },
  filename: (req, file, cb) => {
    // Keep original filename but make it safe
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, safeName);
  }
});

// Configure multer upload
const uploadFile = multer({
  storage: storage,
  limits: {
    fileSize: maxFileSize,
    files: 1,
    parts: 2 // file and optional metadata
  },
  fileFilter: (req, file, cb) => {
    // Accept all files but log the type
    console.log('Uploading file:', {
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size
    });
    cb(null, true);
  }
}).single("file");

// Main upload middleware
const uploadFileMiddleware = (req, res, next) => {
  const uploadStartTime = Date.now();

  uploadFile(req, res, (err) => {
    const uploadDuration = (Date.now() - uploadStartTime) / 1000;
    console.log(`Upload took ${uploadDuration} seconds`);

    if (err instanceof multer.MulterError) {
      // Handle Multer-specific errors
      console.error('Multer error during upload:', {
        code: err.code,
        field: err.field,
        message: err.message,
        duration: uploadDuration
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
        duration: uploadDuration
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

    // Log successful upload
    if (req.file) {
      console.log('Upload completed successfully:', {
        filename: req.file.filename,
        size: req.file.size,
        duration: uploadDuration,
        path: req.file.path
      });
    }

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

// Clean up temporary files periodically
setInterval(() => {
  fs.readdir(uploadDir, { withFileTypes: true }, (err, files) => {
    if (err) {
      console.error('Error reading upload directory:', err);
      return;
    }

    const now = Date.now();
    files.forEach(file => {
      if (file.isDirectory()) {
        const dirPath = path.join(uploadDir, file.name);
        fs.stat(dirPath, (err, stats) => {
          if (err) {
            console.error('Error checking directory stats:', err);
            return;
          }

          // Remove directories older than 24 hours
          if (now - stats.mtime.getTime() > 24 * 60 * 60 * 1000) {
            fs.rm(dirPath, { recursive: true, force: true }, err => {
              if (err) {
                console.error('Error removing old upload directory:', err);
              }
            });
          }
        });
      }
    });
  });
}, 60 * 60 * 1000); // Check every hour

module.exports = {
  uploadFile: uploadFileMiddleware,
  uploadSSLFile: uploadSSLFileMiddleware
};
