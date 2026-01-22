// upload.js
import { join } from 'path';
import fs from 'fs';
import multer from 'multer';
import { log } from '../../utils/Logger.js';
import { verifyAuthorizedToken } from './middleware.js';

// This is a self-contained multer setup for handling SSL uploads during setup.
// It avoids using the box-specific upload middleware.

const getSSLUploadPath = () => {
  const configDir = process.env.CONFIG_DIR || '/etc/boxvault';
  return join(configDir, 'ssl');
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    void req;
    void file;
    const sslUploadPath = getSSLUploadPath();
    if (!fs.existsSync(sslUploadPath)) {
      try {
        log.app.info(`Creating SSL upload directory at: ${sslUploadPath}`);
        fs.mkdirSync(sslUploadPath, { recursive: true, mode: 0o700 });
      } catch (err) {
        log.error.error('Failed to create SSL directory for setup', {
          error: err.message,
          path: sslUploadPath,
        });
        return cb(err);
      }
    }
    cb(null, sslUploadPath);
    return undefined;
  },
  filename: (req, file, cb) => {
    void req;
    // Use the original filename. Multer will handle sanitization.
    cb(null, file.originalname);
  },
});

const upload = multer({ storage });

export const uploadSSL = [
  verifyAuthorizedToken,
  upload.single('file'),
  (req, res) => {
    if (req.file) {
      const sslUploadPath = getSSLUploadPath();
      const filePath = join(sslUploadPath, req.file.filename);
      const response = {};
      if (filePath.endsWith('.crt')) {
        response.certPath = filePath;
      } else if (filePath.endsWith('.key')) {
        response.keyPath = filePath;
      }
      res.status(200).send(response);
    } else {
      res.status(400).send({ message: 'No file uploaded.' });
    }
  },
];
