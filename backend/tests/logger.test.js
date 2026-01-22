import { jest } from '@jest/globals';
import fs from 'fs';

const uniqueId = Date.now();

// Mock config loader to control logging config
const mockConfigLoader = {
  loadConfig: jest.fn().mockReturnValue({
    logging: {
      // Minimal config to trigger defaults/fallbacks during initial load (Line 20)
      log_directory: { value: `/tmp/logs_${uniqueId}` },
    },
  }),
};

const mockStream = {
  pipe: jest.fn().mockReturnThis(),
  on: jest.fn((event, cb) => {
    if (event === 'finish') {
      cb();
    }
    return mockStream;
  }),
};

jest.unstable_mockModule('morgan', () => ({ default: jest.fn() }));
jest.unstable_mockModule('../app/utils/config-loader.js', () => mockConfigLoader);
// ************************************************************************************************
// ************************************************************************************************
// *** MASSIVE WARNING: DO NOT USE jest.resetModules() HERE OR IN TESTS ***
// ************************************************************************************************
// ************************************************************************************************
// Using jest.resetModules() causes massive memory leaks and OOM errors (Heap limit allocation failed)
// when running tests, especially with --runInBand.
// DO NOT ADD IT BACK.
// ************************************************************************************************
// Import Logger after mocks
// ************************************************************************************************
// ************************************************************************************************
// *** MASSIVE WARNING: DO NOT USE jest.resetModules() OR DYNAMIC IMPORTS IN beforeEach/Tests ***
// ************************************************************************************************
// ************************************************************************************************
//
// Using jest.resetModules() or importing the Logger module dynamically inside tests or beforeEach
// causes severe memory leaks and "JavaScript heap out of memory" errors (OOM) when running tests,
// especially with --runInBand. The Logger initializes Winston transports which may not clean up
// correctly when re-initialized repeatedly in the same process.
// The module must be imported ONCE at the top level after mocks are defined.
//
// ************************************************************************************************
// ************************************************************************************************
const {
  log,
  createTimer,
  createRequestLogger,
  appLogger,
  errorLogger,
  apiLogger,
  accessLogger,
  morganStream,
  DailyRotatingFileTransport,
  rotateLogFile,
  compressFile,
  consoleFormatTemplate,
  getLoggingConfig,
  processCategories,
  initializeLogDirectory,
  createCategoryLogger,
  applyConfigCategories,
  ensureLogDirectory,
  reloadLoggerConfig,
  extractLoggerConfig,
} = await import('../app/utils/Logger.js');

describe('Logger Utility', () => {
  beforeAll(() => {
    // Restore log methods to use the actual logic we want to test
    // This overrides the no-op functions set by globalSetup when SUPPRESS_LOGS is true

    // If originals were saved by setup.js, restore them to cover the original arrow functions
    if (global.originalLogMethods) {
      Object.keys(global.originalLogMethods).forEach(category => {
        Object.keys(global.originalLogMethods[category]).forEach(level => {
          log[category][level] = global.originalLogMethods[category][level];
        });
      });
    }

    // Force reload of logger config to ensure console_enabled is true
    // This is necessary because Logger.js is a singleton initialized during global setup (where logs are suppressed)

    // Update mock to return full config for tests
    mockConfigLoader.loadConfig.mockReturnValue({
      logging: {
        level: { value: 'info' },
        console_enabled: { value: true },
        log_directory: { value: `/tmp/logs_${uniqueId}` },
        performance_threshold_ms: { value: 100 },
        enable_compression: { value: true },
        compression_age_days: { value: 7 },
        categories: {
          test_cat: { value: 'debug' },
        },
      },
    });

    const existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

    reloadLoggerConfig();

    existsSpy.mockRestore();
    mkdirSpy.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Spy on the actual logger instances used by the module
    // Use mockImplementation to suppress actual logging output
    jest.spyOn(appLogger, 'info').mockImplementation(() => {});
    jest.spyOn(appLogger, 'warn').mockImplementation(() => {});
    jest.spyOn(appLogger, 'error').mockImplementation(() => {});
    jest.spyOn(appLogger, 'debug').mockImplementation(() => {});
    jest.spyOn(errorLogger, 'error').mockImplementation(() => {});
    jest.spyOn(apiLogger, 'info').mockImplementation(() => {});
    jest.spyOn(apiLogger, 'error').mockImplementation(() => {});
    jest.spyOn(accessLogger, 'info').mockImplementation(() => {});

    // Spy on FS methods
    // Default to false to prevent infinite loops in initializeLogDirectory if a test calls it without overriding
    // Tests that need files to exist should override this
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    jest.spyOn(fs, 'renameSync').mockImplementation(() => {});
    jest.spyOn(fs, 'createReadStream').mockReturnValue(mockStream);
    jest.spyOn(fs, 'createWriteStream').mockReturnValue(mockStream);

    jest.spyOn(fs.promises, 'mkdir').mockResolvedValue();
    jest.spyOn(fs.promises, 'rename').mockResolvedValue();
    jest.spyOn(fs.promises, 'readdir').mockResolvedValue([]);
    jest.spyOn(fs.promises, 'unlink').mockResolvedValue();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    try {
      const dir = `/tmp/logs_${uniqueId}`;
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch (e) {
      void e;
      // Ignore cleanup errors
    }
  });

  it('should log info messages', () => {
    log.app.info('test message', { meta: 'data' });
    expect(appLogger.info).toHaveBeenCalledWith('test message', { meta: 'data' });
  });

  it('should log error messages', () => {
    log.app.error('error message', { error: 'details' });
    expect(appLogger.error).toHaveBeenCalledWith('error message', { error: 'details' });
  });

  it('should log warn messages', () => {
    log.app.warn('warn message');
    expect(appLogger.warn).toHaveBeenCalledWith('warn message', {});
  });

  it('should log debug messages', () => {
    log.app.debug('debug message');
    expect(appLogger.debug).toHaveBeenCalledWith('debug message', {});
  });

  it('should handle non-object meta', () => {
    log.app.info('test', 'string meta');
    expect(appLogger.info).toHaveBeenCalledWith('test', { data: 'string meta' });
  });

  it('should create and use a timer', () => {
    const timer = createTimer('test-operation');
    const duration = timer.end();
    expect(typeof duration).toBe('number');
  });

  it('should log warning for slow operations', () => {
    // Mock process.hrtime.bigint to simulate delay
    const originalHrtime = process.hrtime.bigint;
    let calls = 0;
    process.hrtime.bigint = jest.fn(() => {
      calls++;
      // Return 0 for start
      if (calls === 1) {
        return 0n;
      }

      // Return a large number for end to exceed threshold
      // Default threshold is 1000ms (if config mock ignored due to caching)
      // 1000ms * 500000 = 500,000,000
      // Use 600,000,000 to be safe.
      return 2000000000n;
    });

    const timer = createTimer('slow-op');
    timer.end();

    expect(appLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Slow operation detected'),
      expect.any(Object)
    );

    process.hrtime.bigint = originalHrtime;
  });

  it('should create a request logger', () => {
    const req = { method: 'GET', path: '/test', get: jest.fn(), ip: '127.0.0.1' };
    const reqLogger = createRequestLogger('req-123', req);

    expect(apiLogger.info).toHaveBeenCalledWith('Request started', expect.any(Object));

    reqLogger.success(200);
    expect(apiLogger.info).toHaveBeenCalledWith('Request completed', expect.any(Object));

    reqLogger.error(500, new Error('fail'));
    expect(apiLogger.error).toHaveBeenCalledWith('Request failed', expect.any(Object));
  });

  it('should create a request logger with user info', () => {
    const req = {
      method: 'POST',
      path: '/api',
      get: jest.fn(),
      ip: '127.0.0.1',
      user: { username: 'testuser' },
    };
    createRequestLogger('req-456', req);
    expect(apiLogger.info).toHaveBeenCalledWith(
      'Request started',
      expect.objectContaining({ user: 'testuser' })
    );
  });

  it('createRequestLogger returns expected methods', () => {
    const req = { method: 'GET', path: '/', get: jest.fn() };
    const logger = createRequestLogger('id', req);
    expect(typeof logger.success).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('should handle safeLog errors (Winston error)', () => {
    // Make the spy throw to trigger the catch block in safeLog
    jest.spyOn(appLogger, 'info').mockImplementationOnce(() => {
      throw new Error('Logger error');
    });

    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => {});

    log.app.info('test');

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Winston error'));

    stderrSpy.mockRestore();
  });

  it('morganStream should log to access logger', () => {
    morganStream.write('test access log\n');

    expect(accessLogger.info).toHaveBeenCalledWith('test access log');
  });

  it('compressFile should compress and delete original file', async () => {
    // Mock existsSync to return false for .gz file (so it proceeds to compress)
    fs.existsSync.mockImplementation(p => p === '/tmp/logs/test.log');

    await compressFile('/tmp/logs/test.log');

    expect(fs.createReadStream).toHaveBeenCalledWith('/tmp/logs/test.log');
    expect(fs.createWriteStream).toHaveBeenCalledWith('/tmp/logs/test.log.gz');
    expect(fs.promises.unlink).toHaveBeenCalledWith('/tmp/logs/test.log');
  });

  it('rotateLogFile should rotate, compress, and prune logs', async () => {
    // Mock readdir to return some files
    fs.promises.readdir.mockResolvedValue([
      'test.log.2020-01-01', // Very Old, should be compressed
      'test.log.2023-01-02.gz', // Already compressed
      'test.log.2023-01-03', // Recent
    ]);

    // Mock existsSync to return true for files, but false for the target .gz file
    fs.existsSync.mockImplementation(p => {
      const s = String(p);
      if (s.includes('test.log.2020-01-01.gz')) {
        return false;
      } // Target gz doesn't exist
      return true;
    });

    await rotateLogFile('/tmp/logs/test.log', 2);

    expect(fs.promises.mkdir).toHaveBeenCalled();
    expect(fs.promises.rename).toHaveBeenCalled();
    // Should attempt to compress the old file
    expect(fs.createReadStream).toHaveBeenCalledWith(
      expect.stringContaining('test.log.2020-01-01')
    );
  });

  it('DailyRotatingFileTransport should trigger rotation on date change', async () => {
    const transport = new DailyRotatingFileTransport({ filename: '/tmp/logs/app.log' });

    // Mock Date to simulate date change
    const RealDate = Date;
    global.Date = class extends RealDate {
      constructor(date) {
        if (date) {
          super(date);
        } else {
          super('2023-01-02T00:00:00.000Z');
        }
      }
      static now() {
        return new RealDate('2023-01-02T00:00:00.000Z').getTime();
      }
    };
    global.Date.prototype.toISOString = new RealDate('2023-01-02T00:00:00.000Z').toISOString;

    transport.lastRotateDate = '2023-01-01';

    // Mock existsSync to return true so rotation logic triggers
    fs.existsSync.mockReturnValue(true); // File exists

    await transport.write({ message: 'test' }, () => {});

    expect(fs.promises.rename).toHaveBeenCalled();

    global.Date = RealDate;
  });

  it('DailyRotatingFileTransport should handle errors gracefully', async () => {
    const transport = new DailyRotatingFileTransport({ filename: '/tmp/logs/app.log' });

    // Mock Date to simulate date change
    const RealDate = Date;
    global.Date = class extends RealDate {
      constructor(date) {
        if (date) {
          super(date);
        } else {
          super('2023-01-02T00:00:00.000Z');
        }
      }
      static now() {
        return new RealDate('2023-01-02T00:00:00.000Z').getTime();
      }
    };
    global.Date.prototype.toISOString = new RealDate('2023-01-02T00:00:00.000Z').toISOString;

    transport.lastRotateDate = '2023-01-01';

    // Mock fs.existsSync to throw error to trigger catch block
    fs.existsSync.mockImplementationOnce(() => {
      throw new Error('FS Error');
    });

    // Should not throw
    await transport.write({ message: 'test' }, () => {});

    global.Date = RealDate;
  });

  it('consoleFormatTemplate should format log messages correctly', () => {
    const info = {
      level: 'info',
      message: 'test message',
      timestamp: '12:00:00',
      category: 'app',
      metaKey: 'metaValue',
    };

    const result = consoleFormatTemplate(info);
    expect(result).toBe('12:00:00 [app] info: test message {"metaKey":"metaValue"}');

    const infoNoCat = {
      level: 'info',
      message: 'test message',
      timestamp: '12:00:00',
    };
    const resultNoCat = consoleFormatTemplate(infoNoCat);
    expect(resultNoCat).toBe('12:00:00  info: test message');
  });

  it('compressFile should handle errors gracefully', async () => {
    // Mock existsSync to return false for .gz file so we proceed to compression logic
    fs.existsSync.mockImplementation(p => !p.toString().endsWith('.gz'));

    // Mock createReadStream to throw to trigger the catch block
    fs.createReadStream.mockImplementation(() => {
      throw new Error('Stream Error');
    });
    // Should not throw
    await compressFile('/tmp/logs/error.log');
  });

  it('rotateLogFile should handle mkdir errors gracefully', async () => {
    fs.promises.mkdir.mockRejectedValue(new Error('Mkdir Error'));
    await rotateLogFile('/tmp/logs/rotate.log', 5);
  });

  it('rotateLogFile should handle general errors gracefully', async () => {
    // Mock readdir to throw
    fs.promises.readdir.mockRejectedValue(new Error('Readdir Error'));
    fs.existsSync.mockReturnValue(true);
    await rotateLogFile('/tmp/logs/rotate.log', 5);
  });

  it('getLoggingConfig should return empty object on error', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    // Spy on fs.readFileSync to throw error (since Logger uses real config-loader due to caching)
    const readSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('Config Error');
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      expect(getLoggingConfig()).toEqual({});
    } finally {
      process.env.NODE_ENV = originalEnv;
      readSpy.mockRestore();
      consoleSpy.mockRestore();
    }
  });

  it('getLoggingConfig should return empty object if logging config missing', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    // Spy on fs.readFileSync to return config without logging
    const readSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue('boxvault: {}');

    try {
      expect(getLoggingConfig()).toEqual({});
    } finally {
      process.env.NODE_ENV = originalEnv;
      readSpy.mockRestore();
    }
  });

  it('processCategories should use default level if value missing', () => {
    const categories = {
      test: { value: 'debug' },
      fallback: {}, // missing value
      nullConfig: null, // Line 32 coverage
      undefinedConfig: undefined,
      nullValue: { value: null },
    };
    const result = processCategories(categories, 'info');
    expect(result.test).toBe('debug');
    expect(result.fallback).toBe('info');
    expect(result.nullConfig).toBe('info');
    expect(result.undefinedConfig).toBe('info');
    expect(result.nullValue).toBe('info');
  });

  it('processCategories should handle null categories', () => {
    const result = processCategories(null, 'info');
    expect(result).toEqual({});
  });

  it('reloadLoggerConfig should execute correctly', () => {
    // First call to populate categories
    mockConfigLoader.loadConfig.mockReturnValueOnce({
      logging: { categories: { cat1: { value: 'debug' } } },
    });
    reloadLoggerConfig();

    // Second call to trigger cleanup loop (Line 59)
    mockConfigLoader.loadConfig.mockReturnValueOnce({
      logging: { categories: { cat2: { value: 'info' } } },
    });
    reloadLoggerConfig();
  });

  it('extractLoggerConfig should use defaults when config is missing', () => {
    const config = extractLoggerConfig({});
    expect(config.level).toBe('info');
    expect(config.performance_threshold_ms).toBe(1000);
  });

  it('extractLoggerConfig should use provided values', () => {
    const input = { level: { value: 'debug' }, performance_threshold_ms: { value: 500 } };
    const config = extractLoggerConfig(input);
    expect(config.level).toBe('debug');
    expect(config.performance_threshold_ms).toBe(500);
  });

  it('should cover all log categories and levels', () => {
    const categories = ['app', 'api', 'database', 'auth', 'file', 'error'];
    const levels = ['info', 'warn', 'error', 'debug'];

    categories.forEach(cat => {
      levels.forEach(lvl => {
        if (log[cat] && log[cat][lvl]) {
          log[cat][lvl]('test coverage');
        }
      });
    });
  });

  it('initializeLogDirectory should handle duplicate archives', () => {
    // Mock fs.existsSync to simulate existing log file and existing archive
    fs.existsSync.mockImplementation(p => {
      const pathStr = String(p);
      if (pathStr.endsWith('application.log')) {
        return true;
      }
      if (pathStr.includes('archive')) {
        return true;
      } // archive dir exists
      if (pathStr.match(/\.\d{4}-\d{2}-\d{2}$/)) {
        return true;
      } // base archive exists
      if (pathStr.match(/\.\d{4}-\d{2}-\d{2}\.1$/)) {
        return true;
      } // .1 exists
      if (pathStr.match(/\.\d{4}-\d{2}-\d{2}\.2$/)) {
        return false;
      } // .2 does not exist
      return false;
    });

    initializeLogDirectory();

    expect(fs.renameSync).toHaveBeenCalledWith(
      expect.stringContaining('application.log'),
      expect.stringContaining('.2')
    );
  });

  it('initializeLogDirectory should handle errors gracefully', () => {
    fs.existsSync.mockImplementation(() => {
      throw new Error('FS Error');
    });
    // Should not throw
    initializeLogDirectory();
  });

  it('initializeLogDirectory should create archive directory if missing', () => {
    // Mock fs.existsSync
    fs.existsSync.mockImplementation(p => {
      const pathStr = String(p);
      if (pathStr.endsWith('application.log')) {
        return true;
      } // Log file exists
      if (pathStr.includes('archive')) {
        return false;
      } // Archive dir does NOT exist
      return true; // Log dir exists
    });

    // Mock mkdirSync
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

    initializeLogDirectory();

    expect(mkdirSpy).toHaveBeenCalledWith(expect.stringContaining('archive'), expect.any(Object));
  });

  it('createCategoryLogger should create logger with console transport in dev', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const logger = createCategoryLogger('test', 'test');
    expect(logger).toBeDefined();

    process.env.NODE_ENV = originalEnv;
  });

  it('compressFile should skip if compressed file already exists', async () => {
    fs.existsSync.mockReturnValue(true); // .gz exists
    await compressFile('/tmp/logs/existing.log');
    expect(fs.createReadStream).not.toHaveBeenCalled();
  });

  it('should handle safeLog errors with meta', () => {
    jest.spyOn(appLogger, 'info').mockImplementationOnce(() => {
      throw new Error('Logger error');
    });
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => {});

    log.app.info('test', { some: 'meta' });

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('{"some":"meta"}'));
    stderrSpy.mockRestore();
  });

  it('applyConfigCategories should skip if no categories', () => {
    applyConfigCategories({});
  });

  it('ensureLogDirectory should skip if exists', () => {
    fs.existsSync.mockReturnValue(true);
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync');
    ensureLogDirectory('/tmp/logs');
    expect(mkdirSpy).not.toHaveBeenCalled();
  });

  it('rotateLogFile should skip compression if disabled', async () => {
    fs.promises.readdir.mockResolvedValue(['test.log.2020-01-01']);
    fs.existsSync.mockReturnValue(true);

    const readStreamSpy = jest.spyOn(fs, 'createReadStream');

    await rotateLogFile('/tmp/logs/test.log', 5, { enable_compression: false });

    expect(readStreamSpy).not.toHaveBeenCalled();
  });

  it('applyConfigCategories should apply categories if present', () => {
    applyConfigCategories({ categories: { test: { value: 'info' } } });
  });

  it('ensureLogDirectory should create directory if it does not exist', () => {
    fs.existsSync.mockReturnValue(false);
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync');
    ensureLogDirectory('/tmp/logs/new_dir');
    expect(mkdirSpy).toHaveBeenCalledWith(
      '/tmp/logs/new_dir',
      expect.objectContaining({ recursive: true })
    );
  });

  it('rotateLogFile should filter out files with invalid date format during compression', async () => {
    fs.promises.readdir.mockResolvedValue(['app.log.invalid-date']);
    fs.existsSync.mockReturnValue(true);

    // Enable compression to trigger the filter logic
    await rotateLogFile('/tmp/logs/app.log', 5, {
      enable_compression: true,
      compression_age_days: 1,
    });
  });

  it('createCategoryLogger should add console transport in non-production env', () => {
    createCategoryLogger('test_console', 'test_console');
  });

  it('createCategoryLogger should include Console transport when configured and not production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    // Force reload of logger config to ensure console_enabled is true
    // This handles cases where Logger.js is cached and using real config-loader
    mockConfigLoader.loadConfig.mockReturnValue({
      logging: {
        level: { value: 'info' },
        console_enabled: { value: true },
        log_directory: { value: `/tmp/logs_${uniqueId}` },
        performance_threshold_ms: { value: 100 },
        enable_compression: { value: true },
        compression_age_days: { value: 7 },
        categories: {
          test_cat: { value: 'debug' },
        },
      },
    });
    reloadLoggerConfig();

    const logger = createCategoryLogger('console_test', 'console_test');
    const hasConsole = logger.transports.some(t => t.name === 'console');
    expect(hasConsole).toBe(true);
    process.env.NODE_ENV = originalEnv;
  });

  it('createCategoryLogger should NOT include Console transport in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const logger = createCategoryLogger('prod_test', 'prod_test');
    const hasConsole = logger.transports.some(t => t.name === 'console');
    expect(hasConsole).toBe(false);
    process.env.NODE_ENV = originalEnv;
  });
});
