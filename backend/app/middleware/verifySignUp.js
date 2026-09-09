import db from '../models/index.js';
import { problem } from '../utils/problem.js';
const { ROLES, user: User } = db;

const checkRolesExisted = async (req, res, next) => {
  try {
    const userCount = await User.count();

    if (userCount === 0) {
      req.body.roles = ['admin'];
      return next();
    }

    const unknownRole = (req.body.roles || []).find(role => !ROLES.includes(role));
    if (unknownRole !== undefined) {
      return problem(res, req, {
        status: 400,
        type: 'bad-request',
        title: req.__('auth.roleDoesNotExist', { role: unknownRole }),
      });
    }

    return next();
  } catch (err) {
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: err.message || req.__('errors.operationFailed'),
    });
  }
};

const verifySignUp = {
  checkRolesExisted,
};

export default verifySignUp;
