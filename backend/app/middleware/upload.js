const util = require("util");
const multer = require("multer");
const path = require("path");
const fs = require('fs');
const yaml = require('js-yaml');

const appConfigPath = path.join(__dirname, '../config/app.config.yaml');
let appConfig;
try {
  const fileContents = fs.readFileSync(appConfigPath, 'utf8');
  appConfig = yaml.load(fileContents);
} catch (e) {
  console.error(`Failed to load App configuration: ${e.message}`);
}

const sslStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sslDirPath = path.join(__dirname, '../config/ssl');
    fs.mkdirSync(sslDirPath, { recursive: true });
    cb(null, sslDirPath);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

const uploadSSLFile = multer({
  storage: sslStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit for SSL files
}).single('sslFile');



const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
    const dirPath = path.join(appConfig.boxvault.box_storage_directory.value, organization, boxId, versionNumber, providerName, architectureName);

    // Create the directory if it doesn't exist
    fs.mkdirSync(dirPath, { recursive: true });

    cb(null, dirPath);
  },
  filename: (req, file, cb) => {
    const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
    const fileName = `vagrant.box`;
    cb(null, fileName);
  },
});

// Configure multer with timeout and better error handling
// Calculate max file size from config (converting GB to bytes)
const maxFileSize = appConfig.boxvault.box_max_file_size.value * 1024 * 1024 * 1024;

const uploadFile = multer({
  storage: storage,
  limits: { 
    fileSize: maxFileSize, // Use configured limit from app.config.yaml
    fieldSize: maxFileSize // Match field size to file size limit
  }
}).fields([
  { name: 'file', maxCount: 1 },
  { name: 'checksum', maxCount: 1 },
  { name: 'checksumType', maxCount: 1 }
]);

// Wrap multer middleware with timeout and error handling
const uploadFileMiddleware = async (req, res) => {
  return new Promise((resolve, reject) => {
    const uploadTimeout = setTimeout(() => {
      reject(new Error('Upload timeout - Request took longer than 30 minutes'));
    }, 30 * 60 * 1000); // 30 minutes timeout

    uploadFile(req, res, (err) => {
      clearTimeout(uploadTimeout);
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          reject(new Error(`File size cannot be larger than ${appConfig.boxvault.box_max_file_size.value}GB`));
        } else {
          reject(err);
        }
      }
      resolve();
    });
  });
};
const uploadSSLFileMiddleware = util.promisify(uploadSSLFile);
module.exports = { uploadFileMiddleware, uploadSSLFileMiddleware };
