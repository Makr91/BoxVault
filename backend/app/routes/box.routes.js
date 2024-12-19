// box.routes.js
const { authJwt, verifyBoxName } = require("../middleware");
const vagrantHandler = require("../middleware/vagrantHandler");
const box = require("../controllers/box.controller");

module.exports = function(app) {
  app.use(function(req, res, next) {
    res.header(
      "Access-Control-Allow-Headers",
      "x-access-token, Origin, Content-Type, Accept"
    );
    next();
  });

  // API routes first (most specific)
  app.get("/api/discover", box.discoverAll);
  app.get("/api/discover/:name", box.discoverAll);
  app.get("/api/organization/:organization/box", box.getOrganizationBoxDetails);
  app.get("/api/organization/:organization/box/:name", vagrantHandler, box.findOne);
  app.get("/api/organization/:organization/box/:name/metadata", vagrantHandler, box.findOne);

  // Then Vagrant routes (less specific)
  app.get("/:organization/boxes/:name/versions/:version/providers/:provider/:architecture/vagrant.box", vagrantHandler, box.downloadBox);
  app.get("/:organization/:boxName", vagrantHandler, box.findOne);  // Root metadata request (most generic)

  // Administrative Actions
  app.post("/api/organization/:organization/box", [authJwt.verifyToken, authJwt.isUserOrServiceAccount, verifyBoxName.validateBoxName, verifyBoxName.checkBoxDuplicate], box.create );
  app.put("/api/organization/:organization/box/:name", [authJwt.verifyToken, authJwt.isUserOrServiceAccount, verifyBoxName.validateBoxName, verifyBoxName.checkBoxDuplicate], box.update );
  app.delete("/api/organization/:organization/box/:name", [authJwt.verifyToken, authJwt.isUserOrServiceAccount], box.delete);
  app.delete("/api/organization/:organization/box", [authJwt.verifyToken, authJwt.isUserOrServiceAccount], box.deleteAll);
};
