import { log } from '../utils/Logger.js';
import db from '../models/index.js';
import { resolveRequestAuth } from '../utils/requestAuth.js';

const { user: User } = db;

const sessionAuth = async (req, res, next) => {
  void res;
  if (req.userId) {
    return next();
  }

  try {
    const auth = await resolveRequestAuth(req);
    if (auth) {
      const user = await User.findByPk(auth.userId);
      if (user && !user.suspended) {
        req.userId = auth.userId;
        req.isServiceAccount = auth.isServiceAccount;
        if (auth.serviceAccountId) {
          req.serviceAccountId = auth.serviceAccountId;
        }
        if (auth.provider) {
          req.authProvider = auth.provider;
        }
        if (auth.oidcAccessToken) {
          req.oidcAccessToken = auth.oidcAccessToken;
        }
      }
    }
  } catch (err) {
    log.app.debug('Session auth check failed:', { error: err.message });
  }
  return next();
};

export { sessionAuth };
