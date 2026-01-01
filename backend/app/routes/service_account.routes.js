const express = require('express');
const { authJwt } = require('../middleware');
const serviceAccount = require('../controllers/service_account.controller');

const router = express.Router();

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
