const { authJwt } = require("../middleware");
const file = require("../controllers/file.controller");

module.exports = function(app) {
  app.use(function(req, res, next) {
    res.header(
      "Access-Control-Allow-Headers",
      "x-access-token, Origin, Content-Type, Accept"
    );
    next();
  });

  app.put("/api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/upload", [authJwt.verifyToken], file.update);
  app.post("/api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/upload", [authJwt.verifyToken], file.upload);
  app.get("/api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/info", file.info);
  app.get("/api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/download", file.download);
  app.delete("/api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/delete", [authJwt.verifyToken], file.remove);
};