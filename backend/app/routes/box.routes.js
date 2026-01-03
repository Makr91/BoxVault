// box.routes.js
const express = require('express');
const { authJwt, verifyBoxName, verifyOrgAccess } = require('../middleware');
const { rateLimiter } = require('../middleware/rateLimiter');
const box = require('../controllers/box.controller');

const router = express.Router();

// Apply rate limiting to this router
router.use(rateLimiter);

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.get('/discover', box.discoverAll);
router.get('/discover/:name', box.discoverAll);
router.get('/organization/:organization/box', box.getOrganizationBoxDetails);
router.get('/organization/:organization/box/:name', box.findOne);
router.get('/organization/:organization/box/:name/metadata', box.findOne);

// Administrative Actions - Now require organization membership
router.post(
  '/organization/:organization/box',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.isOrgMember,
    verifyBoxName.validateBoxName,
    verifyBoxName.checkBoxDuplicate,
  ],
  box.create
);

router.put(
  '/organization/:organization/box/:name',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.isOrgMember,
    verifyBoxName.validateBoxName,
    verifyBoxName.checkBoxDuplicate,
  ],
  box.update
);

router.delete(
  '/organization/:organization/box/:name',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount, verifyOrgAccess.isOrgMember],
  box.delete
);

router.delete(
  '/organization/:organization/box',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount, verifyOrgAccess.isOrgModeratorOrAdmin],
  box.deleteAll
);

module.exports = router;
