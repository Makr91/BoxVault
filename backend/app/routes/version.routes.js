// version.routes.js
import { Router } from 'express';
import { authJwt, verifyVersion } from '../middleware/index.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import {
  create,
  update,
  findAllByBox,
  findOne,
  delete as deleteVersion,
  deleteAllByBox,
} from '../controllers/version.controller.js';

const router = Router();

// Apply rate limiting to this router
router.use(rateLimiter);

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.post(
  '/organization/:organization/box/:boxId/version',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyVersion.validateVersion,
    verifyVersion.attachEntities,
    verifyVersion.checkVersionDuplicate,
  ],
  create
);

router.put(
  '/organization/:organization/box/:boxId/version/:versionNumber',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyVersion.validateVersion,
    verifyVersion.attachEntities,
    verifyVersion.checkVersionDuplicate,
  ],
  update
);

router.get(
  '/organization/:organization/box/:boxId/version',
  [verifyVersion.attachEntities],
  findAllByBox
);

router.get(
  '/organization/:organization/box/:boxId/version/:versionNumber',
  [verifyVersion.attachEntities],
  findOne
);

router.delete(
  '/organization/:organization/box/:boxId/version/:versionNumber',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount, verifyVersion.attachEntities],
  deleteVersion
);

router.delete(
  '/organization/:organization/box/:boxId/version',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount, verifyVersion.attachEntities],
  deleteAllByBox
);

export default router;
