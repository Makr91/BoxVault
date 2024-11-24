// setup.routes.js
const setupController = require("../controllers/setup.controller");

module.exports = function(app) {
  app.post("/api/setup/verify-token", setupController.verifySetupToken);
  app.put("/api/setup", setupController.updateConfigs);
  app.get("/api/setup", setupController.getConfigs);
  app.get("/api/setup/status", setupController.isSetupComplete);
  app.post("/api/setup/upload-ssl", setupController.uploadSSL);
};