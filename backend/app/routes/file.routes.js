import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authJwt, sessionAuth, downloadAuth, verifyBoxFilePath } from '../middleware/index.js';
import {
  update,
  upload,
  info,
  download,
  getDownloadLink,
  remove,
} from '../controllers/file.controller.js';

const router = Router();

// Explicit rate limiter for file operations (CodeQL requirement)
const fileOperationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
});

// Dedicated rate limiter for download-link generation
const getDownloadLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 download-link requests per window
  standardHeaders: true,
  legacyHeaders: false,
});

// Dedicated rate limiter for file downloads
const downloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // align with general file operation limits
  standardHeaders: true,
  legacyHeaders: false,
});

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.put(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/upload',
  fileOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  verifyBoxFilePath,
  update
);

router.post(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/upload',
  fileOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  verifyBoxFilePath,
  upload
);

router.get(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/info',
  fileOperationLimiter,
  verifyBoxFilePath,
  sessionAuth,
  info
);

router.get(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/download',
  downloadLimiter,
  fileOperationLimiter,
  verifyBoxFilePath,
  downloadAuth,
  sessionAuth,
  download
);

router.post(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/get-download-link',
  getDownloadLinkLimiter,
  fileOperationLimiter,
  verifyBoxFilePath,
  sessionAuth,
  getDownloadLink
);

router.delete(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/delete',
  fileOperationLimiter,
  authJwt.verifyToken,
  verifyBoxFilePath,
  authJwt.isUserOrServiceAccount,
  remove
);

export default router;
