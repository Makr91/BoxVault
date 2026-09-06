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
      logging: false,
      dialect: 'sqlite',
      storage: './database.sqlite',
      host: 'localhost',
      port: 3306,
      database: 'boxvault',
      user: 'root',
      password: '',
    },
    mysql_pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  };
}

import Sequelize from 'sequelize';

const db = {};

db.Sequelize = Sequelize;

// Check if setup is required (setup token exists) or if dialect is missing
const shouldSkipInitialization = !dbConfig?.sql?.dialect;

if (shouldSkipInitialization) {
  log.database.info(
    'Setup mode detected or missing database configuration. Skipping Sequelize initialization.'
  );
  db.sequelize = null;
} else {
  // Configure Sequelize based on database type
  const sequelizeConfig = {
    logging: dbConfig.sql.logging,
    dialect: dbConfig.sql.dialect,
  };

  if (dbConfig.sql.dialect === 'sqlite') {
    // SQLite configuration
    sequelizeConfig.storage = dbConfig.sql.storage;

    // Ensure the directory exists for SQLite database file
    const storageDir = dirname(dbConfig.sql.storage);
    if (!existsSync(storageDir)) {
      mkdirSync(storageDir, { recursive: true, mode: 0o755 });
      log.database.info('Created SQLite database directory', { storageDir });
    }
  } else {
    // MySQL/other database configuration
    sequelizeConfig.host = dbConfig.sql.host;
    sequelizeConfig.port = dbConfig.sql.port;
    sequelizeConfig.pool = {
      max: dbConfig.mysql_pool.max,
      min: dbConfig.mysql_pool.min,
      acquire: dbConfig.mysql_pool.acquire,
      idle: dbConfig.mysql_pool.idle,
    };
  }

  const sequelize = new Sequelize(
    dbConfig.sql.dialect === 'sqlite' ? null : dbConfig.sql.database,
    dbConfig.sql.dialect === 'sqlite' ? null : dbConfig.sql.user,
    dbConfig.sql.dialect === 'sqlite' ? null : dbConfig.sql.password,
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
  db.isoVersions = (await import('./iso-version.model.js')).default(sequelize, Sequelize);
  db.isoFiles = (await import('./iso-file.model.js')).default(sequelize, Sequelize);
  db.scimGroup = (await import('./scim-group.model.js')).default(sequelize, Sequelize);
  db.boxWatcher = (await import('./box-watcher.model.js')).default(sequelize, Sequelize);
  db.isoWatcher = (await import('./iso-watcher.model.js')).default(sequelize, Sequelize);
  db.pushSubscription = (await import('./push-subscription.model.js')).default(
    sequelize,
    Sequelize
  );

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

db.ROLES = ['user', 'admin'];

export default db;
