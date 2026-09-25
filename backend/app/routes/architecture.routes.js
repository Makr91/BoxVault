// architecture.routes.js
import { Router } from 'express';
import { authJwt, validateBody, verifyOrgAccess, sessionAuth } from '../middleware/index.js';
import { apiLimiter, architectureOperationLimiter } from '../middleware/rateLimiter.js';
import { findAllByProvider } from '../controllers/architecture/provider/findall.js';
import { findOne } from '../controllers/architecture/findone.js';
import { create } from '../controllers/architecture/create.js';
import { update } from '../controllers/architecture/update.js';
import { delete as deleteArchitecture } from '../controllers/architecture/delete.js';
import { deleteAllByProvider } from '../controllers/architecture/provider/deleteall.js';
import { bulk as bulkArchitectures } from '../controllers/architecture/bulk.js';

const router = Router();

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.get(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture',
  architectureOperationLimiter,
  sessionAuth,
  findAllByProvider
);

router.get(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName',
  architectureOperationLimiter,
  sessionAuth,
  findOne
);

router.post(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture',
  architectureOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  verifyOrgAccess.attachBox,
  verifyOrgAccess.attachProvider,
  validateBody('architecture'),
  create
);

router.put(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName',
  apiLimiter,
  architectureOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  verifyOrgAccess.attachBox,
  verifyOrgAccess.attachProvider,
  validateBody('architecture', { partial: true }),
  update
);

router.delete(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName',
  apiLimiter,
  architectureOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  deleteArchitecture
);

router.post(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/bulk',
  apiLimiter,
  architectureOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  verifyOrgAccess.attachBox,
  verifyOrgAccess.attachProvider,
  validateBody('bulkLeaf'),
  bulkArchitectures
);

router.delete(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture',
  architectureOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  deleteAllByProvider
);

export default router;
