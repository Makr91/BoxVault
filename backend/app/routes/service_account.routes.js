const express = require('express');
const { authJwt, rateLimiter } = require('../middleware');
const serviceAccount = require('../controllers/service_account.controller');

const router = express.Router();

// Apply rate limiting to this router
router.use(rateLimiter.rateLimiterMiddleware());

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.post('/service-accounts', [authJwt.verifyToken, authJwt.isUser], serviceAccount.create);
router.get('/service-accounts', [authJwt.verifyToken, authJwt.isUser], serviceAccount.findAll);
router.delete(
  '/service-accounts/:id',
  [authJwt.verifyToken, authJwt.isUser],
  serviceAccount.delete
);

module.exports = router;
