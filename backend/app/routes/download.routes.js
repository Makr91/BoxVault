import { Router } from 'express';
import {
  authJwt,
  verifyOrgAccess,
  validateBody,
  verifyDownloadFilePath,
  downloadAuth,
  sessionAuth,
} from '../middleware/index.js';
import {
  fileOperationLimiter,
  getDownloadLinkLimiter,
  downloadLimiter,
} from '../middleware/rateLimiter.js';
import { create } from '../controllers/download/create.js';
import { findAll } from '../controllers/download/findall.js';
import { findOne } from '../controllers/download/findone.js';
import { update } from '../controllers/download/update.js';
import { delete as deleteDownload } from '../controllers/download/delete.js';
import { discoverAll } from '../controllers/download/discover.js';
import { duplicates } from '../controllers/download/duplicates.js';
import {
  attachOrganization as attachFamilyOrganization,
  findAll as findAllFamilies,
  findOne as findOneFamily,
  create as createFamily,
  update as updateFamily,
  remove as removeFamily,
} from '../controllers/download/family.js';
import { watchDownload, unwatchDownload } from '../controllers/download/watch.js';
import { create as createRelease } from '../controllers/download/release/create.js';
import { findAll as findAllReleases } from '../controllers/download/release/findall.js';
import { findOne as findOneRelease } from '../controllers/download/release/findone.js';
import { update as updateRelease } from '../controllers/download/release/update.js';
import { delete as deleteRelease } from '../controllers/download/release/delete.js';
import { create as createPatch } from '../controllers/download/patch/create.js';
import { findAll as findAllPatches } from '../controllers/download/patch/findall.js';
import { findOne as findOnePatch } from '../controllers/download/patch/findone.js';
import { update as updatePatch } from '../controllers/download/patch/update.js';
import { delete as deletePatch } from '../controllers/download/patch/delete.js';
import { create as createFile } from '../controllers/download/file/create.js';
import { findAll as findAllFiles } from '../controllers/download/file/findall.js';
import { update as updateFile } from '../controllers/download/file/update.js';
import { upload as uploadFile } from '../controllers/download/file/upload.js';
import { info as fileInfo } from '../controllers/download/file/info.js';
import { download as downloadFile } from '../controllers/download/file/download.js';
import { getDownloadLink } from '../controllers/download/file/link.js';
import { remove as removeFile } from '../controllers/download/file/remove.js';
import { upload as uploadPending } from '../controllers/download/pending/upload.js';
import { info as pendingInfo } from '../controllers/download/pending/info.js';
import { place as placePending } from '../controllers/download/pending/place.js';
import { remove as removePending } from '../controllers/download/pending/remove.js';
import { bulk as bulkDownloads } from '../controllers/download/bulk.js';
import { bulk as bulkReleases } from '../controllers/download/release/bulk.js';
import { bulk as bulkPatches } from '../controllers/download/patch/bulk.js';
import { bulk as bulkFiles } from '../controllers/download/file/bulk.js';

const router = Router();

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.get('/downloads/discover', sessionAuth, discoverAll);
router.get('/organization/:organization/download', sessionAuth, findAll);

router.get(
  '/organization/:organization/download/duplicates',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount, verifyOrgAccess.isOrgWriter],
  duplicates
);

router.get(
  '/organization/:organization/download-family',
  [sessionAuth, attachFamilyOrganization(false)],
  findAllFamilies
);

router.post(
  '/organization/:organization/download-family',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    attachFamilyOrganization(true),
    validateBody('family'),
  ],
  createFamily
);

router.get(
  '/organization/:organization/download-family/:name',
  [sessionAuth, attachFamilyOrganization(false)],
  findOneFamily
);

router.put(
  '/organization/:organization/download-family/:name',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    attachFamilyOrganization(true),
    validateBody('family', { partial: true }),
  ],
  updateFamily
);

router.delete(
  '/organization/:organization/download-family/:name',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount, attachFamilyOrganization(true)],
  removeFamily
);

router.post(
  '/organization/:organization/download/pending/upload',
  fileOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  uploadPending
);

router.get(
  '/organization/:organization/download/pending/:id/info',
  fileOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  pendingInfo
);

router.post(
  '/organization/:organization/download/pending/:id/place',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount],
  placePending
);

router.delete(
  '/organization/:organization/download/pending/:id',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount],
  removePending
);

router.get('/organization/:organization/download/:name', sessionAuth, findOne);

router.post(
  '/organization/:organization/download',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.isOrgWriter,
    validateBody('download'),
  ],
  create
);

router.put(
  '/organization/:organization/download/:name',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.isOrgWriter,
    validateBody('download', { partial: true }),
  ],
  update
);

router.post(
  '/organization/:organization/download/:name/watch',
  [authJwt.verifyToken, authJwt.isUser],
  watchDownload
);

router.delete(
  '/organization/:organization/download/:name/watch',
  [authJwt.verifyToken, authJwt.isUser],
  unwatchDownload
);

router.delete(
  '/organization/:organization/download/:name',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount, verifyOrgAccess.isOrgWriter],
  deleteDownload
);

router.post(
  '/organization/:organization/download/bulk',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.isOrgWriter,
    validateBody('bulkItem'),
  ],
  bulkDownloads
);

router.post(
  '/organization/:organization/download/:name/release',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.attachDownload,
    validateBody('release'),
  ],
  createRelease
);

router.put(
  '/organization/:organization/download/:name/release/:versionNumber',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.attachDownload,
    validateBody('release', { partial: true }),
  ],
  updateRelease
);

router.get(
  '/organization/:organization/download/:name/release',
  [sessionAuth, verifyOrgAccess.attachDownload],
  findAllReleases
);

router.get(
  '/organization/:organization/download/:name/release/:versionNumber',
  [sessionAuth, verifyOrgAccess.attachDownload],
  findOneRelease
);

router.delete(
  '/organization/:organization/download/:name/release/:versionNumber',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount, verifyOrgAccess.attachDownload],
  deleteRelease
);

router.post(
  '/organization/:organization/download/:name/release/bulk',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.attachDownload,
    validateBody('bulkVersion'),
  ],
  bulkReleases
);

router.post(
  '/organization/:organization/download/:name/release/:versionNumber/patch',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.attachDownload,
    verifyOrgAccess.attachRelease,
    validateBody('patch'),
  ],
  createPatch
);

router.put(
  '/organization/:organization/download/:name/release/:versionNumber/patch/:patch',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.attachDownload,
    verifyOrgAccess.attachRelease,
    validateBody('patch', { partial: true }),
  ],
  updatePatch
);

router.get(
  '/organization/:organization/download/:name/release/:versionNumber/patch',
  [sessionAuth, verifyOrgAccess.attachDownload, verifyOrgAccess.attachRelease],
  findAllPatches
);

router.get(
  '/organization/:organization/download/:name/release/:versionNumber/patch/:patch',
  [sessionAuth, verifyOrgAccess.attachDownload, verifyOrgAccess.attachRelease],
  findOnePatch
);

router.delete(
  '/organization/:organization/download/:name/release/:versionNumber/patch/:patch',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.attachDownload,
    verifyOrgAccess.attachRelease,
  ],
  deletePatch
);

router.post(
  '/organization/:organization/download/:name/release/:versionNumber/patch/bulk',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.attachDownload,
    verifyOrgAccess.attachRelease,
    validateBody('bulkPatch'),
  ],
  bulkPatches
);

router.get(
  '/organization/:organization/download/:name/release/:versionNumber/patch/:patch/file',
  [sessionAuth, verifyOrgAccess.attachDownload, verifyOrgAccess.attachRelease],
  findAllFiles
);

router.post(
  '/organization/:organization/download/:name/release/:versionNumber/patch/:patch/file',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.attachDownload,
    verifyOrgAccess.attachRelease,
    validateBody('downloadFile'),
  ],
  createFile
);

router.put(
  '/organization/:organization/download/:name/release/:versionNumber/patch/:patch/file/:key',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyDownloadFilePath,
    validateBody('downloadFile', { partial: true }),
  ],
  updateFile
);

router.post(
  '/organization/:organization/download/:name/release/:versionNumber/patch/:patch/file/:key/upload',
  fileOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  uploadFile
);

router.post(
  '/organization/:organization/download/file/upload',
  fileOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  uploadFile
);

router.post(
  '/organization/:organization/download/:name/file/upload',
  fileOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  uploadFile
);

router.post(
  '/organization/:organization/download/:name/release/:versionNumber/file/upload',
  fileOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  uploadFile
);

router.post(
  '/organization/:organization/download/:name/release/:versionNumber/patch/:patch/file/upload',
  fileOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  uploadFile
);

router.get(
  '/organization/:organization/download/:name/release/:versionNumber/patch/:patch/file/:key/info',
  fileOperationLimiter,
  verifyDownloadFilePath,
  sessionAuth,
  fileInfo
);

router.get(
  '/organization/:organization/download/:name/release/:versionNumber/patch/:patch/file/:key/download',
  downloadLimiter,
  verifyDownloadFilePath,
  downloadAuth,
  sessionAuth,
  downloadFile
);

router.post(
  '/organization/:organization/download/:name/release/:versionNumber/patch/:patch/file/:key/get-download-link',
  getDownloadLinkLimiter,
  verifyDownloadFilePath,
  sessionAuth,
  getDownloadLink
);

router.delete(
  '/organization/:organization/download/:name/release/:versionNumber/patch/:patch/file/:key/delete',
  fileOperationLimiter,
  authJwt.verifyToken,
  authJwt.isUserOrServiceAccount,
  verifyDownloadFilePath,
  removeFile
);

router.post(
  '/organization/:organization/download/:name/release/:versionNumber/patch/:patch/file/bulk',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.attachDownload,
    verifyOrgAccess.attachRelease,
    validateBody('bulkLeaf'),
  ],
  bulkFiles
);

export default router;
