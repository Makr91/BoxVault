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
    validateBody('bulkLeaf'),
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
