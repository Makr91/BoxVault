import logger from "loglevel";

let configLoaded = false;
let configPromise = null;

const loadConfig = () => {
  if (configPromise) {
    return configPromise;
  }

  configPromise = (async () => {
    try {
      const response = await fetch(`${window.location.origin}/api/health`);
      if (!response.ok) {
        throw new Error(`Health endpoint returned ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch {
      return {
        environment: "development",
        frontend_logging: {
          enabled: true,
          level: "debug",
          categories: {
            app: "debug",
            auth: "debug",
            api: "debug",
            file: "debug",
            component: "debug",
          },
        },
      };
    }
  })();

  return configPromise;
};

const mapLoglevelToMethod = (level) => {
  const mapping = {
    error: "error",
    warn: "warn",
    info: "info",
    debug: "debug",
    trace: "trace",
  };
  return mapping[level] || "info";
};

const initializeLoggers = async () => {
  if (configLoaded) {
    return;
  }

  const config = await loadConfig();
  const loggingConfig = config.frontend_logging || {
    enabled: true,
    level: "debug",
    categories: {
      app: "debug",
      auth: "debug",
      api: "debug",
      file: "debug",
      component: "debug",
    },
  };

  if (!loggingConfig.enabled) {
    logger.setLevel("silent");
    return;
  }

  const defaultLevel = mapLoglevelToMethod(loggingConfig.level);
  logger.setLevel(defaultLevel);

  const categoryLoggers = {
    app: logger.getLogger("app"),
    auth: logger.getLogger("auth"),
    api: logger.getLogger("api"),
    file: logger.getLogger("file"),
    component: logger.getLogger("component"),
    error: logger.getLogger("error"),
  };

  Object.entries(loggingConfig.categories).forEach(([category, level]) => {
    if (categoryLoggers[category]) {
      const logLevel = mapLoglevelToMethod(level);
      categoryLoggers[category].setLevel(logLevel);
    }
  });

  configLoaded = true;
};

const createLazyLogger = (category) => {
  const categoryLogger = logger.getLogger(category);

  return {
    trace: (message, metadata) => {
      initializeLoggers().then(() => {
        if (metadata && Object.keys(metadata).length > 0) {
          categoryLogger.trace(
            `[${category.toUpperCase()}] ${message}`,
            metadata
          );
        } else {
          categoryLogger.trace(`[${category.toUpperCase()}] ${message}`);
        }
      });
    },
    debug: (message, metadata) => {
      initializeLoggers().then(() => {
        if (metadata && Object.keys(metadata).length > 0) {
          categoryLogger.debug(
            `[${category.toUpperCase()}] ${message}`,
            metadata
          );
        } else {
          categoryLogger.debug(`[${category.toUpperCase()}] ${message}`);
        }
      });
    },
    info: (message, metadata) => {
      initializeLoggers().then(() => {
        if (metadata && Object.keys(metadata).length > 0) {
          categoryLogger.info(
            `[${category.toUpperCase()}] ${message}`,
            metadata
          );
        } else {
          categoryLogger.info(`[${category.toUpperCase()}] ${message}`);
        }
      });
    },
    warn: (message, metadata) => {
      initializeLoggers().then(() => {
        if (metadata && Object.keys(metadata).length > 0) {
          categoryLogger.warn(
            `[${category.toUpperCase()}] ${message}`,
            metadata
          );
        } else {
          categoryLogger.warn(`[${category.toUpperCase()}] ${message}`);
        }
      });
    },
    error: (message, metadata) => {
      initializeLoggers().then(() => {
        if (metadata && Object.keys(metadata).length > 0) {
          categoryLogger.error(
            `[${category.toUpperCase()}] ${message}`,
            metadata
          );
        } else {
          categoryLogger.error(`[${category.toUpperCase()}] ${message}`);
        }
      });
    },
  };
};

export const log = {
  app: createLazyLogger("app"),
  auth: createLazyLogger("auth"),
  api: createLazyLogger("api"),
  file: createLazyLogger("file"),
  component: createLazyLogger("component"),
  error: createLazyLogger("error"),
};

export default log;
