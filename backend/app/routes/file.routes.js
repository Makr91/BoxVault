import { Router } from 'express';
import {
  authJwt,
  sessionAuth,
  downloadAuth,
  externalTokenAuth,
  verifyBoxFilePath,
} from '../middleware/index.js';
import {
  fileOperationLimiter,
  getDownloadLinkLimiter,
  downloadLimiter,
} from '../middleware/rateLimiter.js';
import {
  update,
  upload,
  info,
  download,
  getDownloadLink,
  remove,
} from '../controllers/file.controller.js';

const router = Router();

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.use(fileOperationLimiter);

router.put(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/upload',
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  verifyBoxFilePath,
  update
);

router.post(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/upload',
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  verifyBoxFilePath,
  upload
);

router.get(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/info',
  verifyBoxFilePath,
  externalTokenAuth,
  sessionAuth,
  info
);

router.get(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/download',
  downloadLimiter,
  verifyBoxFilePath,
  downloadAuth,
  externalTokenAuth,
  sessionAuth,
  download
);

router.post(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/get-download-link',
  getDownloadLinkLimiter,
  verifyBoxFilePath,
  sessionAuth,
  getDownloadLink
);

router.delete(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/delete',
  authJwt.verifyToken,
  verifyBoxFilePath,
  authJwt.isUserOrServiceAccount,
  remove
);

export default router;
