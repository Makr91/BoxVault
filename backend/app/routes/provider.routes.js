// provider.routes.js
import { Router } from 'express';
import { authJwt, verifyProvider, sessionAuth } from '../middleware/index.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import {
  create,
  findAllByVersion,
  findOne,
  update,
  delete as deleteProvider,
  deleteAllByVersion,
} from '../controllers/provider.controller.js';

const router = Router();

// Apply rate limiting to this router
router.use(rateLimiter);

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.post(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyProvider.validateProvider,
    verifyProvider.checkProviderDuplicate,
  ],
  create
);

router.get(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider',
  sessionAuth,
  findAllByVersion
);

router.get(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName',
  sessionAuth,
  findOne
);

router.put(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount, verifyProvider.validateProvider],
  update
);

router.delete(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount],
  deleteProvider
);

router.delete(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount],
  deleteAllByVersion
);

export default router;
