const util = require("util");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
    const dirPath = path.join(__basedir, "resources/static/assets/uploads", organization, boxId, versionNumber, providerName, architectureName);

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
module.exports = uploadFileMiddleware;