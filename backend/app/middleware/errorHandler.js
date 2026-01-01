const { existsSync } = require('fs');
const path = require('path');
const { log } = require('../utils/Logger');

const errorHandler = (err, req, res, next) => {
  // Log the error with full details
  log.error.error('Express error handler', {
    error: err.message,
    stack: err.stack,
  });

  // Log request details for debugging
  if (req) {
    log.app.error('Request error details', {
      method: req.method,
      url: req.url,
      path: req.path,
      ip: req.ip || req.connection?.remoteAddress,
      user: req.entity?.name || req.user?.username,
      error: err.message,
    });
  }

  // Check if response already sent
  if (res.headersSent) {
    return next(err);
  }

  // Serve React app with error state instead of plain text
  const staticPath = path.join(__dirname, '..', 'views', 'index.html');
  if (existsSync(staticPath)) {
    res.status(500);
    return res.sendFile(staticPath);
  }

  // Fallback to plain message if React app not available
  return res.status(500).send('Internal server error');
};

module.exports = { errorHandler };
