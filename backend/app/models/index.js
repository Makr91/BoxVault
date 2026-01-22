import { dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { loadConfig } from '../utils/config-loader.js';
import { log } from '../utils/Logger.js';

let dbConfig;
try {
  dbConfig = loadConfig('db');
} catch (e) {
  log.database.error('Failed to load database configuration', { error: e.message });
  // Fallback defaults to prevent crash
  dbConfig = {
    sql: {
      logging: { value: false },
      dialect: { value: 'sqlite' },
      storage: { value: './database.sqlite' },
      host: { value: 'localhost' },
      port: { value: 3306 },
      database: { value: 'boxvault' },
      user: { value: 'root' },
      password: { value: '' },
    },
    mysql_pool: {
      max: { value: 5 },
      min: { value: 0 },
      acquire: { value: 30000 },
      idle: { value: 10000 },
    },
  };
}

import Sequelize from 'sequelize';

const db = {};

db.Sequelize = Sequelize;

// Check if setup is required (setup token exists) or if dialect is missing
const shouldSkipInitialization = !dbConfig?.sql?.dialect?.value;

if (shouldSkipInitialization) {
  log.database.info(
    'Setup mode detected or missing database configuration. Skipping Sequelize initialization.'
  );
  db.sequelize = null;
} else {
  // Configure Sequelize based on database type
  const sequelizeConfig = {
    logging: dbConfig.sql.logging.value,
    dialect: dbConfig.sql.dialect.value,
  };

  if (dbConfig.sql.dialect.value === 'sqlite') {
    // SQLite configuration
    sequelizeConfig.storage = dbConfig.sql.storage.value;

    // Ensure the directory exists for SQLite database file
    const storageDir = dirname(dbConfig.sql.storage.value);
    if (!existsSync(storageDir)) {
      mkdirSync(storageDir, { recursive: true, mode: 0o755 });
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

  db.sequelize = sequelize;

  db.organization = (await import('./organizations.model.js')).default(sequelize, Sequelize);
  db.user = (await import('./user.model.js')).default(sequelize, Sequelize);
  db.role = (await import('./role.model.js')).default(sequelize, Sequelize);
  db.box = (await import('./box.model.js')).default(sequelize, Sequelize);
  db.versions = (await import('./version.model.js')).default(sequelize, Sequelize);
  db.providers = (await import('./provider.model.js')).default(sequelize, Sequelize);
  db.architectures = (await import('./architecture.model.js')).default(sequelize, Sequelize);
  db.files = (await import('./file.model.js')).default(sequelize, Sequelize);
  db.invitation = (await import('./invitation.model.js')).default(sequelize, Sequelize);
  db.service_account = (await import('./service_account.model.js')).default(sequelize, Sequelize);
  db.credential = (await import('./credential.model.js')).default(sequelize, Sequelize);
  db.UserOrg = (await import('./user-org.model.js')).default(sequelize, Sequelize);
  db.Request = (await import('./request.model.js')).default(sequelize, Sequelize);
  db.iso = (await import('./iso.model.js')).default(sequelize, Sequelize);

  // Define associations for new models
  db.UserOrg.associate = function (models) {
    db.UserOrg.belongsTo(models.user, {
      foreignKey: 'user_id',
      as: 'user',
    });
    db.UserOrg.belongsTo(models.organization, {
      foreignKey: 'organization_id',
      as: 'organization',
    });
  };

  db.Request.associate = function (models) {
    db.Request.belongsTo(models.user, {
      foreignKey: 'user_id',
      as: 'user',
    });
    db.Request.belongsTo(models.organization, {
      foreignKey: 'organization_id',
      as: 'organization',
    });
    db.Request.belongsTo(models.user, {
      foreignKey: 'reviewed_by',
      as: 'reviewer',
    });
  };

  db.organization.hasMany(db.iso, { as: 'isos' });
  db.iso.belongsTo(db.organization, {
    foreignKey: 'organizationId',
    as: 'organization',
  });

  // DEPRECATED: Keep global roles for backward compatibility during migration
  // These will be removed in a future version
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
}

db.ROLES = ['user', 'admin', 'moderator'];

export default db;
