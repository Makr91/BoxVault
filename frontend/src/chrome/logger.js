import logger from 'loglevel';

const LEVELS = ['trace', 'debug', 'info', 'warn', 'error'];
const CATEGORIES = ['app', 'auth', 'api', 'file', 'component', 'error'];
const VALID_LEVELS = new Set([...LEVELS, 'silent']);
const DEFAULT_CONFIG = Object.freeze({ enabled: true, level: 'debug' });
const SENSITIVE_KEYS = new Set([
  'password',
  'passwd',
  'currentpassword',
  'newpassword',
  'secret',
  'token',
  'accesstoken',
  'refreshtoken',
  'authtoken',
  'auth_token',
  'authorization',
  'apikey',
  'api_key',
  'jwt',
  'cookie',
]);
const RING_BUFFER_SIZE = 100;
const MAX_ERROR_QUEUE_SIZE = 50;
const ERROR_FLUSH_DEBOUNCE_MS = 1000;

let settings;
let markConfigured;
const configured = new Promise(resolve => {
  markConfigured = resolve;
});
let initPromise = null;

const ringBuffer = [];
const errorQueue = [];
let flushTimer = null;

/**
 * Replace the value of every credential-named key, at any depth, with
 * "[redacted]"; the input is not mutated.
 * @param {*} value - Anything: objects and arrays are walked, other values come back as they are
 * @returns {*} The redacted copy
 */
export const redact = value => {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_KEYS.has(key.toLowerCase()) ? '[redacted]' : redact(entry),
    ])
  );
};

const pushToBuffer = entry => {
  ringBuffer.push(entry);
  if (ringBuffer.length > RING_BUFFER_SIZE) {
    ringBuffer.shift();
  }
};

const flushErrors = () => {
  flushTimer = null;
  fetch(settings.reportUrl, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ errors: errorQueue.splice(0), recent: ringBuffer.slice() }),
  }).catch(() => null);
};

const queueErrorForShipping = entry => {
  if (errorQueue.length >= MAX_ERROR_QUEUE_SIZE) {
    errorQueue.shift();
  }
  errorQueue.push(entry);
  flushTimer ||= setTimeout(flushErrors, ERROR_FLUSH_DEBOUNCE_MS);
};

const hasLocalStorageOverride = category => {
  try {
    return localStorage.getItem(`loglevel:${category}`) !== null;
  } catch {
    return false;
  }
};

const normalizeLevel = level => (VALID_LEVELS.has(level) ? level : 'info');

const applyLevels = config => {
  for (const category of CATEGORIES) {
    if (!hasLocalStorageOverride(category)) {
      const level = config.enabled ? config.categories?.[category] || config.level : 'silent';
      logger.getLogger(category).setLevel(normalizeLevel(level), false);
    }
  }
};

const loadLoggingConfig = async () => {
  await configured;
  const { fetchHealth, defaults } = settings;
  if (!fetchHealth) {
    return defaults;
  }
  try {
    const health = await fetchHealth();
    return health.frontend_logging || health.frontendLogging || defaults;
  } catch {
    return defaults;
  }
};

const initializeLoggers = () => {
  initPromise ||= loadLoggingConfig().then(applyLevels);
  return initPromise;
};

const enrichErrorMetadata = metadata => ({
  ...metadata,
  url: `${window.location.pathname}${window.location.search}`,
  userAgent: navigator.userAgent,
});

const emit = (categoryLogger, category, level, message, metadata) => {
  const redacted = redact(level === 'error' ? enrichErrorMetadata(metadata) : metadata);
  const hasMetadata = Boolean(redacted) && Object.keys(redacted).length > 0;
  const tagged = `[${category.toUpperCase()}] ${message}`;
  if (hasMetadata) {
    categoryLogger[level](tagged, redacted);
  } else {
    categoryLogger[level](tagged);
  }
  const entry = {
    ts: new Date().toISOString(),
    level,
    category,
    message,
    metadata: hasMetadata ? redacted : null,
  };
  pushToBuffer(entry);
  if (level === 'error' && settings.reportUrl) {
    queueErrorForShipping(entry);
  }
};

const createLazyLogger = category => {
  const categoryLogger = logger.getLogger(category);
  return Object.fromEntries(
    LEVELS.map(level => [
      level,
      (message, metadata) => {
        initializeLoggers().then(() => emit(categoryLogger, category, level, message, metadata));
      },
    ])
  );
};

/**
 * Supply the app's side of the logger once, from its entry point: where the
 * level config comes from and where error reports go. Log calls made before
 * this wait for it.
 *
 * @param {Object} options - The app's side of the logger
 * @param {() => Promise<Object>} [options.fetchHealth] - Resolves the health payload carrying `frontend_logging` or `frontendLogging`; omit to run on `defaults`
 * @param {{ enabled: boolean, level: string, categories?: Object }} [options.defaults] - The logging block applied without `fetchHealth`, or when it fails or carries no block
 * @param {string} [options.reportUrl] - Where error-level entries are POSTed in batches with the recent entries for context; empty ships nothing
 */
export const configureLogger = ({
  fetchHealth = null,
  defaults = DEFAULT_CONFIG,
  reportUrl = '',
}) => {
  settings = { fetchHealth, defaults, reportUrl };
  markConfigured();
};

/**
 * The category loggers every estate app logs through: `app`, `auth`, `api`,
 * `file`, `component` and `error`, each with `trace`, `debug`, `info`, `warn`
 * and `error` taking a message and optional metadata. Metadata is redacted,
 * lines are tagged `[CATEGORY]`, and levels come from `configureLogger` with
 * a `loglevel:<category>` localStorage entry winning over them.
 */
export const log = Object.fromEntries(
  CATEGORIES.map(category => [category, createLazyLogger(category)])
);

/**
 * The error boundary's `onError`: records a render failure with its stack
 * and component stack through the error category.
 * @param {Error} error - The thrown error
 * @param {{ componentStack?: string }} [info] - React's error info
 */
export const reportRenderError = (error, info) =>
  log.error.error('Render error', {
    name: error?.name,
    message: error?.message,
    stack: error?.stack,
    componentStack: info?.componentStack,
  });
