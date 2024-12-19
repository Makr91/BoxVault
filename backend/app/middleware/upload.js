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

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const uploadFile = multer({
  storage: storage,
  limits: {
    fileSize: maxFileSize
  }
}).single("file");

const uploadFileMiddleware = (req, res, next) => {
  uploadFile(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).send({
          message: `File size cannot be larger than ${maxFileSize / (1024 * 1024 * 1024)}GB!`
        });
      }
      return res.status(500).send({
        message: `Could not upload the file: ${err}`
      });
    } else if (err) {
      return res.status(500).send({
        message: `Could not upload the file: ${err}`
      });
    }
    next();
  });
};

const uploadSSLFileMiddleware = (req, res) => {
  return new Promise((resolve, reject) => {
    uploadFile(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        reject(err);
      } else if (err) {
        reject(err);
      }
      resolve();
    });
  });
};

module.exports = {
  uploadFile: uploadFileMiddleware,
  uploadSSLFile: uploadSSLFileMiddleware
};
