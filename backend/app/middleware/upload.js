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

const uploadFile = multer({
  storage: storage,
  limits: { fileSize: 10000 * 1024 * 1024 }, // 10GB limit
}).fields([
  { name: 'file', maxCount: 1 },
  { name: 'checksum', maxCount: 1 },
  { name: 'checksumType', maxCount: 1 }
]);

const uploadFileMiddleware = util.promisify(uploadFile);
const uploadSSLFileMiddleware = util.promisify(uploadSSLFile);
module.exports = { uploadFileMiddleware, uploadSSLFileMiddleware };