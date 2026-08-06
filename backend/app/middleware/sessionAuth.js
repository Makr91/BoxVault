import { log } from '../utils/Logger.js';
import db from '../models/index.js';
import { verifySessionToken } from '../utils/auth.js';

const { user: User } = db;

const sessionAuth = async (req, res, next) => {
  void res;
  const token = req.headers['x-access-token'];

  if (token) {
    try {
      const decoded = await verifySessionToken(token);

      // Suspended users proceed anonymously (public-only access)
      const user = await User.findByPk(decoded.id);
      if (user && !user.suspended) {
        req.userId = decoded.id;
        req.isServiceAccount = decoded.isServiceAccount || false;
      }
    } catch (err) {
      log.app.debug('Session auth check failed:', { error: err.message });
    }
  }
  next();
};

export { sessionAuth };
