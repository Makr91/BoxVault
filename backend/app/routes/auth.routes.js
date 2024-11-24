const { verifySignUp, authJwt } = require("../middleware");
const auth = require("../controllers/auth.controller");

module.exports = function(app) {
  app.use(function(req, res, next) {
    res.header(
      "Access-Control-Allow-Headers",
      "x-access-token, Origin, Content-Type, Accept"
    );
    next();
  });

  app.post("/api/auth/signup",[verifySignUp.checkDuplicateUsernameOrEmail, verifySignUp.checkRolesExisted ], auth.signup);
  app.post("/api/auth/signin", auth.signin);
  app.get("/api/auth/verify-mail/:token", auth.verifyMail);
  app.get("/api/auth/validate-invitation/:token", auth.validateInvitationToken);
  app.get("/api/invitations/active/:organizationName", [authJwt.verifyToken, authJwt.isUser, authJwt.isModerator], auth.getActiveInvitations);
  app.post("/api/auth/invite", [authJwt.verifyToken, authJwt.isUser, authJwt.isModeratorOrAdmin], auth.sendInvitation);
  app.delete("/api/invitations/:invitationId", [authJwt.verifyToken, authJwt.isUser, authJwt.isModeratorOrAdmin], auth.deleteInvitation);
};
