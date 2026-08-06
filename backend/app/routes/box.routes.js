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
  uploadArtwork,
  getArtwork,
  getBadge,
} from '../controllers/box.controller.js';

const router = Router();

// Apply rate limiting to this router
router.use(rateLimiter);

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

// Public status badge — registered first so nothing can shadow it. This router
// is mounted at the root (alongside the Vagrant routes) as well as under /api,
// which is what puts the badge at /badge/:organization/:name.svg.
router.get('/badge/:organization/:name.svg', getBadge);

router.get('/discover', discoverAll);
router.get('/discover/:name', discoverAll);
router.get('/organization/:organization/box', externalTokenAuth, getOrganizationBoxDetails);
router.get('/organization/:organization/box/:name', externalTokenAuth, findOne);
router.get('/organization/:organization/box/:name/metadata', externalTokenAuth, findOne);
router.get('/organization/:organization/box/:name/artwork', externalTokenAuth, getArtwork);

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

// Raw image body — the verifyBoxName middleware pair reads a JSON body and so
// only applies to create/rename; auth matches the box update chain.
router.post(
  '/organization/:organization/box/:name/artwork',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount, verifyOrgAccess.isOrgMember],
  uploadArtwork
);

router.delete(
  '/organization/:organization/box/:name',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount, verifyOrgAccess.isOrgMember],
  deleteBox
);

router.delete(
  '/organization/:organization/box',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount, verifyOrgAccess.isOrgAdminOrOwner],
  deleteAll
);

export default router;
