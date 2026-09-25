// version.routes.js
import { Router } from 'express';
import { authJwt, validateBody, verifyOrgAccess } from '../middleware/index.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { create } from '../controllers/version/create.js';
import { update } from '../controllers/version/update.js';
import { findAllByBox } from '../controllers/version/box/findall.js';
import { findOne } from '../controllers/version/findone.js';
import { delete as deleteVersion } from '../controllers/version/delete.js';
import { deleteAllByBox } from '../controllers/version/box/deleteall.js';
import { bulk as bulkVersions } from '../controllers/version/bulk.js';

const router = Router();

// Apply rate limiting to this router

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.post(
  '/organization/:organization/box/:boxId/version',
  apiLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  verifyOrgAccess.attachBox,
  validateBody('version'),
  create
);

router.put(
  '/organization/:organization/box/:boxId/version/:versionNumber',
  apiLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  verifyOrgAccess.attachBox,
  validateBody('version', { partial: true }),
  update
);

router.get(
  '/organization/:organization/box/:boxId/version',
  apiLimiter,
  verifyOrgAccess.attachBox,
  findAllByBox
);

router.get(
  '/organization/:organization/box/:boxId/version/:versionNumber',
  apiLimiter,
  verifyOrgAccess.attachBox,
  findOne
);

router.delete(
  '/organization/:organization/box/:boxId/version/:versionNumber',
  apiLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  verifyOrgAccess.attachBox,
  deleteVersion
);

router.post(
  '/organization/:organization/box/:boxId/version/bulk',
  apiLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  verifyOrgAccess.attachBox,
  validateBody('bulkVersion'),
  bulkVersions
);

router.delete(
  '/organization/:organization/box/:boxId/version',
  apiLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  verifyOrgAccess.attachBox,
  deleteAllByBox
);

export default router;
