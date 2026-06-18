import { Router } from 'express';
import { authJwt, oidcTokenRefresh } from '../middleware/index.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import {
  getFavorites,
  saveFavorites,
  getUserInfoClaims,
  getEnrichedFavorites,
} from '../controllers/favorites.controller.js';

const router = Router();

// Apply rate limiting to this router
router.use(rateLimiter);

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

// Get enriched user claims (includes favorite_apps with metadata)
// Apply OIDC token refresh middleware before this route as it uses OIDC access token
router.get(
  '/userinfo/claims',
  [oidcTokenRefresh, authJwt.verifyToken, authJwt.isUser],
  getUserInfoClaims
);

// Get enriched favorites only (lightweight)
// Apply OIDC token refresh middleware before this route as it uses OIDC access token
router.get(
  '/userinfo/favorites',
  [oidcTokenRefresh, authJwt.verifyToken, authJwt.isUser],
  getEnrichedFavorites
);

export default router;
