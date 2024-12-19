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

// Configure multer storage
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
      
      // Log directory creation
      console.log('Created upload directory:', {
        path: uploadDir,
        mode: '0755'
      });
      
      cb(null, uploadDir);
    } catch (error) {
      console.error('Error in multer destination handler:', error);
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    // Always use vagrant.box as filename
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

  upload(req, res, (err) => {
    const duration = Date.now() - startTime;
    
    if (err instanceof multer.MulterError) {
      // Handle Multer-specific errors
      console.error('Multer error:', {
        code: err.code,
        message: err.message,
        field: err.field,
        duration: duration
      });

      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).send({
          error: 'FILE_TOO_LARGE',
          message: `File size cannot be larger than ${maxFileSize / (1024 * 1024 * 1024)}GB`,
          details: {
            maxSize: maxFileSize,
            duration: duration
          }
        });
      }

      return res.status(400).send({
        error: err.code,
        message: err.message,
        details: { duration }
      });
    } 
    else if (err) {
      // Handle other errors
      console.error('Upload error:', {
        message: err.message,
        code: err.code,
        stack: err.stack,
        duration: duration
      });

      return res.status(500).send({
        error: 'UPLOAD_ERROR',
        message: err.message,
        details: { duration }
      });
    }

    // Log successful upload
    if (req.file) {
      console.log('Upload completed:', {
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size,
        duration: duration
      });
    }

    next();
  });
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
