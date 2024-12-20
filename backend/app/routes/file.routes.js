const { authJwt } = require("../middleware");
const file = require("../controllers/file.controller");

// Error handling middleware for file operations
const handleFileError = (err, req, res, next) => {
  console.error('File operation error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    params: req.params
  });

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'FILE_TOO_LARGE',
      message: `File size exceeds the limit`
    });
  }

  if (err.code === 'ENOSPC') {
    return res.status(507).json({
      error: 'NO_STORAGE_SPACE',
      message: 'Not enough storage space available'
    });
  }

  if (err.message.includes('timeout')) {
    return res.status(408).json({
      error: 'UPLOAD_TIMEOUT',
      message: 'Upload timed out'
    });
  }

  res.status(500).json({
    error: 'UPLOAD_FAILED',
    message: 'File operation failed'
  });
};

module.exports = function(app) {
  app.use(function(req, res, next) {
    res.header(
      "Access-Control-Allow-Headers",
      "x-access-token, Origin, Content-Type, Accept"
    );
    next();
  });

  app.put("/api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/upload", 
    [authJwt.verifyToken, authJwt.isUserOrServiceAccount], 
    file.update,
    handleFileError
  );
  
  app.post("/api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/upload", 
    [authJwt.verifyToken, authJwt.isUserOrServiceAccount], 
    file.upload,
    handleFileError
  );
  app.get("/api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/info", file.info);
  app.get("/api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/download", file.download);
  app.post("/api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/get-download-link", [authJwt.verifyToken], file.getDownloadLink);
  app.delete("/api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/delete", [authJwt.verifyToken, authJwt.isUserOrServiceAccount], file.remove);
};
