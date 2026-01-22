import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { log } from '../utils/Logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const errorHandler = (err, req, res, next) => {
  // Log the error with full details
  log.error.error('Express error handler', {
    error: err.message,
    stack: err.stack,
    path: req?.path,
    method: req?.method,
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

  // Return JSON for API routes
  if (req?.path?.startsWith('/api/')) {
    log.app.debug('Returning JSON error for API route', {
      path: req.path,
      error: err.message,
    });
    return res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    });
  }

  // Serve React app with error state for non-API routes
  const staticPath = join(__dirname, '..', 'views', 'index.html');
  if (existsSync(staticPath)) {
    res.status(500);
    return res.sendFile(staticPath);
  }

  // Fallback to plain message if React app not available
  return res.status(500).send('Internal server error');
};

export { errorHandler };
