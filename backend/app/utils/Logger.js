import winston from 'winston';
import morgan from 'morgan';
import fs from 'fs';
import { join, dirname, basename } from 'path';
import zlib from 'zlib';
import { loadConfig } from './config-loader.js';

export const getLoggingConfig = () => {
  try {
    const appConfig = loadConfig('app');
    return appConfig.logging || {};
  } catch {
    return {};
  }
};

const loggingConfig = getLoggingConfig();

export const extractLoggerConfig = config => ({
  level: config.level?.value || 'info',
  console_enabled: config.console_enabled?.value !== false,
  log_directory: config.log_directory?.value || '/var/log/boxvault',
  performance_threshold_ms: config.performance_threshold_ms?.value || 1000,
  enable_compression: config.enable_compression?.value !== false,
  compression_age_days: config.compression_age_days?.value || 7,
  max_files: config.max_files?.value || 30,
  categories: {},
});

const extractedConfig = extractLoggerConfig(loggingConfig);

export const processCategories = (categories, defaultLevel) => {
  const result = {};
  if (categories) {
    for (const [category, config] of Object.entries(categories)) {
      result[category] = config?.value || defaultLevel;
    }
  }
  return result;
};

const applyConfigCategories = config => {
  if (config.categories) {
    Object.assign(
      extractedConfig.categories,
      processCategories(config.categories, extractedConfig.level)
    );
  }
};

applyConfigCategories(loggingConfig);

const logDir = extractedConfig.log_directory;
const ensureLogDirectory = dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
  }
};

ensureLogDirectory(logDir);

const reloadLoggerConfig = () => {
  const newConfig = getLoggingConfig();
  const newValues = extractLoggerConfig(newConfig);
  Object.assign(extractedConfig, newValues);
  applyConfigCategories(newConfig);
  ensureLogDirectory(extractedConfig.log_directory);
};

const compressFile = async filePath => {
  try {
    const compressedPath = `${filePath}.gz`;

    if (fs.existsSync(compressedPath)) {
      return;
    }

    const readStream = fs.createReadStream(filePath);
    const writeStream = fs.createWriteStream(compressedPath);
    const gzip = zlib.createGzip();

    await new Promise((resolve, reject) => {
      readStream.pipe(gzip).pipe(writeStream).on('finish', resolve).on('error', reject);
    });

    await fs.promises.unlink(filePath);
  } catch {
    void 0;
  }
};

const rotateLogFile = async (filePath, maxFiles, config = extractedConfig) => {
  try {
    const archiveDir = join(dirname(filePath), 'archive');

    try {
      await fs.promises.mkdir(archiveDir, { recursive: true });
    } catch {
      return;
    }

    const baseName = basename(filePath);
    const [today] = new Date().toISOString().split('T');
    const archiveName = `${baseName}.${today}`;

    if (fs.existsSync(filePath)) {
      await fs.promises.rename(filePath, join(archiveDir, archiveName));
    }

    if (config.enable_compression) {
      const compressionAgeDays = config.compression_age_days;
      const compressionThreshold = new Date();
      compressionThreshold.setDate(compressionThreshold.getDate() - compressionAgeDays);

      const archiveFiles = await fs.promises.readdir(archiveDir);
      const uncompressedArchives = archiveFiles
        .filter(file => file.startsWith(baseName) && !file.endsWith('.gz'))
        .filter(file => {
          const dateMatch = file.match(/\.(?<date>\d{4}-\d{2}-\d{2})(?:\.(?<counter>\d+))?$/);
          if (dateMatch) {
            const fileDate = new Date(dateMatch.groups.date);
            return fileDate < compressionThreshold;
          }
          return false;
        });

      await Promise.all(uncompressedArchives.map(file => compressFile(join(archiveDir, file))));
    }

    const archiveFiles = await fs.promises.readdir(archiveDir);
    const logArchives = archiveFiles
      .filter(file => file.startsWith(baseName))
      .sort()
      .reverse();

    if (logArchives.length > maxFiles) {
      const filesToDelete = logArchives.slice(maxFiles);
      await Promise.all(filesToDelete.map(file => fs.promises.unlink(join(archiveDir, file))));
    }
  } catch {
    void 0;
  }
};

class DailyRotatingFileTransport extends winston.transports.File {
  constructor(options) {
    super(options);
    this.maxFiles = options.maxFiles || 5;
    this.lastRotateDate = null;
  }

  async write(info, callback) {
    try {
      const [currentDate] = new Date().toISOString().split('T');

      if (this.lastRotateDate !== currentDate && fs.existsSync(this.filename)) {
        await rotateLogFile(this.filename, this.maxFiles);
        this.lastRotateDate = currentDate;
      }
    } catch {
      void 0;
    }

    super.write(info, callback);
  }
}

const transports = [
  new winston.transports.Console({
    format: winston.format.simple(),
  }),
];

export const initializeLogDirectory = () => {
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFiles = [
      'application.log',
      'access.log',
      'database.log',
      'errors.log',
      'auth.log',
      'api-requests.log',
      'file-operations.log',
    ];

    for (const logFile of logFiles) {
      const logPath = join(logDir, logFile);
      if (fs.existsSync(logPath)) {
        try {
          const archiveDir = join(logDir, 'archive');
          if (!fs.existsSync(archiveDir)) {
            fs.mkdirSync(archiveDir, { recursive: true });
          }

          const [today] = new Date().toISOString().split('T');
          let archiveName = `${logFile}.${today}`;
          let archivePath = join(archiveDir, archiveName);

          let counter = 1;
          // Add safety limit to prevent infinite loops during tests if fs.existsSync is mocked to always return true
          while (fs.existsSync(archivePath) && counter < 1000) {
            archiveName = `${logFile}.${today}.${counter}`;
            archivePath = join(archiveDir, archiveName);
            counter++;
          }

          fs.renameSync(logPath, archivePath);
        } catch {
          void 0;
        }
      }
    }
  } catch {
    void 0;
  }
};

initializeLogDirectory();

transports.push(
  new DailyRotatingFileTransport({
    filename: join(logDir, 'application.log'),
    format: winston.format.json(),
    maxFiles: extractedConfig.max_files,
  }),
  new DailyRotatingFileTransport({
    filename: join(logDir, 'errors.log'),
    format: winston.format.json(),
    level: 'error',
    maxFiles: extractedConfig.max_files,
  })
);

const logger = winston.createLogger({
  level: extractedConfig.level,
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports,
});

const accessLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new DailyRotatingFileTransport({
      filename: join(logDir, 'access.log'),
      format: winston.format.json(),
      level: 'info',
      maxFiles: extractedConfig.max_files,
    }),
  ],
});

const consoleFormatTemplate = ({ level, message, timestamp, category: cat, ...meta }) => {
  const categoryStr = cat ? `[${cat}]` : '';
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta, null, 0)}` : '';
  return `${timestamp} ${categoryStr} ${level}: ${message}${metaStr}`;
};

const consoleFormatter = winston.format.printf(consoleFormatTemplate);

export const createCategoryLogger = (category, filename) => {
  const categoryLevel = extractedConfig.categories[category] || extractedConfig.level;
  const categoryTransports = [];

  categoryTransports.push(
    new DailyRotatingFileTransport({
      filename: join(logDir, `${filename}.log`),
      level: categoryLevel,
      format: winston.format.json(),
      maxFiles: extractedConfig.max_files,
    })
  );

  if (extractedConfig.console_enabled && process.env.NODE_ENV !== 'production') {
    categoryTransports.push(
      new winston.transports.Console({
        level: categoryLevel,
        format: winston.format.combine(
          winston.format.timestamp({ format: 'HH:mm:ss' }),
          winston.format.colorize({ all: true }),
          consoleFormatter
        ),
      })
    );
  }

  return winston.createLogger({
    level: categoryLevel,
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    defaultMeta: { category, service: 'boxvault' },
    transports: categoryTransports,
    exitOnError: false,
    silent: extractedConfig.level === 'silent',
  });
};

const appLogger = createCategoryLogger('app', 'application');
const apiLogger = createCategoryLogger('api', 'api-requests');
const databaseLogger = createCategoryLogger('database', 'database');
const authLogger = createCategoryLogger('auth', 'auth');
const fileLogger = createCategoryLogger('file', 'file-operations');
const errorLogger = createCategoryLogger('error', 'errors');

const safeLog = (loggerInstance, level, message, meta = {}) => {
  let logMeta = meta;
  try {
    if (typeof logMeta !== 'object' && logMeta !== null) {
      logMeta = { data: logMeta };
    }
    loggerInstance[level](message, logMeta);
  } catch (error) {
    const timestamp = new Date().toISOString();
    const metaStr = logMeta && Object.keys(logMeta).length > 0 ? ` ${JSON.stringify(logMeta)}` : '';
    process.stderr.write(
      `${timestamp} [${level.toUpperCase()}] ${message}${metaStr} (Winston error: ${error.message})\n`
    );
  }
};

const log = {
  app: {
    info: (msg, meta) => safeLog(appLogger, 'info', msg, meta),
    warn: (msg, meta) => safeLog(appLogger, 'warn', msg, meta),
    error: (msg, meta) => safeLog(appLogger, 'error', msg, meta),
    debug: (msg, meta) => safeLog(appLogger, 'debug', msg, meta),
  },

  api: {
    info: (msg, meta) => safeLog(apiLogger, 'info', msg, meta),
    warn: (msg, meta) => safeLog(apiLogger, 'warn', msg, meta),
    error: (msg, meta) => safeLog(apiLogger, 'error', msg, meta),
    debug: (msg, meta) => safeLog(apiLogger, 'debug', msg, meta),
  },

  database: {
    info: (msg, meta) => safeLog(databaseLogger, 'info', msg, meta),
    warn: (msg, meta) => safeLog(databaseLogger, 'warn', msg, meta),
    error: (msg, meta) => safeLog(databaseLogger, 'error', msg, meta),
    debug: (msg, meta) => safeLog(databaseLogger, 'debug', msg, meta),
  },

  auth: {
    info: (msg, meta) => safeLog(authLogger, 'info', msg, meta),
    warn: (msg, meta) => safeLog(authLogger, 'warn', msg, meta),
    error: (msg, meta) => safeLog(authLogger, 'error', msg, meta),
    debug: (msg, meta) => safeLog(authLogger, 'debug', msg, meta),
  },

  file: {
    info: (msg, meta) => safeLog(fileLogger, 'info', msg, meta),
    warn: (msg, meta) => safeLog(fileLogger, 'warn', msg, meta),
    error: (msg, meta) => safeLog(fileLogger, 'error', msg, meta),
    debug: (msg, meta) => safeLog(fileLogger, 'debug', msg, meta),
  },

  error: {
    info: (msg, meta) => safeLog(errorLogger, 'info', msg, meta),
    warn: (msg, meta) => safeLog(errorLogger, 'warn', msg, meta),
    error: (msg, meta) => safeLog(errorLogger, 'error', msg, meta),
    debug: (msg, meta) => safeLog(errorLogger, 'debug', msg, meta),
  },
};

const createTimer = operation => {
  const start = process.hrtime.bigint();
  return {
    end: (meta = {}) => {
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 500000;

      const thresholdMs = extractedConfig.performance_threshold_ms;
      if (duration >= thresholdMs) {
        log.app.warn(`Slow operation detected: ${operation}`, {
          operation,
          duration_ms: Math.round(duration * 100) / 100,
          threshold_ms: thresholdMs,
          ...meta,
        });
      }

      return Math.round(duration * 100) / 100;
    },
  };
};

const createRequestLogger = (requestId, req) => {
  const start = Date.now();

  const logData = {
    requestId,
    method: req.method,
    path: req.path,
    user: req.entity?.name || req.user?.username,
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('User-Agent'),
  };

  log.api.info('Request started', logData);

  return {
    success: (statusCode, meta = {}) => {
      const duration = Date.now() - start;
      log.api.info('Request completed', {
        ...logData,
        status: statusCode,
        duration_ms: duration,
        success: true,
        ...meta,
      });
    },

    error: (statusCode, error, meta = {}) => {
      const duration = Date.now() - start;
      log.api.error('Request failed', {
        ...logData,
        status: statusCode,
        duration_ms: duration,
        success: false,
        error,
        ...meta,
      });
    },
  };
};

const morganStream = {
  write: message => accessLogger.info(message.trim()),
};

const morganMiddleware = morgan('combined', {
  stream: morganStream,
});

logger.info('Application logger initialized');
accessLogger.info('Access logger initialized');
databaseLogger.info('Database logger initialized');
authLogger.info('Auth logger initialized');
fileLogger.info('File logger initialized');
errorLogger.info('Error logger initialized');

export {
  log,
  createTimer,
  createRequestLogger,
  morganStream,
  morganMiddleware,
  logger,
  accessLogger,
  databaseLogger,
  authLogger,
  fileLogger,
  errorLogger,
  appLogger,
  apiLogger,
  DailyRotatingFileTransport,
  rotateLogFile,
  compressFile,
  consoleFormatTemplate,
  applyConfigCategories,
  ensureLogDirectory,
  reloadLoggerConfig,
};
