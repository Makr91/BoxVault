// architecture.routes.js
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authJwt, verifyArchitecture, sessionAuth } from '../middleware/index.js';
import {
  findAllByProvider,
  findOne,
  create,
  update,
  delete as deleteArchitecture,
  deleteAllByProvider,
} from '../controllers/architecture.controller.js';

const router = Router();

// Explicit rate limiter for architecture operations (CodeQL requirement)
const architectureOperationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all routes in this router

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
  verifyArchitecture.validateArchitecture,
  verifyArchitecture.checkArchitectureDuplicate,
  create
);

router.put(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName',
  architectureOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  verifyArchitecture.validateArchitecture,
  update
);

router.delete(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName',
  architectureOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  deleteArchitecture
);

router.delete(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture',
  architectureOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  deleteAllByProvider
);

export default router;
