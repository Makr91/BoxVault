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
  fileOperationLimiter,
  getDownloadLinkLimiter,
  downloadLimiter,
} from '../middleware/rateLimiter.js';
import { create } from '../controllers/iso/create.js';
import { findAll } from '../controllers/iso/findall.js';
import { findOne } from '../controllers/iso/findone.js';
import { update } from '../controllers/iso/update.js';
import { delete as deleteIso } from '../controllers/iso/delete.js';
import { deleteAll } from '../controllers/iso/deleteall.js';
import { discoverAll } from '../controllers/iso/discover.js';
import { watchIso, unwatchIso } from '../controllers/iso/watch.js';
import { create as createVersion } from '../controllers/iso/version/create.js';
import { findAll as findAllVersions } from '../controllers/iso/version/findall.js';
import { findOne as findOneVersion } from '../controllers/iso/version/findone.js';
import { update as updateVersion } from '../controllers/iso/version/update.js';
import { delete as deleteVersion } from '../controllers/iso/version/delete.js';
import { upload as uploadFile } from '../controllers/iso/file/upload.js';
import { info as fileInfo } from '../controllers/iso/file/info.js';
import { download as downloadFile } from '../controllers/iso/file/download.js';
import { getDownloadLink } from '../controllers/iso/file/link.js';
import { remove as removeFile } from '../controllers/iso/file/remove.js';

const router = Router();

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.get('/isos/discover', sessionAuth, discoverAll);
router.get('/organization/:organization/iso', sessionAuth, findAll);
router.get('/organization/:organization/iso/:name', sessionAuth, findOne);

router.post(
  '/organization/:organization/iso',
  [
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
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.isOrgAdminOrOwner,
    validateBody('iso', { partial: true }),
  ],
  update
);

router.post(
  '/organization/:organization/iso/:name/watch',
  [authJwt.verifyToken, authJwt.isUser],
  watchIso
);

router.delete(
  '/organization/:organization/iso/:name/watch',
  [authJwt.verifyToken, authJwt.isUser],
  unwatchIso
);

router.delete(
  '/organization/:organization/iso/:name',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount, verifyOrgAccess.isOrgAdminOrOwner],
  deleteIso
);

router.delete(
  '/organization/:organization/iso',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount, verifyOrgAccess.isOrgAdminOrOwner],
  deleteAll
);

router.post(
  '/organization/:organization/iso/:name/version',
  [
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
  [sessionAuth, verifyOrgAccess.attachIso],
  findAllVersions
);

router.get(
  '/organization/:organization/iso/:name/version/:versionNumber',
  [sessionAuth, verifyOrgAccess.attachIso],
  findOneVersion
);

router.delete(
  '/organization/:organization/iso/:name/version/:versionNumber',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.isOrgAdminOrOwner,
    verifyOrgAccess.attachIso,
  ],
  deleteVersion
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
