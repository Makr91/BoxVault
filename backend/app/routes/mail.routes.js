const { authJwt } = require("../middleware");
const mail = require("../controllers/mail.controller");

module.exports = function(app) {
  app.use(function(req, res, next) {
    res.header(
      "Access-Control-Allow-Headers",
      "x-access-token, Origin, Content-Type, Accept"
    );
    next();
  });

  app.post("/api/mail/test-smtp", [authJwt.verifyToken, authJwt.isAdmin], mail.testSmtp );
  app.post("/api/auth/resend-verification", [authJwt.verifyToken, authJwt.isUser], mail.resendVerificationMail);

};