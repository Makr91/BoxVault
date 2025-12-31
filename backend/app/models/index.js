const { loadConfig } = require('../utils/config-loader');
const { log } = require('../utils/Logger');

let dbConfig;
try {
  dbConfig = loadConfig('db');
} catch (e) {
  log.database.error('Failed to load database configuration', { error: e.message });
}

const Sequelize = require('sequelize');

// Configure Sequelize based on database type
const sequelizeConfig = {
  logging: dbConfig.sql.logging.value,
  dialect: dbConfig.sql.dialect.value,
};

if (dbConfig.sql.dialect.value === 'sqlite') {
  // SQLite configuration
  sequelizeConfig.storage = dbConfig.sql.storage.value;

  // Ensure the directory exists for SQLite database file
  const path = require('path');
  const fs = require('fs');
  const storageDir = path.dirname(dbConfig.sql.storage.value);
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true, mode: 0o755 });
    log.database.info('Created SQLite database directory', { storageDir });
  }
} else {
  // MySQL/other database configuration
  sequelizeConfig.host = dbConfig.sql.host.value;
  sequelizeConfig.port = dbConfig.sql.port.value;
  sequelizeConfig.pool = {
    max: dbConfig.mysql_pool.max.value,
    min: dbConfig.mysql_pool.min.value,
    acquire: dbConfig.mysql_pool.acquire.value,
    idle: dbConfig.mysql_pool.idle.value,
  };
}

const sequelize = new Sequelize(
  dbConfig.sql.dialect.value === 'sqlite' ? null : dbConfig.sql.database.value,
  dbConfig.sql.dialect.value === 'sqlite' ? null : dbConfig.sql.user.value,
  dbConfig.sql.dialect.value === 'sqlite' ? null : dbConfig.sql.password.value,
  sequelizeConfig
);

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

db.organization = require('../models/organizations.model.js')(sequelize, Sequelize);
db.user = require('../models/user.model.js')(sequelize, Sequelize);
db.role = require('../models/role.model.js')(sequelize, Sequelize);
db.box = require('../models/box.model.js')(sequelize, Sequelize);
db.versions = require('../models/version.model.js')(sequelize, Sequelize);
db.providers = require('../models/provider.model.js')(sequelize, Sequelize);
db.architectures = require('../models/architecture.model.js')(sequelize, Sequelize);
db.files = require('../models/file.model.js')(sequelize, Sequelize);
db.invitation = require('../models/invitation.model.js')(sequelize, Sequelize);
db.service_account = require('../models/service_account.model.js')(sequelize, Sequelize);
db.credential = require('../models/credential.model.js')(sequelize, Sequelize);

// Define associations
db.role.belongsToMany(db.user, {
  through: 'user_roles',
});
db.user.belongsToMany(db.role, {
  through: 'user_roles',
});

// Call associate methods
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.ROLES = ['user', 'admin', 'moderator'];

module.exports = db;
