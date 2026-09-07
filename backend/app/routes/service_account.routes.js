import { Router } from 'express';
import { authJwt, validateBody } from '../middleware/index.js';
import { create } from '../controllers/service_account/create.js';
import { findAll } from '../controllers/service_account/findall.js';
import { getAvailableOrganizations } from '../controllers/service_account/organizations.js';
import { delete as deleteServiceAccount } from '../controllers/service_account/delete.js';

const router = Router();

// Apply rate limiting to this router

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.post(
  '/service-accounts',
  [authJwt.verifyToken, authJwt.isUser, validateBody('serviceAccount')],
  create
);
router.get('/service-accounts', [authJwt.verifyToken, authJwt.isUser], findAll);
router.get(
  '/service-accounts/organizations',
  [authJwt.verifyToken, authJwt.isUser],
  getAvailableOrganizations
);
router.delete('/service-accounts/:id', [authJwt.verifyToken, authJwt.isUser], deleteServiceAccount);

export default router;
