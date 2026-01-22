import { Router } from 'express';
import { authJwt } from '../middleware/index.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import {
  create,
  findAll,
  getAvailableOrganizations,
  delete as deleteServiceAccount,
} from '../controllers/service_account.controller.js';

const router = Router();

// Apply rate limiting to this router
router.use(rateLimiter);

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.post('/service-accounts', [authJwt.verifyToken, authJwt.isUser], create);
router.get('/service-accounts', [authJwt.verifyToken, authJwt.isUser], findAll);
router.get(
  '/service-accounts/organizations',
  [authJwt.verifyToken, authJwt.isUser],
  getAvailableOrganizations
);
router.delete('/service-accounts/:id', [authJwt.verifyToken, authJwt.isUser], deleteServiceAccount);

export default router;
