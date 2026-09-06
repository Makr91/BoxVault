// version.routes.js
import { Router } from 'express';
import { authJwt, validateBody, verifyOrgAccess } from '../middleware/index.js';
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
    verifyOrgAccess.attachBox,
    validateBody('version'),
  ],
  create
);

router.put(
  '/organization/:organization/box/:boxId/version/:versionNumber',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.attachBox,
    validateBody('version', { partial: true }),
  ],
  update
);

router.get(
  '/organization/:organization/box/:boxId/version',
  [verifyOrgAccess.attachBox],
  findAllByBox
);

router.get(
  '/organization/:organization/box/:boxId/version/:versionNumber',
  [verifyOrgAccess.attachBox],
  findOne
);

router.delete(
  '/organization/:organization/box/:boxId/version/:versionNumber',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount, verifyOrgAccess.attachBox],
  deleteVersion
);

router.delete(
  '/organization/:organization/box/:boxId/version',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount, verifyOrgAccess.attachBox],
  deleteAllByBox
);

export default router;
