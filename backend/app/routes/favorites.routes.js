const express = require('express');
const { authJwt } = require('../middleware');
const favorites = require('../controllers/favorites.controller');

const router = express.Router();

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

// Get raw favorites JSON
router.get('/favorites', [authJwt.verifyToken, authJwt.isUser], favorites.getFavorites);

// Save favorites JSON
router.post('/favorites/save', [authJwt.verifyToken, authJwt.isUser], favorites.saveFavorites);

// Get enriched user claims (includes favorite_apps with metadata)
router.get('/userinfo/claims', [authJwt.verifyToken, authJwt.isUser], favorites.getUserInfoClaims);

// Get enriched favorites only (lightweight)
router.get(
  '/userinfo/favorites',
  [authJwt.verifyToken, authJwt.isUser],
  favorites.getEnrichedFavorites
);

module.exports = router;
