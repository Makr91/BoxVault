import { Router } from 'express';
import {
  authJwt,
  verifyOrgAccess,
  verifyIsoName,
  verifyIsoVersion,
  verifyVersion,
  verifyIsoFilePath,
  downloadAuth,
  sessionAuth,
} from '../middleware/index.js';
import {
  fileOperationLimiter,
  getDownloadLinkLimiter,
  downloadLimiter,
} from '../middleware/rateLimiter.js';
import {
  create,
  findAll,
  findOne,
  update,
  delete as deleteIso,
  deleteAll,
  discoverAll,
  watchIso,
  unwatchIso,
  createVersion,
  findAllVersions,
  findOneVersion,
  updateVersion,
  deleteVersion,
  uploadFile,
  fileInfo,
  downloadFile,
  getDownloadLink,
  removeFile,
} from '../controllers/iso.controller.js';

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
    verifyIsoName.validateIsoName,
    verifyIsoName.checkIsoDuplicate,
  ],
  create
);

router.put(
  '/organization/:organization/iso/:name',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.isOrgAdminOrOwner,
    verifyIsoName.validateIsoName,
    verifyIsoName.checkIsoDuplicate,
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
    verifyVersion.validateVersion,
    verifyIsoVersion.attachEntities,
    verifyIsoVersion.checkVersionDuplicate,
  ],
  createVersion
);

router.put(
  '/organization/:organization/iso/:name/version/:versionNumber',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.isOrgAdminOrOwner,
    verifyIsoVersion.attachEntities,
  ],
  updateVersion
);

router.get(
  '/organization/:organization/iso/:name/version',
  [sessionAuth, verifyIsoVersion.attachEntities],
  findAllVersions
);

router.get(
  '/organization/:organization/iso/:name/version/:versionNumber',
  [sessionAuth, verifyIsoVersion.attachEntities],
  findOneVersion
);

router.delete(
  '/organization/:organization/iso/:name/version/:versionNumber',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.isOrgAdminOrOwner,
    verifyIsoVersion.attachEntities,
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
