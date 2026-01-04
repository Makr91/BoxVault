const express = require('express');
const { authJwt, verifyOrgAccess, downloadAuth, sessionAuth } = require('../middleware');
const controller = require('../controllers/iso.controller');
const router = express.Router();
const { discoverAll } = require('../controllers/iso/discover');
const { getPublic } = require('../controllers/iso/getpublic');

router.use(express.json());

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
  controller.upload
);

// List ISOs for an organization
router.get(
  '/organization/:organization/iso',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgMember],
  controller.findAll
);

// Get specific ISO details
router.get(
  '/organization/:organization/iso/:isoId',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgMember],
  controller.findOne
);

// Download ISO
router.get(
  '/organization/:organization/iso/:isoId/download',
  [downloadAuth, sessionAuth],
  controller.download
);

// Download ISO by name
router.get(
  '/organization/:organization/iso/name/:name/download',
  [downloadAuth, sessionAuth],
  controller.downloadByName
);

// Get Download Link (Public/Authenticated)
router.post(
  '/organization/:organization/iso/:isoId/download-link',
  [sessionAuth],
  controller.getDownloadLink
);

// Update ISO
router.put(
  '/organization/:organization/iso/:isoId',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgModeratorOrAdmin],
  controller.update
);

// Delete an ISO
router.delete(
  '/organization/:organization/iso/:isoId',
  [authJwt.verifyToken, authJwt.isUser, verifyOrgAccess.isOrgModeratorOrAdmin],
  controller.delete
);

module.exports = router;
