// provider.routes.js
import { Router } from 'express';
import { authJwt, validateBody, verifyOrgAccess, sessionAuth } from '../middleware/index.js';
import { create } from '../controllers/provider/create.js';
import { findAllByVersion } from '../controllers/provider/findallbyversion.js';
import { findOne } from '../controllers/provider/findone.js';
import { update } from '../controllers/provider/update.js';
import { delete as deleteProvider } from '../controllers/provider/delete.js';
import { deleteAllByVersion } from '../controllers/provider/deleteallbyversion.js';

const router = Router();

// Apply rate limiting to this router

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
    verifyOrgAccess.attachBox,
    verifyOrgAccess.attachProvider,
    validateBody('provider'),
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
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.attachBox,
    verifyOrgAccess.attachProvider,
    validateBody('provider', { partial: true }),
  ],
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
