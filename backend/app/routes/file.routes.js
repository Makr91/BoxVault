const express = require('express');
const { authJwt } = require('../middleware');
const { rateLimiter } = require('../middleware/rateLimiter');
const { log } = require('../utils/Logger');
const file = require('../controllers/file.controller');

const router = express.Router();

// Apply rate limiting to this router
router.use(rateLimiter);

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
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  file.update,
  handleFileError
);

router.post(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/upload',
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  file.upload,
  handleFileError
);

router.get(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/info',
  file.info
);

router.get(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/download',
  file.download
);

router.post(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/get-download-link',
  file.getDownloadLink
);

router.delete(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/delete',
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  file.remove
);

module.exports = router;
