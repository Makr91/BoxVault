import { Router, json } from 'express';
import { authJwt, verifyOrgAccess, downloadAuth, sessionAuth } from '../middleware/index.js';
import {
  upload,
  findAll,
  findOne,
  download,
  downloadByName,
  getDownloadLink,
  update,
  delete as deleteIso,
} from '../controllers/iso.controller.js';
const router = Router();
import { discoverAll } from '../controllers/iso/discover.js';
import { getPublic } from '../controllers/iso/getpublic.js';

router.use(json());

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

// Discover all public ISOs (public)
router.get('/isos/discover', discoverAll);

// Get public ISOs for an organization (public)
router.get('/organization/:organization/public-isos', getPublic);

// Upload an ISO
router.post(
  '/organization/:organization/iso',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgModeratorOrAdmin],
  upload
);

// List ISOs for an organization
router.get(
  '/organization/:organization/iso',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgMember],
  findAll
);

// Get specific ISO details
router.get(
  '/organization/:organization/iso/:isoId',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgMember],
  findOne
);

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

// Update ISO
router.put(
  '/organization/:organization/iso/:isoId',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgModeratorOrAdmin],
  update
);

// Delete an ISO
router.delete(
  '/organization/:organization/iso/:isoId',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgModeratorOrAdmin],
  deleteIso
);

export default router;
