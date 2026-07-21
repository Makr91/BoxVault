// box.routes.js
import { Router } from 'express';
import { authJwt, externalTokenAuth, verifyBoxName, verifyOrgAccess } from '../middleware/index.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import {
  discoverAll,
  getOrganizationBoxDetails,
  findOne,
  create,
  update,
  delete as deleteBox,
  deleteAll,
} from '../controllers/box.controller.js';

const router = Router();

// Apply rate limiting to this router
router.use(rateLimiter);

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.get('/discover', discoverAll);
router.get('/discover/:name', discoverAll);
router.get('/organization/:organization/box', externalTokenAuth, getOrganizationBoxDetails);
router.get('/organization/:organization/box/:name', externalTokenAuth, findOne);
router.get('/organization/:organization/box/:name/metadata', externalTokenAuth, findOne);

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
  create
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
  update
);

router.delete(
  '/organization/:organization/box/:name',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount, verifyOrgAccess.isOrgMember],
  deleteBox
);

router.delete(
  '/organization/:organization/box',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount, verifyOrgAccess.isOrgModeratorOrAdmin],
  deleteAll
);

export default router;
