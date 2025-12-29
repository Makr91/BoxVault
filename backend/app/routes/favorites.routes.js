const { authJwt } = require('../middleware');
const favorites = require('../controllers/favorites.controller');

module.exports = function (app) {
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
    next();
  });

  // Get raw favorites JSON
  app.get('/api/favorites', [authJwt.verifyToken, authJwt.isUser], favorites.getFavorites);

  // Save favorites JSON
  app.post('/api/favorites/save', [authJwt.verifyToken, authJwt.isUser], favorites.saveFavorites);

  // Get enriched user claims (includes favorite_apps with metadata)
  app.get(
    '/api/userinfo/claims',
    [authJwt.verifyToken, authJwt.isUser],
    favorites.getUserInfoClaims
  );

  // Get enriched favorites only (lightweight)
  app.get(
    '/api/userinfo/favorites',
    [authJwt.verifyToken, authJwt.isUser],
    favorites.getEnrichedFavorites
  );
};
