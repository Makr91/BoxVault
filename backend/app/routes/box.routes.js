// box.routes.js
import { Router } from 'express';
import { authJwt, sessionAuth, validateBody, verifyOrgAccess } from '../middleware/index.js';
import { discoverAll } from '../controllers/box/discover.js';
import { getOrganizationBoxDetails } from '../controllers/box/organization/details.js';
import { findOne } from '../controllers/box/findone.js';
import { create } from '../controllers/box/create.js';
import { update } from '../controllers/box/update.js';
import { delete as deleteBox } from '../controllers/box/delete.js';
import { deleteAll } from '../controllers/box/deleteall.js';
import { uploadArtwork, getArtwork } from '../controllers/box/artwork.js';
import { watchBox, unwatchBox } from '../controllers/box/watch.js';

const router = Router();

// Apply rate limiting to this router

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.get('/discover', discoverAll);
router.get('/organization/:organization/box', sessionAuth, getOrganizationBoxDetails);
router.get('/organization/:organization/box/:name', sessionAuth, findOne);
router.get('/organization/:organization/box/:name/metadata', sessionAuth, findOne);
router.get('/organization/:organization/box/:name/artwork', sessionAuth, getArtwork);

// Administrative Actions - Now require organization membership
router.post(
  '/organization/:organization/box',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.isOrgMember,
    validateBody('box'),
  ],
  create
);

router.put(
  '/organization/:organization/box/:name',
  [
    authJwt.verifyToken,
    authJwt.isUserOrServiceAccount,
    verifyOrgAccess.isOrgMember,
    validateBody('box', { partial: true }),
  ],
  update
);

// Raw image body — the box rules read a JSON body and so only apply to
// create/rename; auth matches the box update chain.
router.post(
  '/organization/:organization/box/:name/artwork',
  [authJwt.verifyToken, authJwt.isUserOrServiceAccount, verifyOrgAccess.isOrgMember],
  uploadArtwork
);

router.post(
  '/organization/:organization/box/:name/watch',
  [authJwt.verifyToken, authJwt.isUser],
  watchBox
);

router.delete(
  '/organization/:organization/box/:name/watch',
  [authJwt.verifyToken, authJwt.isUser],
  unwatchBox
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
