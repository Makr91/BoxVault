// version.routes.js
const { authJwt, verifyVersion } = require("../middleware");
const version = require("../controllers/version.controller");

module.exports = function(app) {
  app.use(function(req, res, next) {
    res.header(
      "Access-Control-Allow-Headers",
      "x-access-token, Origin, Content-Type, Accept"
    );
    next();
  });

  app.post("/api/organization/:organization/box/:boxId/version", [authJwt.verifyToken, verifyVersion.validateVersion, verifyVersion.checkVersionDuplicate], version.create );
  app.get("/api/organization/:organization/box/:boxId/version",  [authJwt.verifyToken], version.findAllByBox);
  app.get("/api/organization/:organization/box/:boxId/version/:versionNumber",  [authJwt.verifyToken], version.findOne);
  app.put("/api/organization/:organization/box/:boxId/version/:versionNumber",[authJwt.verifyToken, verifyVersion.validateVersion], version.update );
  app.delete("/api/organization/:organization/box/:boxId/version/:versionNumber", [authJwt.verifyToken], version.delete);
  app.delete("/api/organization/:organization/box/:boxId/version", [authJwt.verifyToken], version.deleteAllByBox);
};