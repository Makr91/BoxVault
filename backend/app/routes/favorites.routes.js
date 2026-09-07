import { Router } from 'express';
import { authJwt, oidcTokenRefresh } from '../middleware/index.js';
import { getFavorites } from '../controllers/favorites/get.js';
import { saveFavorites } from '../controllers/favorites/save.js';
import { getUserInfoClaims } from '../controllers/favorites/claims.js';
import { getUserFavorites, saveUserFavorites } from '../controllers/favorites/user.js';

const router = Router();

// Apply rate limiting to this router

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

// Get raw favorites JSON
router.get('/favorites', [oidcTokenRefresh, authJwt.verifyToken, authJwt.isUser], getFavorites);

// Save favorites JSON
router.post(
  '/favorites/save',
  [oidcTokenRefresh, authJwt.verifyToken, authJwt.isUser],
  saveFavorites
);

router.get(
  '/user/favorites',
  [oidcTokenRefresh, authJwt.verifyToken, authJwt.isUser],
  getUserFavorites
);

router.put(
  '/user/favorites',
  [oidcTokenRefresh, authJwt.verifyToken, authJwt.isUser],
  saveUserFavorites
);

// Get enriched user claims (includes favorite_apps with metadata)
// Apply OIDC token refresh middleware before this route as it uses OIDC access token
router.get(
  '/userinfo/claims',
  [oidcTokenRefresh, authJwt.verifyToken, authJwt.isUser],
  getUserInfoClaims
);

export default router;
