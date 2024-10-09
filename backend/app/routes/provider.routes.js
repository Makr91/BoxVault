// provider.routes.js
const { authJwt, verifyProvider } = require("../middleware");
const provider = require("../controllers/provider.controller");

module.exports = function(app) {
  app.use(function(req, res, next) {
    res.header(
      "Access-Control-Allow-Headers",
      "x-access-token, Origin, Content-Type, Accept"
    );
    next();
  });

  app.post("/api/organization/:organization/box/:boxId/version/:versionNumber/provider", [authJwt.verifyToken, verifyProvider.validateProvider, verifyProvider.checkProviderDuplicate], provider.create );
  app.get("/api/organization/:organization/box/:boxId/version/:versionNumber/provider", provider.findAllByVersion );
  app.get("/api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName", provider.findOne );
  app.put("/api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName", [authJwt.verifyToken, verifyProvider.validateProvider], provider.update );
  app.delete("/api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName", [authJwt.verifyToken], provider.delete );
  app.delete("/api/organization/:organization/box/:boxId/version/:versionNumber/provider", [authJwt.verifyToken], provider.deleteAllByVersion );
};