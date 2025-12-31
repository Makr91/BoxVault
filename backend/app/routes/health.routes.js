const healthController = require('../controllers/health.controller');

module.exports = function (app) {
  app.get('/api/health', healthController.getHealth);
};
