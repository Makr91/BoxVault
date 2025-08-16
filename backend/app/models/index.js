const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { loadConfig } = require('../utils/config-loader');

let dbConfig;
try {
  dbConfig = loadConfig('db');
} catch (e) {
  console.error(`Failed to load database configuration: ${e.message}`);
}

const Sequelize = require("sequelize");
const sequelize = new Sequelize(
  dbConfig.sql.database.value,
  dbConfig.sql.user.value,
  dbConfig.sql.password.value,
  {
    logging: dbConfig.sql.logging.value,
    host: dbConfig.sql.host.value,
    port: dbConfig.sql.port.value,
    dialect: dbConfig.sql.dialect.value,
    pool: {
      max: dbConfig.mysql_pool.max.value,
      min: dbConfig.mysql_pool.min.value,
      acquire: dbConfig.mysql_pool.acquire.value,
      idle: dbConfig.mysql_pool.idle.value
    }
  }
);

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;


db.organization = require("../models/organizations.model.js")(sequelize, Sequelize);
db.user = require("../models/user.model.js")(sequelize, Sequelize);
db.role = require("../models/role.model.js")(sequelize, Sequelize);
db.box = require("../models/box.model.js")(sequelize, Sequelize);
db.versions = require("../models/version.model.js")(sequelize, Sequelize);
db.providers = require("../models/provider.model.js")(sequelize, Sequelize);
db.architectures = require("../models/architecture.model.js")(sequelize, Sequelize);
db.files = require("../models/file.model.js")(sequelize, Sequelize);
db.invitation = require("../models/invitation.model.js")(sequelize, Sequelize);
db.service_account = require("../models/service_account.model.js")(sequelize, Sequelize);

// Define associations
db.role.belongsToMany(db.user, {
  through: "user_roles"
});
db.user.belongsToMany(db.role, {
  through: "user_roles"
});

// Call associate methods
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.ROLES = ["user", "admin", "moderator"];

module.exports = db;
