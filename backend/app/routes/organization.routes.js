const { authJwt, verifyOrganization } = require("../middleware");
const organization = require("../controllers/organization.controller");
module.exports = function(app) {
  app.use(function(req, res, next) {
    res.header(
      "Access-Control-Allow-Headers",
      "x-access-token, Origin, Content-Type, Accept"
    );
    next();
  });
  app.get("/api/organizations-with-users", [authJwt.verifyToken, authJwt.isAdmin], organization.findAllWithUsers);
  app.get("/api/organization/:organizationName/users", [authJwt.verifyToken], organization.findOneWithUsers);
  app.get("/api/organization", [authJwt.verifyToken], organization.findAll);
  app.get("/api/organization/:organizationName", [authJwt.verifyToken], organization.findOne);
  app.post("/api/organization", [authJwt.verifyToken, verifyOrganization.validateOrganization, verifyOrganization.checkOrganizationDuplicate], organization.create);
  app.put("/api/organization/:organizationName", [authJwt.verifyToken, authJwt.isModeratorOrAdmin, verifyOrganization.validateOrganization], organization.update);
  app.delete("/api/organization/:organizationName", [authJwt.verifyToken, authJwt.isAdmin], organization.delete);
  app.put("/api/organization/:organizationName/suspend", [authJwt.verifyToken, authJwt.isAdmin], organization.suspendOrganization);
  app.put("/api/organization/:organizationName/resume", [authJwt.verifyToken, authJwt.isAdmin], organization.resumeOrganization);
};