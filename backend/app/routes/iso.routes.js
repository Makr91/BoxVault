import { Router } from 'express';
import {
  authJwt,
  verifyOrgAccess,
  validateBody,
  verifyIsoFilePath,
  downloadAuth,
  sessionAuth,
} from '../middleware/index.js';
import {
  apiLimiter,
  fileOperationLimiter,
  getDownloadLinkLimiter,
  downloadLimiter,
} from '../middleware/rateLimiter.js';
import { create } from '../controllers/iso/create.js';
import { findAll } from '../controllers/iso/findall.js';
import { findOne } from '../controllers/iso/findone.js';
import { update } from '../controllers/iso/update.js';
import { delete as deleteIso } from '../controllers/iso/delete.js';
import { discoverAll } from '../controllers/iso/discover.js';
import { watchIso, unwatchIso } from '../controllers/iso/watch.js';
import { create as createVersion } from '../controllers/iso/version/create.js';
import { findAll as findAllVersions } from '../controllers/iso/version/findall.js';
import { findOne as findOneVersion } from '../controllers/iso/version/findone.js';
import { update as updateVersion } from '../controllers/iso/version/update.js';
import { delete as deleteVersion } from '../controllers/iso/version/delete.js';
import { upload as uploadFile } from '../controllers/iso/file/upload.js';
import { edit as editFile } from '../controllers/iso/file/edit.js';
import { info as fileInfo } from '../controllers/iso/file/info.js';
import { download as downloadFile } from '../controllers/iso/file/download.js';
import { getDownloadLink } from '../controllers/iso/file/link.js';
import { remove as removeFile } from '../controllers/iso/file/remove.js';
import { bulk as bulkIsos } from '../controllers/iso/bulk.js';
import { bulk as bulkVersions } from '../controllers/iso/version/bulk.js';
import { bulk as bulkArchitectures } from '../controllers/iso/file/bulk.js';

const router = Router();

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.get('/isos/discover', apiLimiter, sessionAuth, discoverAll);
router.get('/organization/:organization/iso', apiLimiter, sessionAuth, findAll);
router.get('/organization/:organization/iso/:name', apiLimiter, sessionAuth, findOne);

router.post(
  '/organization/:organization/iso',
  [
    apiLimiter,
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.isOrgAdminOrOwner,
    validateBody('iso'),
  ],
  create
);

router.put(
  '/organization/:organization/iso/:name',
  [
    apiLimiter,
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.isOrgAdminOrOwner,
    validateBody('iso', { partial: true }),
  ],
  update
);

router.post(
  '/organization/:organization/iso/:name/watch',
  [apiLimiter, authJwt.verifyToken, authJwt.isUser],
  watchIso
);

router.delete(
  '/organization/:organization/iso/:name/watch',
  [apiLimiter, authJwt.verifyToken, authJwt.isUser],
  unwatchIso
);

router.delete(
  '/organization/:organization/iso/:name',
  [
    apiLimiter,
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.isOrgAdminOrOwner,
  ],
  deleteIso
);

router.post(
  '/organization/:organization/iso/bulk',
  [
    apiLimiter,
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.isOrgAdminOrOwner,
    validateBody('bulkItem'),
  ],
  bulkIsos
);

router.post(
  '/organization/:organization/iso/:name/version',
  [
    apiLimiter,
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.isOrgAdminOrOwner,
    verifyOrgAccess.attachIso,
    validateBody('version'),
  ],
  createVersion
);

router.put(
  '/organization/:organization/iso/:name/version/:versionNumber',
  [
    apiLimiter,
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.isOrgAdminOrOwner,
    verifyOrgAccess.attachIso,
    validateBody('version', { partial: true }),
  ],
  updateVersion
);

router.get(
  '/organization/:organization/iso/:name/version',
  [apiLimiter, sessionAuth, verifyOrgAccess.attachIso],
  findAllVersions
);

router.get(
  '/organization/:organization/iso/:name/version/:versionNumber',
  [apiLimiter, sessionAuth, verifyOrgAccess.attachIso],
  findOneVersion
);

router.delete(
  '/organization/:organization/iso/:name/version/:versionNumber',
  [
    apiLimiter,
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.isOrgAdminOrOwner,
    verifyOrgAccess.attachIso,
  ],
  deleteVersion
);

router.post(
  '/organization/:organization/iso/:name/version/bulk',
  [
    apiLimiter,
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.isOrgAdminOrOwner,
    verifyOrgAccess.attachIso,
    validateBody('bulkVersion'),
  ],
  bulkVersions
);

router.post(
  '/organization/:organization/iso/:name/version/:versionNumber/architecture/bulk',
  [
    apiLimiter,
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.isOrgAdminOrOwner,
    verifyOrgAccess.attachIso,
    validateBody('bulkLeaf'),
  ],
  bulkArchitectures
);

router.post(
  '/organization/:organization/iso/:name/version/:versionNumber/architecture/:architecture/file/upload',
  fileOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  verifyOrgAccess.isOrgAdminOrOwner,
  verifyIsoFilePath,
  uploadFile
);

router.put(
  '/organization/:organization/iso/:name/version/:versionNumber/architecture/:architecture/file',
  fileOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  verifyOrgAccess.isOrgAdminOrOwner,
  verifyIsoFilePath,
  validateBody('isoFile'),
  editFile
);

router.get(
  '/organization/:organization/iso/:name/version/:versionNumber/architecture/:architecture/file/info',
  fileOperationLimiter,
  verifyIsoFilePath,
  sessionAuth,
  fileInfo
);

router.get(
  '/organization/:organization/iso/:name/version/:versionNumber/architecture/:architecture/file/download',
  downloadLimiter,
  verifyIsoFilePath,
  downloadAuth,
  sessionAuth,
  downloadFile
);

router.post(
  '/organization/:organization/iso/:name/version/:versionNumber/architecture/:architecture/file/get-download-link',
  getDownloadLinkLimiter,
  verifyIsoFilePath,
  sessionAuth,
  getDownloadLink
);

router.delete(
  '/organization/:organization/iso/:name/version/:versionNumber/architecture/:architecture/file/delete',
  fileOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  verifyOrgAccess.isOrgAdminOrOwner,
  verifyIsoFilePath,
  removeFile
);

export default router;
