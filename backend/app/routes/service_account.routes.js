const { authJwt } = require("../middleware");
const serviceAccount = require("../controllers/service_account.controller");

module.exports = function(app) {
  app.use(function(req, res, next) {
    res.header(
      "Access-Control-Allow-Headers",
      "x-access-token, Origin, Content-Type, Accept"
    );
    next();
  });

  app.post("/api/service-accounts", [authJwt.verifyToken, authJwt.isUser], serviceAccount.create);
  app.get("/api/service-accounts", [authJwt.verifyToken, authJwt.isUser], serviceAccount.findAll);
  app.delete("/api/service-accounts/:id", [authJwt.verifyToken, authJwt.isUser], serviceAccount.delete);
};