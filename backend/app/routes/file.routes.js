const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { authJwt, sessionAuth, downloadAuth } = require('../middleware');
const { log } = require('../utils/Logger');
const file = require('../controllers/file.controller');

const router = express.Router();

// Explicit rate limiter for file operations (CodeQL requirement)
const fileOperationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  standardHeaders: true,
  legacyHeaders: false,
});

// Dedicated rate limiter for download-link generation
const getDownloadLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 download-link requests per window
  standardHeaders: true,
  legacyHeaders: false,
});

// Error handling middleware for file operations
const handleFileError = (err, req, res, next) => {
  void next;
  log.error.error('File operation error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    params: req.params,
  });

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'FILE_TOO_LARGE',
      message: `File size exceeds the limit`,
    });
  }

  if (err.code === 'ENOSPC') {
    return res.status(507).json({
      error: 'NO_STORAGE_SPACE',
      message: 'Not enough storage space available',
    });
  }

  if (err.message.includes('timeout')) {
    return res.status(408).json({
      error: 'UPLOAD_TIMEOUT',
      message: 'Upload timed out',
    });
  }

  return res.status(500).json({
    error: 'UPLOAD_FAILED',
    message: 'File operation failed',
  });
};

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.put(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/upload',
  fileOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  file.update,
  handleFileError
);

router.post(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/upload',
  fileOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  file.upload,
  handleFileError
);

router.get(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/info',
  fileOperationLimiter,
  sessionAuth,
  file.info
);

router.get(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/download',
  fileOperationLimiter,
  downloadAuth,
  sessionAuth,
  file.download
);

router.post(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/get-download-link',
  getDownloadLinkLimiter,
  sessionAuth,
  file.getDownloadLink
);

router.delete(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/delete',
  fileOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  file.remove
);

module.exports = router;
