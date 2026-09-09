// middleware.js
import { problem } from '../../utils/problem.js';
import { getAuthorizedSetupToken } from './helpers.js';

const verifyAuthorizedToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Extract the token from the Bearer header

  if (!token || token !== getAuthorizedSetupToken()) {
    return problem(res, req, {
      status: 403,
      type: 'forbidden',
      title: req.__('setup.invalidToken'),
    });
  }
  return next();
};

export { verifyAuthorizedToken };
