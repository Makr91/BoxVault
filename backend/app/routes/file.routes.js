import { Router } from 'express';
import {
  authJwt,
  sessionAuth,
  downloadAuth,
  validateBody,
  verifyBoxFilePath,
} from '../middleware/index.js';
import {
  apiLimiter,
  fileOperationLimiter,
  getDownloadLinkLimiter,
  downloadLimiter,
} from '../middleware/rateLimiter.js';
import { edit } from '../controllers/file/edit.js';
import { update } from '../controllers/file/update.js';
import { upload } from '../controllers/file/upload.js';
import { info } from '../controllers/file/info.js';
import { download } from '../controllers/file/download.js';
import { getDownloadLink } from '../controllers/file/link.js';
import { remove } from '../controllers/file/remove.js';

const router = Router();

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
  apiLimiter,
  fileOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  verifyBoxFilePath,
  upload
);

router.put(
  '/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file',
  apiLimiter,
  fileOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  verifyBoxFilePath,
  validateBody('boxFile'),
  edit
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
  verifyBoxFilePath,
  downloadAuth,
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
  fileOperationLimiter,
  authJwt.verifyToken,
  verifyBoxFilePath,
  authJwt.isUserOrServiceAccount,
  remove
);

export default router;
