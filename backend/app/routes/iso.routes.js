import { Router, json } from 'express';
import {
  authJwt,
  verifyOrgAccess,
  downloadAuth,
  externalTokenAuth,
  sessionAuth,
} from '../middleware/index.js';
import {
  upload,
  findAll,
  findOne,
  download,
  downloadByName,
  getDownloadLink,
  update,
  delete as deleteIso,
  deleteAll,
} from '../controllers/iso.controller.js';
const router = Router();
import { discoverAll } from '../controllers/iso/discover.js';
import { watchIso, unwatchIso } from '../controllers/iso/watch.js';

router.use(json());

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

// Discover ISOs visible to the caller
router.get('/isos/discover', externalTokenAuth, discoverAll);

// Upload an ISO
router.post(
  '/organization/:organization/iso',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgAdminOrOwner],
  upload
);

// List ISOs for an organization visible to the caller
router.get('/organization/:organization/iso', externalTokenAuth, findAll);

// Get specific ISO details visible to the caller
router.get('/organization/:organization/iso/:isoId', externalTokenAuth, findOne);

// Download ISO
router.get(
  '/organization/:organization/iso/:isoId/download',
  [downloadAuth, sessionAuth],
  download
);

// Download ISO by name
router.get(
  '/organization/:organization/iso/name/:name/download',
  [downloadAuth, sessionAuth],
  downloadByName
);

// Get Download Link (Public/Authenticated)
router.post('/organization/:organization/iso/:isoId/download-link', [sessionAuth], getDownloadLink);

// Watch and unwatch an ISO
router.post(
  '/organization/:organization/iso/:isoId/watch',
  [authJwt.verifyToken, authJwt.isUser],
  watchIso
);

router.delete(
  '/organization/:organization/iso/:isoId/watch',
  [authJwt.verifyToken, authJwt.isUser],
  unwatchIso
);

// Update ISO
router.put(
  '/organization/:organization/iso/:isoId',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgAdminOrOwner],
  update
);

// Delete an ISO
router.delete(
  '/organization/:organization/iso/:isoId',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgAdminOrOwner],
  deleteIso
);

// Delete every ISO of an organization
router.delete(
  '/organization/:organization/iso',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgAdminOrOwner],
  deleteAll
);

export default router;
