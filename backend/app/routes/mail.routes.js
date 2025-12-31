const { authJwt } = require('../middleware');
const mail = require('../controllers/mail.controller');

module.exports = function (app) {
  app.use((req, res, next) => {
    void req;
    res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
    next();
  });

  app.post('/api/mail/test-smtp', [authJwt.verifyToken, authJwt.isAdmin], mail.testSmtp);
  app.post(
    '/api/auth/resend-verification',
    [authJwt.verifyToken, authJwt.isUser],
    mail.resendVerificationMail
  );
};
