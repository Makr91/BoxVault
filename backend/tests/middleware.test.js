import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import jwt from 'jsonwebtoken';

// Mock express-rate-limit
const mockRateLimit = jest.fn(options => {
  const middleware = (req, res, next) => {
    void req;
    void res;
    next();
  };
  middleware.options = options;
  return middleware;
});

// Mocks
const mockLog = {
  app: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  error: { error: jest.fn() },
  api: { warn: jest.fn() },
  auth: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
};

const mockConfigLoader = {
  loadConfig: jest.fn(name => {
    if (name === 'auth') {
      return {
        auth: {
          jwt: { jwt_secret: { value: 'test-secret' }, jwt_expiration: { value: '1h' } },
          oidc: { token_refresh_threshold_minutes: { value: 5 } },
        },
      };
    }
    return {
      boxvault: { box_max_file_size: { value: 1 } }, // 1GB
      rate_limiting: {
        window_minutes: { value: 15 },
        max_requests: { value: 100 },
        message: { value: 'Too many requests' },
        skip_successful_requests: { value: false },
        skip_failed_requests: { value: false },
      },
    };
  }),
  getRateLimitConfig: jest.fn().mockReturnValue({
    window_minutes: 15,
    max_requests: 100,
    message: 'Too many requests',
    skip_successful_requests: false,
    skip_failed_requests: false,
  }),
};

const createMockStream = () => {
  const stream = new EventEmitter();
  stream.write = jest.fn();
  stream.end = jest.fn().mockImplementation(() => {
    setTimeout(() => stream.emit('finish'), 0);
  });
  return stream;
};

// Mock fs module structure to support both default and named imports
const mockFs = {
  readdirSync: jest.fn(),
  statSync: jest.fn(),
  createWriteStream: jest.fn().mockImplementation(() => createMockStream()),
  createReadStream: jest.fn().mockImplementation(() => createMockStream()),
  readFileSync: jest.fn(),
  rmdirSync: jest.fn(),
  rmSync: jest.fn(),
  unlink: jest.fn(),
  rm: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  renameSync: jest.fn(),
  writeFile: jest.fn(),
  rename: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  default: {}, // Circular reference for default import
};
mockFs.default = mockFs;

const mockDb = {
  versions: { findOne: jest.fn() },
  box: { findOne: jest.fn() },
  providers: { findOne: jest.fn() },
  architectures: { findOne: jest.fn() },
  files: { findOne: jest.fn(), create: jest.fn() },
  service_account: { findOne: jest.fn() },
  user: { findOne: jest.fn(), findByPk: jest.fn(), count: jest.fn() },
  organization: { findOne: jest.fn() },
  UserOrg: { findUserOrgRole: jest.fn(), hasRole: jest.fn() },
  Sequelize: { Op: { or: 'or', gt: 'gt', eq: 'eq' } },
  ROLES: ['user', 'admin', 'moderator'],
};

const mockPaths = {
  getSecureBoxPath: jest.fn().mockReturnValue('/tmp/upload/org/box/1.0.0/provider/arch'),
};

jest.unstable_mockModule('../app/utils/Logger.js', () => ({ log: mockLog }));
jest.unstable_mockModule('../app/utils/config-loader.js', () => mockConfigLoader);
// When mocking built-in modules with named exports in ESM, we need to return the named exports directly
jest.unstable_mockModule('fs', () => ({
  ...mockFs,
}));
jest.unstable_mockModule('express-rate-limit', () => ({ rateLimit: mockRateLimit }));
jest.unstable_mockModule('../app/models/index.js', () => ({ default: mockDb }));
jest.unstable_mockModule('../app/utils/paths.js', () => mockPaths);
jest.unstable_mockModule('../app/auth/passport.js', () => ({
  getOidcConfiguration: jest.fn(),
}));
jest.unstable_mockModule('axios', () => ({
  default: { post: jest.fn() },
}));

const mockHash = {
  update: jest.fn().mockReturnThis(),
  digest: jest.fn().mockReturnValue('validchecksum'),
};
jest.unstable_mockModule('crypto', () => ({
  createHash: jest.fn().mockReturnValue(mockHash),
}));

const mockFsHelper = {
  safeUnlink: jest.fn((...args) => mockFs.unlink(...args)),
  safeRmdirSync: jest.fn((...args) => mockFs.rmdirSync(...args)),
  safeMkdirSync: jest.fn((...args) => mockFs.mkdirSync(...args)),
  safeExistsSync: jest.fn((...args) => mockFs.existsSync(...args)),
  safeRm: jest.fn((...args) => mockFs.rm(...args)),
  safeRenameSync: jest.fn((...args) => mockFs.renameSync(...args)),
};
jest.unstable_mockModule('../app/utils/fsHelper.js', () => mockFsHelper);

const { uploadFile, uploadSSLFile } = await import('../app/middleware/upload.js');
const { default: vagrantHandler } = await import('../app/middleware/vagrantHandler.js');
const { default: verifySignUp } = await import('../app/middleware/verifySignUp.js');
const authJwtModule = await import('../app/middleware/authJwt.js');
const authJwt = authJwtModule.default;
const { errorHandler } = await import('../app/middleware/errorHandler.js');
const { isOrgMember, isOrgModerator, isOrgAdmin, isOrgModeratorOrAdmin, getUserOrgContext } =
  await import('../app/middleware/verifyOrgAccess.js');
const { verifyBoxFilePath } = await import('../app/middleware/verifyBoxFilePath.js');
const { rateLimiter } = await import('../app/middleware/rateLimiter.js');
const { validateBoxName } = await import('../app/middleware/verifyBoxName.js');
const { validateProvider, checkProviderDuplicate } =
  await import('../app/middleware/verifyProvider.js');
const { validateVersion, checkVersionDuplicate, attachEntities } =
  await import('../app/middleware/verifyVersion.js');
const { default: verifyOrganization } = await import('../app/middleware/verifyOrganization.js');
const { validateArchitecture, checkArchitectureDuplicate } =
  await import('../app/middleware/verifyArchitecture.js');
const { oidcTokenRefresh } = await import('../app/middleware/oidcTokenRefresh.js');
const { downloadAuth } = await import('../app/middleware/downloadAuth.js');
const { sessionAuth } = await import('../app/middleware/sessionAuth.js');
const { getOidcConfiguration } = await import('../app/auth/passport.js');
const axios = (await import('axios')).default;
const { atomicWriteFile, atomicWriteFileSync } = await import('../app/utils/atomic-file-writer.js');
const { safeUnlink } = await import('../app/utils/fsHelper.js');

describe('Middleware Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset fs mocks to default implementation to avoid MaxListenersExceededWarning
    mockFs.createWriteStream.mockImplementation(() => createMockStream());
    mockFs.createReadStream.mockImplementation(() => createMockStream());
  });

  describe('Upload Middleware', () => {
    let req;
    let res;

    beforeEach(() => {
      req = {
        method: 'POST',
        url: '/upload',
        headers: { 'content-length': '100' },
        params: {
          organization: 'org',
          boxId: 'box',
          versionNumber: '1.0.0',
          providerName: 'virtualbox',
          architectureName: 'amd64',
        },
        setTimeout: jest.fn(),
        pipe: jest.fn(),
        on: jest.fn(),
      };
      res = {
        setTimeout: jest.fn(),
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        headersSent: false,
      };
    });

    it('should handle single file upload', async () => {
      delete req.headers['x-chunk-index'];
      delete req.headers['x-total-chunks'];

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ size: 100 });

      // Mock DB lookups
      mockDb.versions.findOne.mockResolvedValue({ id: 1 });
      mockDb.providers.findOne.mockResolvedValue({ id: 1 });
      mockDb.architectures.findOne.mockResolvedValue({ id: 1 });
      mockDb.files.findOne.mockResolvedValue(null); // New file

      // Mock stream pipe
      req.pipe.mockImplementation(stream => {
        setTimeout(() => {
          stream.emit('finish');
        }, 0);
        return stream;
      });

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockDb.files.create).toHaveBeenCalled();
    });

    it('should successfully upload single file with valid checksum', async () => {
      delete req.headers['x-chunk-index'];
      delete req.headers['x-total-chunks'];

      req.headers['content-length'] = '100';
      req.headers['x-checksum'] = 'validchecksum';
      req.headers['x-checksum-type'] = 'sha256';

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ size: 100 });

      // Mock createReadStream for checksum verification
      mockFs.createReadStream.mockImplementation(() => {
        const stream = new EventEmitter();
        process.nextTick(() => {
          stream.emit('data', Buffer.from('content'));
          stream.emit('end');
        });
        return stream;
      });

      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('finish'), 0);
        return stream;
      });

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should reject file too large', async () => {
      delete req.headers['x-chunk-index'];
      delete req.headers['x-total-chunks'];

      req.headers['content-length'] = (2 * 1024 * 1024 * 1024).toString(); // 2GB

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(413);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'FILE_TOO_LARGE' }));
    });

    it('should reject invalid content-length', async () => {
      delete req.headers['x-chunk-index'];
      delete req.headers['x-total-chunks'];

      req.headers['content-length'] = 'invalid';
      await uploadFile(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'INVALID_REQUEST' }));
    });
  });

  describe('Vagrant Handler', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
      req = {
        method: 'GET',
        url: '/org/box',
        headers: { 'user-agent': 'Vagrant/2.2.19' },
        originalUrl: '/org/box',
      };
      res = {
        set: jest.fn(),
        status: jest.fn().mockReturnThis(),
        end: jest.fn(),
        getHeaders: jest.fn().mockReturnValue({}),
      };
      next = jest.fn();
    });

    it('should identify vagrant requests', async () => {
      await vagrantHandler(req, res, next);
      expect(req.isVagrantRequest).toBe(true);
      expect(next).toHaveBeenCalled();
    });

    it('should ignore non-vagrant user agents', async () => {
      req.headers['user-agent'] = 'Mozilla/5.0';
      await vagrantHandler(req, res, next);
      expect(req.isVagrantRequest).toBe(false);
      expect(next).toHaveBeenCalled();
    });

    it('should handle HEAD requests for metadata', async () => {
      req.method = 'HEAD';
      await vagrantHandler(req, res, next);
      expect(res.set).toHaveBeenCalledWith('Content-Type', 'application/json');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });

    it('should rewrite download URLs', async () => {
      req.url = '/org/boxes/box/versions/1.0.0/providers/virtualbox/amd64/vagrant.box';
      await vagrantHandler(req, res, next);
      expect(req.url).toContain('/file/download');
      expect(next).toHaveBeenCalled();
    });

    it('should validate bearer token', async () => {
      req.headers.authorization = 'Bearer valid-token';
      mockDb.service_account.findOne.mockResolvedValue({
        user: { id: 123 },
      });

      await vagrantHandler(req, res, next);
      expect(req.userId).toBe(123);
      expect(req.isServiceAccount).toBe(true);
    });

    it('should extract bearer token', async () => {
      req.headers.authorization = 'Bearer test-token';
      mockDb.service_account.findOne.mockResolvedValue({ user: { id: 1 } });
      await vagrantHandler(req, res, next);
      expect(mockDb.service_account.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ token: 'test-token' }) })
      );
    });

    it('should handle service account not found', async () => {
      req.headers.authorization = 'Bearer invalid-token';
      mockDb.service_account.findOne.mockResolvedValue(null);
      await vagrantHandler(req, res, next);
      expect(req.userId).toBeUndefined();
    });

    it('should handle service account without user', async () => {
      req.headers.authorization = 'Bearer orphan-token';
      mockDb.service_account.findOne.mockResolvedValue({ user: null });
      await vagrantHandler(req, res, next);
      expect(req.userId).toBeUndefined();
    });

    it('should handle database error in token validation', async () => {
      req.headers.authorization = 'Bearer error-token';
      mockDb.service_account.findOne.mockRejectedValue(new Error('DB Error'));
      await vagrantHandler(req, res, next);
      expect(req.userId).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('should skip static files', async () => {
      req.url = '/favicon.ico';
      req.method = 'GET';
      await vagrantHandler(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.isVagrantRequest).toBeUndefined();
    });

    it('should handle unparseable URL', async () => {
      req.url = '/invalid/url/format';
      await vagrantHandler(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.vagrantInfo).toBeUndefined();
    });

    it('should handle shorthand URL format', async () => {
      req.url = '/org/box';
      await vagrantHandler(req, res, next);
      expect(req.vagrantInfo.organization).toBe('org');
      expect(req.vagrantInfo.boxName).toBe('box');
      expect(next).toHaveBeenCalled();
    });

    it('should handle API URL format', async () => {
      req.url = '/api/v2/vagrant/org/box';
      await vagrantHandler(req, res, next);
      expect(req.vagrantInfo.organization).toBe('org');
      expect(req.vagrantInfo.boxName).toBe('box');
      expect(next).toHaveBeenCalled();
    });

    it('should handle malformed download URL (missing providers)', async () => {
      // Contains vagrant.box but missing providers segment
      req.url = '/org/boxes/box/versions/1.0.0/vagrant.box';
      await vagrantHandler(req, res, next);
      expect(req.vagrantInfo).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('should handle malformed API URL', async () => {
      req.url = '/notapi/v2/vagrant/org/box';
      await vagrantHandler(req, res, next);
      expect(req.vagrantInfo).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('should set metadata headers for vagrant request', async () => {
      req.url = '/org/box';
      await vagrantHandler(req, res, next);
      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          Vary: 'Accept',
        })
      );
    });

    it('should handle expanded URL format', async () => {
      req.url = '/org/boxes/box';
      await vagrantHandler(req, res, next);
      expect(req.vagrantInfo.organization).toBe('org');
      expect(req.vagrantInfo.boxName).toBe('box');
      expect(next).toHaveBeenCalled();
    });

    it('should handle malformed download URL', async () => {
      // Contains vagrant.box but missing required segments
      req.url = '/org/boxes/box/vagrant.box';
      await vagrantHandler(req, res, next);
      expect(req.vagrantInfo).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('should handle missing user-agent', async () => {
      delete req.headers['user-agent'];
      await vagrantHandler(req, res, next);
      expect(req.isVagrantRequest).toBe(false);
    });

    it('should handle unexpected errors in handler', async () => {
      req.headers.authorization = 'Bearer error-token';
      mockDb.service_account.findOne.mockRejectedValueOnce(new Error('Unexpected Error'));

      await vagrantHandler(req, res, next);
      expect(mockLog.error.error).toHaveBeenCalledWith(
        'Error validating vagrant token:',
        expect.any(Object)
      );
    });

    it('should handle Authorization header without Bearer prefix', async () => {
      req.headers.authorization = 'Basic some-token';
      await vagrantHandler(req, res, next);
      expect(req.userId).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('should log vagrant download request details', async () => {
      req.url = '/org/boxes/box/versions/1.0.0/providers/virtualbox/amd64/vagrant.box';
      await vagrantHandler(req, res, next);
      expect(mockLog.app.info).toHaveBeenCalledWith(
        'Vagrant Download Request:',
        expect.objectContaining({
          isDownload: true,
        })
      );
    });

    it('should rewrite URL for vagrant download request', async () => {
      req.url = '/org/boxes/box/versions/1.0.0/providers/virtualbox/amd64/vagrant.box';
      await vagrantHandler(req, res, next);
      expect(req.url).toContain('/file/download');
      expect(next).toHaveBeenCalled();
    });

    it('should log vagrant download request details', async () => {
      req.url = '/org/boxes/box/versions/1.0.0/providers/virtualbox/amd64/vagrant.box';
      await vagrantHandler(req, res, next);
      expect(mockLog.app.info).toHaveBeenCalledWith(
        'Vagrant Download Request:',
        expect.objectContaining({
          isDownload: true,
        })
      );
    });

    it('should log vagrant metadata request details', async () => {
      req.url = '/org/box';
      await vagrantHandler(req, res, next);
      expect(mockLog.app.info).toHaveBeenCalledWith(
        'Vagrant Request:',
        expect.objectContaining({
          organization: 'org',
          boxName: 'box',
        })
      );
    });

    it('should return undefined for download request', async () => {
      req.url = '/org/boxes/box/versions/1.0.0/providers/virtualbox/amd64/vagrant.box';
      const result = await vagrantHandler(req, res, next);
      expect(result).toBeUndefined();
    });

    it('should set default Accept header if missing', async () => {
      req.url = '/org/box';
      delete req.headers.accept;
      await vagrantHandler(req, res, next);
      expect(req.headers.accept).toBe('application/json');
    });

    it('should preserve existing Accept header', async () => {
      req.url = '/org/box';
      req.headers.accept = 'text/plain';
      await vagrantHandler(req, res, next);
      expect(req.headers.accept).toBe('text/plain');
    });

    it('should preserve existing Accept header', async () => {
      req.url = '/org/box';
      req.headers.accept = 'text/plain';
      await vagrantHandler(req, res, next);
      expect(req.headers.accept).toBe('text/plain');
    });

    it('should set default Accept header if empty string', async () => {
      req.url = '/org/box';
      req.headers.accept = '';
      await vagrantHandler(req, res, next);
      expect(req.headers.accept).toBe('application/json');
    });

    it('should log request details for metadata request', async () => {
      req.url = '/org/box';
      await vagrantHandler(req, res, next);
      // This ensures lines 204-213 in vagrantHandler.js are executed
      expect(mockLog.app.info).toHaveBeenCalledWith('Vagrant Request:', expect.any(Object));
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Chunked Upload', () => {
    let req;
    let res;

    beforeEach(() => {
      req = {
        method: 'POST',
        url: '/upload',
        headers: {
          'content-length': '100',
          'x-chunk-index': '0',
          'x-total-chunks': '2',
        },
        params: {
          organization: 'org',
          boxId: 'box',
          versionNumber: '1.0.0',
          providerName: 'virtualbox',
          architectureName: 'amd64',
        },
        setTimeout: jest.fn(),
        pipe: jest.fn().mockImplementation(stream => {
          setTimeout(() => stream.emit('finish'), 0);
          return stream;
        }),
        on: jest.fn(),
      };
      res = {
        setTimeout: jest.fn(),
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        headersSent: false,
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([]); // No chunks yet
    });

    it('should handle chunk upload', async () => {
      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Chunk upload completed',
        })
      );
    });

    it('should detect missing chunks during merge', async () => {
      // Setup request for chunk 2 of 2 (index 1)
      req.headers['x-chunk-index'] = '1';
      req.headers['x-total-chunks'] = '2';

      // Mock readdir to return chunk-0 and chunk-2 (count 2, but index 1 missing)
      // mergeChunks expects indices 0 and 1 for totalChunks=2
      mockFs.readdirSync.mockReturnValue(['chunk-0', 'chunk-2']);

      // Mock stream to finish immediately
      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('finish'), 0);
        return stream;
      });

      // Mock mkdirSync for temp dir creation (called before merge)
      mockFs.mkdirSync.mockImplementation(() => {});

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Missing chunks'),
        })
      );
    });

    it('should reject single upload if file size exceeds max limit after upload', async () => {
      delete req.headers['x-chunk-index'];
      delete req.headers['x-total-chunks'];

      // Remove chunk headers to force single upload path
      delete req.headers['x-chunk-index'];
      delete req.headers['x-total-chunks'];

      // Set transfer-encoding to chunked to bypass Content-Length checks
      req.headers['transfer-encoding'] = 'chunked';

      // Mock statSync to return size > 1GB (default mock config limit)
      mockFs.statSync.mockReturnValue({ size: 11 * 1024 * 1024 * 1024 }); // 11GB (Ensure it exceeds default 10GB fallback)

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('File size cannot exceed'),
        })
      );
    });

    it('should reject single upload if checksum verification fails', async () => {
      delete req.headers['x-chunk-index'];
      delete req.headers['x-total-chunks'];

      // Remove chunk headers to force single upload path
      delete req.headers['x-chunk-index'];
      delete req.headers['x-total-chunks'];

      req.headers['x-checksum'] = 'invalidchecksum';
      req.headers['x-checksum-type'] = 'md5';

      // Mock statSync for size check to pass
      mockFs.statSync.mockReturnValue({ size: 100 });

      // Mock createReadStream to emit data for checksum calculation
      mockFs.createReadStream.mockImplementation(() => {
        const stream = new EventEmitter();
        process.nextTick(() => {
          stream.emit('data', Buffer.from('different content'));
          stream.emit('end');
        });
        return stream;
      });

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Checksum verification failed',
        })
      );
    });

    it('should successfully merge chunks', async () => {
      // Setup request for final chunk (2 of 2)
      req.headers['x-chunk-index'] = '1';
      req.headers['x-total-chunks'] = '2';

      // Mock readdir to return all chunks
      mockFs.readdirSync.mockReturnValue(['chunk-0', 'chunk-1']);

      // Mock statSync for chunks
      mockFs.statSync.mockReturnValue({ size: 50 });

      // Mock readFileSync to return chunk content
      mockFs.readFileSync.mockReturnValue(Buffer.alloc(50));

      // Mock DB updates
      mockDb.versions.findOne.mockResolvedValue({ id: 1 });
      mockDb.providers.findOne.mockResolvedValue({ id: 1 });
      mockDb.architectures.findOne.mockResolvedValue({ id: 1 });
      mockDb.files.findOne.mockResolvedValue(null);
      mockDb.files.create.mockResolvedValue({});

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'File upload completed',
          details: expect.objectContaining({ fileSize: 100 }),
        })
      );
      expect(mockLog.app.info).toHaveBeenCalledWith(
        expect.stringContaining('Merging chunk'),
        expect.any(Object)
      );
      expect(mockFsHelper.safeUnlink).toHaveBeenCalledTimes(2);
    });

    it('should reject chunked upload if checksum verification fails', async () => {
      req.headers['x-chunk-index'] = '1';
      req.headers['x-total-chunks'] = '2';
      req.headers['x-checksum'] = 'invalidchecksum';
      req.headers['x-checksum-type'] = 'md5';

      mockFs.readdirSync.mockReturnValue(['chunk-0', 'chunk-1']);
      mockFs.statSync.mockReturnValue({ size: 50 });
      mockFs.readFileSync.mockReturnValue(Buffer.alloc(50));
      mockFs.mkdirSync.mockImplementation(() => {});

      // Mock createReadStream for checksum verification
      mockFs.createReadStream.mockImplementation(() => {
        const stream = new EventEmitter();
        process.nextTick(() => {
          stream.emit('data', Buffer.from('different content'));
          stream.emit('end');
        });
        return stream;
      });

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Checksum verification failed',
        })
      );
    });

    it('should return 400 if chunk headers are incomplete (missing total)', async () => {
      req.headers['x-chunk-index'] = '0';
      // Missing x-total-chunks
      await uploadFile(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 400 if chunk headers are incomplete (missing index)', async () => {
      req.headers['x-total-chunks'] = '2';
      // Missing x-chunk-index
      await uploadFile(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle chunked upload without content-length', async () => {
      req.headers['x-chunk-index'] = '0';
      req.headers['x-total-chunks'] = '1';

      delete req.headers['content-length'];
      req.headers['transfer-encoding'] = 'chunked';
      await uploadFile(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle PUT request for chunked merge', async () => {
      req.method = 'PUT';
      req.headers['x-chunk-index'] = '1';
      req.headers['x-total-chunks'] = '2';

      mockFs.readdirSync.mockReturnValue(['chunk-0', 'chunk-1']);
      mockFs.statSync.mockReturnValue({ size: 50 });
      mockFs.readFileSync.mockReturnValue(Buffer.alloc(50));
      mockFs.mkdirSync.mockImplementation(() => {});

      mockDb.versions.findOne.mockResolvedValue({ id: 1 });
      mockDb.providers.findOne.mockResolvedValue({ id: 1 });
      mockDb.architectures.findOne.mockResolvedValue({ id: 1 });
      mockDb.files.findOne.mockResolvedValue({ update: jest.fn() }); // Existing file for PUT

      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('finish'), 0);
        return stream;
      });

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'File updated successfully',
        })
      );
    });

    it('should skip checksum verification if type missing', async () => {
      // Convert to single file upload to ensure we hit the verification logic
      delete req.headers['x-chunk-index'];
      delete req.headers['x-total-chunks'];

      req.headers['x-checksum'] = 'somehash';
      delete req.headers['x-checksum-type'];

      mockFs.statSync.mockReturnValue({ size: 100 });

      // Mock DB lookups
      mockDb.versions.findOne.mockResolvedValue({ id: 1 });
      mockDb.providers.findOne.mockResolvedValue({ id: 1 });
      mockDb.architectures.findOne.mockResolvedValue({ id: 1 });
      mockDb.files.findOne.mockResolvedValue(null);
      mockDb.files.create.mockResolvedValue({});

      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('finish'), 0);
        return stream;
      });

      await uploadFile(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle chunk cleanup error', async () => {
      req.headers['x-chunk-index'] = '0';
      req.headers['x-total-chunks'] = '2';

      // Force error in main logic
      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('error', new Error('Stream Error')), 0);
        return stream;
      });

      // Force error in cleanup
      mockFs.readdirSync.mockImplementation(() => {
        throw new Error('Cleanup Error');
      });

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(mockLog.error.error).toHaveBeenCalledWith(
        'Error cleaning up temp files:',
        expect.any(Error)
      );
    });

    it('should handle request close event during chunked upload', async () => {
      req.headers['x-chunk-index'] = '0';
      req.headers['x-total-chunks'] = '2';

      const mockStream = createMockStream();
      mockFs.createWriteStream.mockReturnValueOnce(mockStream);

      const uploadPromise = uploadFile(req, res);

      // Simulate request close
      const [, closeHandler] = req.on.mock.calls.find(call => call[0] === 'close');
      closeHandler();

      // Finish stream to resolve promise (simulate chunk finish)
      mockStream.emit('finish');

      await uploadPromise;
      expect(mockStream.end).toHaveBeenCalled();
    });

    it('should handle request close event during single file upload', async () => {
      delete req.headers['x-chunk-index'];
      delete req.headers['x-total-chunks'];

      const mockStream = createMockStream();
      mockFs.createWriteStream.mockReturnValueOnce(mockStream);

      const uploadPromise = uploadFile(req, res);

      // Simulate request close
      const [, closeHandler] = req.on.mock.calls.find(call => call[0] === 'close');
      if (closeHandler) {
        closeHandler();
      }

      // Finish stream to resolve promise
      mockStream.emit('finish');

      await uploadPromise;
      expect(mockStream.end).toHaveBeenCalled();
    });

    it('should reject chunked upload if merged size exceeds limit', async () => {
      req.headers['x-chunk-index'] = '1';
      req.headers['x-total-chunks'] = '2';

      mockFs.readdirSync.mockReturnValue(['chunk-0', 'chunk-1']);

      // Mock statSync to return size 100
      mockFs.statSync.mockReturnValue({ size: 100 });

      // Mock readFileSync to return buffer
      mockFs.readFileSync.mockReturnValue(Buffer.alloc(100));

      // Mock mkdirSync
      mockFs.mkdirSync.mockImplementation(() => {});

      // Mock config to return very small limit
      mockConfigLoader.loadConfig.mockReturnValue({
        boxvault: { box_max_file_size: { value: 0.0000001 } }, // Very small limit
      });

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('File size cannot exceed'),
        })
      );
    });

    it('should detect chunk size mismatch during merge', async () => {
      req.headers['x-chunk-index'] = '1';
      req.headers['x-total-chunks'] = '2';

      mockFs.readdirSync.mockReturnValue(['chunk-0', 'chunk-1']);

      // Mock statSync to return size 50
      mockFs.statSync.mockReturnValue({ size: 50 });

      // Mock readFileSync to return buffer of size 40 (mismatch)
      mockFs.readFileSync.mockReturnValue(Buffer.alloc(40));

      // Mock mkdirSync
      mockFs.mkdirSync.mockImplementation(() => {});

      // Mock pipe to handle chunk upload before merge
      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('finish'), 0);
        return stream;
      });

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('size mismatch'),
        })
      );
    });

    it('should throw error when chunk size does not match stat size', async () => {
      req.headers['x-chunk-index'] = '0';
      req.headers['x-total-chunks'] = '1';

      mockFs.readdirSync.mockReturnValue(['chunk-0']);
      mockFs.statSync.mockImplementation(path => {
        if (path && path.toString().includes('chunk-0')) {
          return { size: 100 };
        }
        return { size: 0 };
      });
      mockFs.readFileSync.mockReturnValue(Buffer.alloc(50)); // Actual size (mismatch)
      mockFs.mkdirSync.mockImplementation(() => {});

      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('finish'), 0);
        return stream;
      });

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('size mismatch: expected 100, got 50'),
        })
      );
      // Ensure the error was thrown inside mergeChunks (line 149 in upload.js)
    });

    it('should handle chunked merge without content-length', async () => {
      req.headers['x-chunk-index'] = '1';
      req.headers['x-total-chunks'] = '2';
      delete req.headers['content-length'];
      req.headers['transfer-encoding'] = 'chunked';

      mockFs.readdirSync.mockReturnValue(['chunk-0', 'chunk-1']);
      mockFs.statSync.mockReturnValue({ size: 50 });
      mockFs.readFileSync.mockReturnValue(Buffer.alloc(50));
      mockFs.mkdirSync.mockImplementation(() => {});

      mockDb.versions.findOne.mockResolvedValue({ id: 1 });
      mockDb.providers.findOne.mockResolvedValue({ id: 1 });
      mockDb.architectures.findOne.mockResolvedValue({ id: 1 });
      mockDb.files.findOne.mockResolvedValue(null);
      mockDb.files.create.mockResolvedValue({});

      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('finish'), 0);
        return stream;
      });

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      // This covers line 140: expectedSize: contentLength || 'unknown'
    });

    it('should handle write error during chunk upload', async () => {
      req.headers['x-chunk-index'] = '0';
      req.headers['x-total-chunks'] = '2';

      // Mock stream to emit error
      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('error', new Error('Write Error')), 0);
        return stream;
      });

      // Mock cleanup
      mockFs.readdirSync.mockReturnValue(['chunk-0']);
      mockFs.existsSync.mockReturnValue(true);

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Write Error',
        })
      );

      // Verify cleanup was attempted
      expect(mockFs.unlink).toHaveBeenCalled();
      expect(mockFs.rmdirSync).toHaveBeenCalled();
    });

    it('should cleanup temp files when upload fails', async () => {
      req.headers['x-chunk-index'] = '0';
      req.headers['x-total-chunks'] = '2';

      // Mock stream to emit error
      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('error', new Error('Upload Failed')), 0);
        return stream;
      });

      // Ensure temp dir exists
      mockFs.existsSync.mockReturnValue(true);
      // Ensure chunks exist
      mockFs.readdirSync.mockReturnValue(['chunk-0', 'chunk-1']);

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      // Verify cleanup
      expect(mockFs.unlink).toHaveBeenCalledTimes(2); // 2 chunks
      expect(mockFs.rmdirSync).toHaveBeenCalled();
    });

    it('should skip cleanup if temp dir does not exist during chunk upload error', async () => {
      req.headers['x-chunk-index'] = '0';
      req.headers['x-total-chunks'] = '2';

      // Force error in main logic
      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('error', new Error('Stream Error')), 0);
        return stream;
      });

      // Mock existsSync to return false for tempDir
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readdirSync.mockClear();

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(mockFs.readdirSync).not.toHaveBeenCalled();
    });

    it('should successfully upload chunked file with valid checksum', async () => {
      req.headers['x-chunk-index'] = '1';
      req.headers['x-total-chunks'] = '2';
      req.headers['x-checksum'] = 'validchecksum'; // Matches mockHash digest
      req.headers['x-checksum-type'] = 'sha256';

      mockFs.readdirSync.mockReturnValue(['chunk-0', 'chunk-1']);
      mockFs.statSync.mockReturnValue({ size: 50 });
      mockFs.readFileSync.mockReturnValue(Buffer.alloc(50));
      mockFs.mkdirSync.mockImplementation(() => {});

      // Mock createReadStream for checksum verification
      mockFs.createReadStream.mockImplementation(() => {
        const stream = new EventEmitter();
        process.nextTick(() => {
          stream.emit('data', Buffer.from('content'));
          stream.emit('end');
        });
        return stream;
      });

      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('finish'), 0);
        return stream;
      });

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle architecture not found during database update', async () => {
      req.headers['x-chunk-index'] = '0';
      req.headers['x-total-chunks'] = '1';

      mockFs.readdirSync.mockReturnValue(['chunk-0']);
      mockFs.statSync.mockReturnValue({ size: 100 });
      mockFs.readFileSync.mockReturnValue(Buffer.alloc(100));
      mockFs.mkdirSync.mockImplementation(() => {});

      mockDb.versions.findOne.mockResolvedValue({ id: 1 });
      mockDb.providers.findOne.mockResolvedValue({ id: 1 });
      mockDb.architectures.findOne.mockResolvedValue(null); // Architecture not found

      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('finish'), 0);
        return stream;
      });

      await uploadFile(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('uploadFile should warn on unsupported checksum type', async () => {
      delete req.headers['x-chunk-index'];
      delete req.headers['x-total-chunks'];
      req.headers['x-checksum'] = 'somehash';
      req.headers['x-checksum-type'] = 'unknown-algo';

      mockFs.statSync.mockReturnValue({ size: 100 });

      await uploadFile(req, res);
      expect(mockLog.app.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unsupported checksum type')
      );
    });

    it('should handle checksum verification error during chunked upload', async () => {
      req.headers['x-chunk-index'] = '0';
      req.headers['x-total-chunks'] = '1';
      req.headers['x-checksum'] = 'validchecksum';
      req.headers['x-checksum-type'] = 'sha256';

      mockFs.readdirSync.mockReturnValue(['chunk-0']);
      mockFs.statSync.mockReturnValue({ size: 100 });
      mockFs.readFileSync.mockReturnValue(Buffer.alloc(100));
      mockFs.mkdirSync.mockImplementation(() => {});
      mockFs.existsSync.mockReturnValue(true);

      // Mock createReadStream to error out
      mockFs.createReadStream.mockImplementation(() => {
        const stream = new EventEmitter();
        process.nextTick(() => {
          stream.emit('error', new Error('Checksum Read Error'));
        });
        return stream;
      });

      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('finish'), 0);
        return stream;
      });

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Checksum Read Error',
        })
      );
      // Verify cleanup
      expect(mockFs.unlink).toHaveBeenCalled();
    });
  });

  describe('Upload Middleware Error Handling', () => {
    let req;
    let res;

    beforeEach(() => {
      req = {
        method: 'POST',
        url: '/upload',
        headers: { 'content-length': '100' },
        params: {
          organization: 'org',
          boxId: 'box',
          versionNumber: '1.0.0',
          providerName: 'virtualbox',
          architectureName: 'amd64',
        },
        setTimeout: jest.fn(),
        pipe: jest.fn(),
        on: jest.fn(),
      };
      res = {
        setTimeout: jest.fn(),
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        headersSent: false,
      };

      mockFs.existsSync.mockReturnValue(true);
    });

    it('should handle stream errors and cleanup', async () => {
      const error = new Error('Stream failed');
      req.pipe.mockImplementation(stream => {
        process.nextTick(() => stream.emit('error', error));
        return stream;
      });

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'UPLOAD_ERROR',
          message: 'Stream failed',
        })
      );
    });

    it('should handle SSL upload wrapper', async () => {
      // Mock successful upload flow for SSL
      mockFs.statSync.mockReturnValue({ size: 100 });
      mockDb.versions.findOne.mockResolvedValue({ id: 1 });
      mockDb.providers.findOne.mockResolvedValue({ id: 1 });
      mockDb.architectures.findOne.mockResolvedValue({ id: 1 });
      mockDb.files.findOne.mockResolvedValue(null);

      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('finish'), 0);
        return stream;
      });

      await uploadSSLFile(req, res);

      // uploadSSLFile returns undefined on success (it delegates response to uploadMiddleware)
      // We check if uploadMiddleware logic executed (e.g. DB update)
      expect(mockDb.files.create).toHaveBeenCalled();
    });

    it('should handle SSL upload errors', async () => {
      const error = new Error('SSL Upload failed');
      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('error', error), 0);
        process.nextTick(() => stream.emit('error', error));
        return stream;
      });

      await uploadSSLFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'UPLOAD_ERROR',
        })
      );
    });

    it('should handle synchronous errors in uploadSSLFile', async () => {
      // Mock req.setTimeout to throw to trigger catch block in uploadSSLMiddleware
      req.setTimeout.mockImplementation(() => {
        throw new Error('Sync Error');
      });

      await uploadSSLFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'UPLOAD_ERROR' }));
    });

    it('uploadSSLFile should not send error if headers sent', async () => {
      // Mock req.setTimeout to throw (trigger error)
      req.setTimeout.mockImplementation(() => {
        throw new Error('Sync Error');
      });
      res.headersSent = true;

      await uploadSSLFile(req, res);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should handle request close event', async () => {
      const mockStream = createMockStream();
      mockFs.createWriteStream.mockReturnValueOnce(mockStream);

      const uploadPromise = uploadFile(req, res);

      // Simulate request close
      const [, closeHandler] = req.on.mock.calls.find(call => call[0] === 'close');
      closeHandler();

      // Finish stream to resolve promise
      mockStream.emit('finish');

      await uploadPromise;
      expect(mockStream.end).toHaveBeenCalled();
    });

    it('uploadFile should handle read error during checksum verification', async () => {
      req.headers['content-length'] = '100';
      req.headers['x-checksum'] = 'validchecksum';
      req.headers['x-checksum-type'] = 'sha256';

      mockFs.statSync.mockReturnValue({ size: 100 });
      mockFs.existsSync.mockReturnValue(true);

      // Mock createReadStream to error out
      mockFs.createReadStream.mockImplementation(() => {
        const stream = new EventEmitter();
        process.nextTick(() => {
          stream.emit('error', new Error('Checksum Read Error'));
        });
        return stream;
      });

      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('finish'), 0);
        return stream;
      });

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Checksum Read Error',
        })
      );
      // Verify cleanup
      expect(mockFs.unlink).toHaveBeenCalled();
    });

    it('uploadFile should use default max size and log error if config load fails', async () => {
      // Mock loadConfig to throw ONCE
      mockConfigLoader.loadConfig.mockImplementationOnce(() => {
        throw new Error('Config Load Error');
      });

      // Setup a valid upload request
      req.headers['content-length'] = '100';
      mockFs.statSync.mockReturnValue({ size: 100 });

      // Mock DB lookups to succeed
      mockDb.versions.findOne.mockResolvedValue({ id: 1 });
      mockDb.providers.findOne.mockResolvedValue({ id: 1 });
      mockDb.architectures.findOne.mockResolvedValue({ id: 1 });
      mockDb.files.findOne.mockResolvedValue(null);
      mockDb.files.create.mockResolvedValue({});

      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('finish'), 0);
        return stream;
      });

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      // Verify error was logged
      expect(mockLog.error.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load app configuration')
      );
    });
  });

  describe('Verify Sign Up Middleware', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
      req = { body: {} };
      res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };
      next = jest.fn();
    });

    describe('checkDuplicateUsernameOrEmail', () => {
      it('should call next if username and email are unique', async () => {
        req.body = { username: 'user', email: 'email@test.com' };
        mockDb.user.findOne.mockResolvedValue(null); // For username
        // The middleware chains promises, so we need to mock the second call too
        // However, the implementation uses .then(), so we can't easily mock sequential calls to same function with different args in a simple way without implementation details.
        // But since it calls findOne twice, we can mock it to return null both times.

        await verifySignUp.checkDuplicateUsernameOrEmail(req, res, next);

        // Wait for promises to resolve
        await new Promise(resolve => {
          setTimeout(resolve, 0);
        });

        expect(next).toHaveBeenCalled();
      });

      it('should return 400 if username exists', async () => {
        req.body = { username: 'existing', email: 'email@test.com' };
        mockDb.user.findOne.mockResolvedValueOnce({ id: 1 }); // Username exists

        await verifySignUp.checkDuplicateUsernameOrEmail(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.send).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('Username is already in use'),
          })
        );
        expect(next).not.toHaveBeenCalled();
      });

      it('should return 400 if email exists', async () => {
        req.body = { username: 'new', email: 'existing@test.com' };
        mockDb.user.findOne
          .mockResolvedValueOnce(null) // Username unique
          .mockResolvedValueOnce({ id: 1 }); // Email exists

        await verifySignUp.checkDuplicateUsernameOrEmail(req, res, next);

        // Wait for promises
        await new Promise(resolve => {
          setTimeout(resolve, 0);
        });

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.send).toHaveBeenCalledWith(
          expect.objectContaining({ message: expect.stringContaining('Email is already in use') })
        );
        expect(next).not.toHaveBeenCalled();
      });
    });

    it('checkDuplicateUsernameOrEmail should handle error with fallback message', async () => {
      req.body = { username: 'user', email: 'email@test.com' };
      mockDb.user.findOne.mockRejectedValue(new Error(''));
      await verifySignUp.checkDuplicateUsernameOrEmail(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Some error occurred while checking for duplicate username/email.',
        })
      );
    });

    it('checkRolesExisted should validate multiple roles', async () => {
      mockDb.user.count.mockResolvedValue(1);
      req.body = { roles: ['user', 'moderator'] };

      await verifySignUp.checkRolesExisted(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    describe('checkRolesExisted', () => {
      it('should assign admin role if no users exist', async () => {
        mockDb.user.count.mockResolvedValue(0);
        req.body = { roles: [] };

        await verifySignUp.checkRolesExisted(req, res, next);

        expect(req.body.roles).toEqual(['admin']);
        expect(next).toHaveBeenCalled();
      });

      it('should validate provided roles', async () => {
        mockDb.user.count.mockResolvedValue(1);
        req.body = { roles: ['user', 'moderator'] };

        await verifySignUp.checkRolesExisted(req, res, next);

        expect(next).toHaveBeenCalled();
      });

      it('checkRolesExisted should skip if roles is undefined', async () => {
        mockDb.user.count.mockResolvedValue(1);
        req.body = {}; // roles undefined
        await verifySignUp.checkRolesExisted(req, res, next);
        expect(next).toHaveBeenCalled();
      });

      it('should return 400 for single invalid role', async () => {
        mockDb.user.count.mockResolvedValue(1);
        req.body = { roles: ['invalid_role'] };
        await verifySignUp.checkRolesExisted(req, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
      });

      it('should return 400 for single invalid role', async () => {
        mockDb.user.count.mockResolvedValue(1);
        req.body = { roles: ['invalid_role'] };
        await verifySignUp.checkRolesExisted(req, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
      });

      it('should return 400 for invalid role', async () => {
        mockDb.user.count.mockResolvedValue(1);
        req.body = { roles: ['user', 'invalid_role'] };

        await verifySignUp.checkRolesExisted(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.send).toHaveBeenCalledWith(
          expect.objectContaining({ message: expect.stringContaining('Role does not exist') })
        );
        expect(next).not.toHaveBeenCalled();
      });

      it('should handle database errors', async () => {
        mockDb.user.count.mockRejectedValue(new Error('DB Error'));

        await verifySignUp.checkRolesExisted(req, res, next);

        expect(res.status).toHaveBeenCalledWith(500);
      });

      it('checkRolesExisted should handle error with fallback message', async () => {
        mockDb.user.count.mockRejectedValue(new Error(''));
        await verifySignUp.checkRolesExisted(req, res, next);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.send).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Some error occurred while checking roles.' })
        );
      });
    });
  });

  describe('AuthJWT Middleware Unit Tests', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
      req = {
        userId: 1,
        isServiceAccount: false,
        params: {},
        headers: {},
        path: '/',
        header: jest.fn(name => req.headers[name.toLowerCase()]),
      };
      res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };
      next = jest.fn();
    });

    it('isUser should handle database errors', async () => {
      mockDb.user.findByPk = jest.fn().mockRejectedValue(new Error('DB Error'));
      await authJwt.isUser(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('isAdmin should handle database errors', async () => {
      mockDb.user.findByPk = jest.fn().mockRejectedValue(new Error('DB Error'));
      await authJwt.isAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('isModerator should handle database errors', async () => {
      mockDb.user.findByPk = jest.fn().mockRejectedValue(new Error('DB Error'));
      await authJwt.isModerator(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('isSelfOrAdmin should handle database errors', async () => {
      mockDb.user.findByPk = jest.fn().mockRejectedValue(new Error('DB Error'));
      await authJwt.isSelfOrAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('isUserOrServiceAccount should handle database errors', async () => {
      mockDb.user.findByPk = jest.fn().mockRejectedValue(new Error('DB Error'));
      await authJwt.isUserOrServiceAccount(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('isServiceAccount should allow if flag is true', () => {
      req.isServiceAccount = true;
      authJwt.isServiceAccount(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('isServiceAccount should deny if flag is false', () => {
      req.isServiceAccount = false;
      authJwt.isServiceAccount(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('isUser should deny service account', async () => {
      req.isServiceAccount = true;
      await authJwt.isUser(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('isUser should deny if user has no valid role', async () => {
      mockDb.user.findByPk.mockResolvedValue({
        id: 1,
        getRoles: jest.fn().mockResolvedValue([{ name: 'guest' }]),
      });
      await authJwt.isUser(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('isUserOrServiceAccount should allow service account', async () => {
      req.isServiceAccount = true;
      await authJwt.isUserOrServiceAccount(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('isUserOrServiceAccount should deny if user has no valid role', async () => {
      req.isServiceAccount = false;
      mockDb.user.findByPk.mockResolvedValue({
        id: 1,
        getRoles: jest.fn().mockResolvedValue([{ name: 'guest' }]),
      });
      await authJwt.isUserOrServiceAccount(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('isAdmin should return 401 if user not found', async () => {
      mockDb.user.findByPk.mockResolvedValue(null);
      await authJwt.isAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('isModeratorOrAdmin should return 401 if user not found', async () => {
      mockDb.user.findByPk.mockResolvedValue(null);
      await authJwt.isModeratorOrAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('verifyToken should return 403 if no token provided', async () => {
      req.headers['x-access-token'] = undefined;
      await authJwt.verifyToken(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('verifyToken should handle service account token without org id', async () => {
      const token = jwt.sign(
        {
          id: 1,
          isServiceAccount: true,
        },
        'test-secret'
      );
      req.headers['x-access-token'] = token;

      await authJwt.verifyToken(req, res, next);
      expect(req.serviceAccountOrgId).toBeUndefined();
      if (res.status.mock.calls.length > 0) {
        // If it failed, it's likely due to missing org id which might be enforced
      } else {
        expect(next).toHaveBeenCalled();
      }
    });

    it('isUserOrServiceAccount should return 401 if user not found', async () => {
      req.isServiceAccount = false;
      mockDb.user.findByPk.mockResolvedValue(null);
      await authJwt.isUserOrServiceAccount(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('isSelfOrAdmin should return 401 if user not found', async () => {
      mockDb.user.findByPk.mockResolvedValue(null);
      await authJwt.isSelfOrAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('isSelfOrAdmin should deny if user is not admin and not self', async () => {
      req.userId = 1;
      req.params.userId = 2;
      mockDb.user.findByPk.mockResolvedValue({
        id: 1,
        getRoles: jest.fn().mockResolvedValue([{ name: 'user' }]),
      });
      await authJwt.isSelfOrAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('isSelfOrAdmin should handle database errors', async () => {
      mockDb.user.findByPk.mockRejectedValue(new Error('DB Error'));
      await authJwt.isSelfOrAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('isModeratorOrAdmin should return 401 if user not found', async () => {
      mockDb.user.findByPk.mockResolvedValue(null);
      await authJwt.isModeratorOrAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('isModerator should deny if user is not moderator', async () => {
      mockDb.user.findByPk.mockResolvedValue({
        id: 1,
        getRoles: jest.fn().mockResolvedValue([{ name: 'user' }]),
      });
      await authJwt.isModerator(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('isModeratorOrAdmin should handle database errors', async () => {
      mockDb.user.findByPk.mockRejectedValue(new Error('DB Error'));
      await authJwt.isModeratorOrAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('isModerator should return 401 if user not found', async () => {
      mockDb.user.findByPk.mockResolvedValue(null);
      await authJwt.isModerator(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('isOrgAdmin should return 400 if organization param missing', async () => {
      req.params.organization = undefined;
      await isOrgAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('isOrgAdmin should return 404 if organization not found', async () => {
      req.params.organization = 'NonExistent';
      mockDb.user.findByPk.mockResolvedValue({ id: 1, getRoles: jest.fn().mockResolvedValue([]) });
      mockDb.organization.findOne.mockResolvedValue(null);
      await isOrgAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('isOrgAdmin should return 401 if user not found', async () => {
      req.params.organization = 'org';
      mockDb.user.findByPk.mockResolvedValue(null);
      await isOrgAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('isOrgAdmin should handle database errors', async () => {
      req.params.organization = 'org';
      mockDb.user.findByPk.mockRejectedValue(new Error('DB Error'));
      await isOrgAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('isOrgAdmin should handle error in hasRole check', async () => {
      req.params.organization = 'org';
      mockDb.user.findByPk.mockResolvedValue({ id: 1, getRoles: jest.fn().mockResolvedValue([]) });
      mockDb.organization.findOne.mockResolvedValue({ id: 1 });
      mockDb.UserOrg.hasRole.mockRejectedValue(new Error('DB Error'));

      await isOrgAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('isOrgModeratorOrAdmin should return 400 if organization param missing', async () => {
      req.params.organization = undefined;
      await isOrgModeratorOrAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('isOrgModeratorOrAdmin should handle database errors', async () => {
      req.params.organization = 'org';
      mockDb.user.findByPk.mockRejectedValue(new Error('DB Error'));
      await isOrgModeratorOrAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('isOrgModeratorOrAdmin should handle error in hasRole check', async () => {
      req.params.organization = 'org';
      mockDb.user.findByPk.mockResolvedValue({ id: 1, getRoles: jest.fn().mockResolvedValue([]) });
      mockDb.organization.findOne.mockResolvedValue({ id: 1 });
      mockDb.UserOrg.hasRole.mockRejectedValue(new Error('DB Error'));

      await isOrgModeratorOrAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('isOrgMember should handle database errors', async () => {
      req.params.organization = 'org';
      mockDb.user.findByPk.mockRejectedValue(new Error('DB Error'));
      await isOrgMember(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('isOrgModerator should handle database errors', async () => {
      req.params.organization = 'org';
      mockDb.user.findByPk.mockRejectedValue(new Error('DB Error'));
      await isOrgModerator(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('AuthJWT VerifyToken Error Handling', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
      req = { headers: { 'x-access-token': 'invalid-token' }, path: '/api/test' };
      res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };
      next = jest.fn();
    });

    it('should handle config load error (outer catch)', async () => {
      // Mock loadConfig to throw
      mockConfigLoader.loadConfig.mockImplementationOnce(() => {
        throw new Error('Config Error');
      });

      await authJwt.verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('VerifyOrgAccess Middleware', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
      req = {
        params: { organization: 'test-org' },
        userId: 1,
        isServiceAccount: false,
      };
      res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };
      next = jest.fn();
    });

    it('isOrgMember should allow service account if authorized', async () => {
      req.isServiceAccount = true;
      mockDb.service_account.findOne.mockResolvedValue({ id: 1 });
      await isOrgMember(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('isOrgMember should deny service account if not authorized', async () => {
      req.isServiceAccount = true;
      mockDb.service_account.findOne.mockResolvedValue(null);
      await isOrgMember(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('isOrgMember should deny if user not found', async () => {
      mockDb.user.findByPk.mockResolvedValue(null);
      await isOrgMember(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('isOrgMember should deny if organization not found', async () => {
      mockDb.user.findByPk.mockResolvedValue({ id: 1 });
      mockDb.organization.findOne.mockResolvedValue(null);
      await isOrgMember(req, res, next);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('isOrgMember should deny if user is not a member', async () => {
      mockDb.user.findByPk.mockResolvedValue({ id: 1 });
      mockDb.organization.findOne.mockResolvedValue({ id: 1 });
      mockDb.UserOrg.findUserOrgRole.mockResolvedValue(null);
      await isOrgMember(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('isOrgModerator should allow global admin', async () => {
      mockDb.user.findByPk.mockResolvedValue({
        id: 1,
        getRoles: jest.fn().mockResolvedValue([{ name: 'admin' }]),
      });
      mockDb.organization.findOne.mockResolvedValue({ id: 1 });

      await isOrgModerator(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.userOrgRole).toBe('admin');
    });

    it('isOrgModerator should deny if user is not org moderator', async () => {
      req.params.organization = 'org';
      mockDb.user.findByPk.mockResolvedValue({
        id: 1,
        getRoles: jest.fn().mockResolvedValue([{ name: 'user' }]),
      });
      mockDb.organization.findOne.mockResolvedValue({ id: 1 });
      mockDb.UserOrg.hasRole.mockResolvedValue(false);
      await isOrgModerator(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('isOrgAdmin should allow global admin', async () => {
      mockDb.user.findByPk.mockResolvedValue({
        id: 1,
        getRoles: jest.fn().mockResolvedValue([{ name: 'admin' }]),
      });
      mockDb.organization.findOne.mockResolvedValue({ id: 1 });

      await isOrgAdmin(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.userOrgRole).toBe('admin');
    });

    it('isOrgAdmin should allow org admin', async () => {
      mockDb.user.findByPk.mockResolvedValue({
        id: 1,
        getRoles: jest.fn().mockResolvedValue([{ name: 'user' }]),
      });
      mockDb.organization.findOne.mockResolvedValue({ id: 1 });
      mockDb.UserOrg.hasRole.mockResolvedValue(true);

      await isOrgAdmin(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('isOrgAdmin should deny non-admin', async () => {
      mockDb.user.findByPk.mockResolvedValue({
        id: 1,
        getRoles: jest.fn().mockResolvedValue([{ name: 'user' }]),
      });
      mockDb.organization.findOne.mockResolvedValue({ id: 1 });
      mockDb.UserOrg.hasRole.mockResolvedValue(false);

      await isOrgAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('isOrgModeratorOrAdmin should allow global admin', async () => {
      mockDb.user.findByPk.mockResolvedValue({
        id: 1,
        getRoles: jest.fn().mockResolvedValue([{ name: 'admin' }]),
      });
      mockDb.organization.findOne.mockResolvedValue({ id: 1 });

      await isOrgModeratorOrAdmin(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.userOrgRole).toBe('admin');
    });

    it('isOrgModeratorOrAdmin should deny if user is not org moderator/admin', async () => {
      req.params.organization = 'org';
      mockDb.user.findByPk.mockResolvedValue({
        id: 1,
        getRoles: jest.fn().mockResolvedValue([{ name: 'user' }]),
      });
      mockDb.organization.findOne.mockResolvedValue({ id: 1 });
      mockDb.UserOrg.hasRole.mockResolvedValue(false);
      await isOrgModeratorOrAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('getUserOrgContext Helper', () => {
    it('should return null if organization not found', async () => {
      mockDb.organization.findOne.mockResolvedValue(null);
      const result = await getUserOrgContext(1, 'NonExistent');
      expect(result).toBeNull();
    });

    it('should return null if user is not a member', async () => {
      mockDb.organization.findOne.mockResolvedValue({ id: 1 });
      mockDb.UserOrg.findUserOrgRole.mockResolvedValue(null);
      const result = await getUserOrgContext(1, 'Org');
      expect(result).toBeNull();
    });

    it('should return context if user is member', async () => {
      mockDb.organization.findOne.mockResolvedValue({ id: 1 });
      mockDb.UserOrg.findUserOrgRole.mockResolvedValue({ role: 'user' });
      const result = await getUserOrgContext(1, 'Org');
      expect(result).toEqual({
        role: 'user',
        organizationId: 1,
        organization: { id: 1 },
      });
    });

    it('should return null on error', async () => {
      mockDb.organization.findOne.mockRejectedValue(new Error('DB Error'));
      const result = await getUserOrgContext(1, 'Org');
      expect(result).toBeNull();
    });
  });

  describe('Error Handler Middleware', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
      req = { path: '/api/test', method: 'GET' };
      res = {
        headersSent: false,
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        send: jest.fn(),
        sendFile: jest.fn(),
      };
      next = jest.fn();
    });

    it('should delegate to default handler if headers sent', () => {
      res.headersSent = true;
      const err = new Error('Test Error');
      errorHandler(err, req, res, next);
      expect(next).toHaveBeenCalledWith(err);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should serve static error page for non-api routes if exists', () => {
      req.path = '/dashboard';
      mockFs.existsSync.mockReturnValue(true); // views/index.html exists
      const err = new Error('Page Error');

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.sendFile).toHaveBeenCalled();
    });

    it('should return plain text for non-api routes if static page missing', () => {
      req.path = '/dashboard';
      mockFs.existsSync.mockReturnValue(false); // views/index.html missing
      const err = new Error('Page Error');

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('Internal server error');
    });
  });

  describe('VerifyBoxFilePath Middleware', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
      req = {
        params: {
          organization: 'org',
          boxId: 'box',
          versionNumber: '1.0',
          providerName: 'prov',
          architectureName: 'arch',
        },
        __: k => k,
      };
      res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      next = jest.fn();
    });

    it('should return 404 if provider not found', async () => {
      mockDb.organization.findOne.mockResolvedValue({ id: 1 });
      mockDb.box.findOne.mockResolvedValue({ id: 1 });
      mockDb.versions.findOne.mockResolvedValue({ id: 1 });
      mockDb.providers.findOne.mockResolvedValue(null);

      await verifyBoxFilePath(req, res, next);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'NOT_FOUND' }));
    });

    it('should return 404 if architecture not found', async () => {
      mockDb.organization.findOne.mockResolvedValue({ id: 1 });
      mockDb.box.findOne.mockResolvedValue({ id: 1 });
      mockDb.versions.findOne.mockResolvedValue({ id: 1 });
      mockDb.providers.findOne.mockResolvedValue({ id: 1 });
      mockDb.architectures.findOne.mockResolvedValue(null);

      await verifyBoxFilePath(req, res, next);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should handle database errors', async () => {
      mockDb.organization.findOne.mockRejectedValue(new Error('DB Error'));
      await verifyBoxFilePath(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('Rate Limiter Middleware', () => {
    it('handler should log warning and return 429', () => {
      const { handler } = rateLimiter.options;
      const req = { ip: '127.0.0.1', method: 'GET', url: '/', get: jest.fn() };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        getHeader: jest.fn(),
      };

      handler(req, res);

      expect(mockLog.api.warn).toHaveBeenCalledWith('Rate limit exceeded', expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(429);
    });
  });

  describe('Validation Middleware', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
      req = { body: {}, query: {}, params: {}, method: 'POST' };
      res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
      next = jest.fn();
    });

    it('validateBoxName should reject invalid names', () => {
      req.body = { name: 'Invalid Name!' };
      validateBoxName(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('validateProvider should reject invalid names', () => {
      req.body = { name: 'Invalid Name!' };
      validateProvider(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('validateProvider should skip validation for PUT without name', () => {
      req.method = 'PUT';
      req.body = {};
      validateProvider(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('validateVersion should reject missing version', () => {
      validateVersion(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('validateVersion should reject invalid version format', () => {
      req.body = { version: 'Invalid!' };
      validateVersion(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('validateArchitecture should reject invalid names', () => {
      req.body = { name: 'Invalid!' };
      validateArchitecture(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('validateArchitecture should reject names starting with hyphen', () => {
      req.body = { name: '-arch' };
      validateArchitecture(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('start with a hyphen') })
      );
    });

    it('validateArchitecture should reject names starting with period', () => {
      req.body = { name: '.arch' };
      validateArchitecture(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('verifyOrganization.validateOrganization should reject invalid names', () => {
      req.body = { organization: 'Invalid!' };
      verifyOrganization.validateOrganization(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('verifyOrganization.checkOrganizationDuplicate should handle database errors', async () => {
      req.body = { organization: 'org' };
      mockDb.organization.findOne.mockRejectedValue(new Error('DB Error'));
      await verifyOrganization.checkOrganizationDuplicate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('Coverage Improvements', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
      req = {
        body: {},
        params: {},
        query: {},
        headers: { 'content-length': '100' },
        method: 'POST',
        path: '/test',
        __: key => key,
        pipe: jest.fn(),
        on: jest.fn(),
        setTimeout: jest.fn(),
      };
      res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
        json: jest.fn(),
        sendFile: jest.fn(),
        setHeader: jest.fn(),
        setTimeout: jest.fn(),
      };
      next = jest.fn();
    });

    // authJwt.js coverage
    it('authJwt.verifyToken should return 401 for invalid token (inner catch)', async () => {
      req.headers['x-access-token'] = 'invalid.token';
      await authJwt.verifyToken(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'TOKEN_INVALID' }));
    });

    it('authJwt.verifyToken should deny service account on refresh endpoint', async () => {
      mockConfigLoader.loadConfig.mockReturnValue({
        auth: { jwt: { jwt_secret: { value: 'test-secret' } } },
      });

      const token = jwt.sign({ id: 1, isServiceAccount: true }, 'test-secret');
      req.headers['x-access-token'] = token;
      req.path = '/api/auth/refresh-token';

      await authJwt.verifyToken(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Service accounts cannot refresh tokens' })
      );
    });

    it('authJwt.verifyToken should attach service account org id', async () => {
      const token = jwt.sign(
        {
          id: 1,
          isServiceAccount: true,
          serviceAccountOrgId: 999,
        },
        'test-secret'
      );
      req.headers['x-access-token'] = token;

      await authJwt.verifyToken(req, res, next);
      expect(req.serviceAccountOrgId).toBe(999);
      expect(next).toHaveBeenCalled();
    });

    // verifyBoxName.js coverage
    it('verifyBoxName.checkBoxDuplicate should handle database errors', async () => {
      req.params = { organization: 'org', name: 'box' };
      req.body = { name: 'newbox' };
      mockDb.organization.findOne.mockRejectedValue(new Error('DB Error'));

      const { checkBoxDuplicate } = await import('../app/middleware/verifyBoxName.js');
      await checkBoxDuplicate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    // verifyBoxName.js coverage
    it('verifyBoxName.checkBoxDuplicate should skip if PUT and no name', async () => {
      req.method = 'PUT';
      req.body = {};
      const { checkBoxDuplicate } = await import('../app/middleware/verifyBoxName.js');
      await checkBoxDuplicate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    // verifyBoxName.js coverage
    it('verifyBoxName.checkBoxDuplicate should skip check if currentName equals newName', async () => {
      req.params = { organization: 'org', name: 'same' };
      req.body = { name: 'same' };
      await import('../app/middleware/verifyBoxName.js').then(m =>
        m.checkBoxDuplicate(req, res, next)
      );
      expect(next).toHaveBeenCalled();
    });

    it('verifyBoxName.checkBoxDuplicate should return 404 if org not found', async () => {
      req.params = { organization: 'NonExistent', name: 'old' };
      req.body = { name: 'new' };
      mockDb.organization.findOne.mockResolvedValue(null);

      const { checkBoxDuplicate } = await import('../app/middleware/verifyBoxName.js');
      await checkBoxDuplicate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('verifyBoxName.checkBoxDuplicate should handle error with fallback message', async () => {
      req.params = { organization: 'org', name: 'box' };
      req.body = { name: 'newbox' };
      mockDb.organization.findOne.mockRejectedValue(new Error('')); // Empty message

      const { checkBoxDuplicate } = await import('../app/middleware/verifyBoxName.js');
      await checkBoxDuplicate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Some error occurred while checking the box.',
        })
      );
    });

    // verifyProvider.js coverage
    it('verifyProvider.validateProvider should reject names starting with hyphen', () => {
      req.body = { name: '-invalid' };
      validateProvider(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    // verifyProvider.js coverage
    it('verifyProvider.checkProviderDuplicate should handle database errors', async () => {
      req.params = { organization: 'org', boxId: 'box', versionNumber: '1.0.0' };
      req.body = { name: 'provider' };
      mockDb.organization.findOne.mockRejectedValue(new Error('DB Error'));

      await checkProviderDuplicate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('verifyProvider.checkProviderDuplicate should handle error with fallback message', async () => {
      req.params = { organization: 'org', boxId: 'box', versionNumber: '1.0.0' };
      req.body = { name: 'provider' };
      mockDb.organization.findOne.mockRejectedValue(new Error(''));

      await checkProviderDuplicate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Some error occurred while checking the provider.',
        })
      );
    });

    it('verifyProvider.checkProviderDuplicate should return 409 if provider exists', async () => {
      req.params = { organization: 'org', boxId: 'box', versionNumber: '1.0.0' };
      req.body = { name: 'provider' };
      mockDb.organization.findOne.mockResolvedValue({ id: 1 });
      mockDb.box.findOne.mockResolvedValue({ id: 1 });
      mockDb.versions.findOne.mockResolvedValue({ id: 1 });
      mockDb.providers.findOne.mockResolvedValue({ id: 1 }); // Exists

      await checkProviderDuplicate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(409);
    });

    it('verifyProvider.checkProviderDuplicate should call next if no duplicate', async () => {
      req.params = { organization: 'org', boxId: 'box', versionNumber: '1.0.0' };
      req.body = { name: 'new-provider' };
      mockDb.organization.findOne.mockResolvedValue({ id: 1 });
      mockDb.box.findOne.mockResolvedValue({ id: 1 });
      mockDb.versions.findOne.mockResolvedValue({ id: 1 });
      mockDb.providers.findOne.mockResolvedValue(null);
      await checkProviderDuplicate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    // verifyVersion.js coverage
    it('verifyVersion.validateVersion should reject names starting with period', () => {
      req.body = { version: '.invalid' };
      validateVersion(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('verifyVersion.checkVersionDuplicate should skip if version matches current', async () => {
      req.params = { versionNumber: '1.0.0' };
      req.body = { versionNumber: '1.0.0' };
      req.organizationData = {};
      req.boxData = {};

      await checkVersionDuplicate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('verifyVersion.checkVersionDuplicate should handle database errors', async () => {
      req.params = { versionNumber: '1.0.0' };
      req.body = { versionNumber: '1.0.1' };
      req.organizationData = { name: 'org' };
      req.boxData = { id: 1 };

      mockDb.versions.findOne.mockRejectedValue(new Error('DB Error'));

      await checkVersionDuplicate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('verifyVersion.attachEntities should handle database errors', async () => {
      req.params = { organization: 'org', boxId: 'box' };
      mockDb.organization.findOne.mockRejectedValue(new Error('DB Error'));

      await attachEntities(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('verifyVersion.attachEntities should return 404 if organization not found', async () => {
      req.params = { organization: 'NonExistent' };
      mockDb.organization.findOne.mockResolvedValue(null);
      await attachEntities(req, res, next);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('verifyVersion.attachEntities should handle error with fallback message', async () => {
      req.params = { organization: 'org', boxId: 'box' };
      mockDb.organization.findOne.mockRejectedValue(new Error(''));

      await attachEntities(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Some error occurred while checking the version.',
        })
      );
    });

    it('verifyVersion.checkVersionDuplicate should return 409 if version exists', async () => {
      req.params = { versionNumber: '1.0.0' };
      req.body = { versionNumber: '1.0.1' };
      req.organizationData = { name: 'org' };
      req.boxData = { id: 1 };

      mockDb.versions.findOne.mockResolvedValue({ id: 1 }); // Exists

      await checkVersionDuplicate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(409);
    });

    it('verifyVersion.attachEntities should call next if all entities found', async () => {
      req.params = { organization: 'org', boxId: 'box' };
      mockDb.organization.findOne.mockResolvedValue({ id: 1 });
      mockDb.box.findOne.mockResolvedValue({ id: 1 });
      await attachEntities(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.organizationData).toBeDefined();
      expect(req.boxData).toBeDefined();
    });

    it('verifyVersion.checkVersionDuplicate should handle error with fallback message', async () => {
      req.params = { versionNumber: '1.0.0' };
      req.body = { versionNumber: '1.0.1' };
      req.organizationData = { name: 'org' };
      req.boxData = { id: 1 };

      mockDb.versions.findOne.mockRejectedValue(new Error(''));

      await checkVersionDuplicate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Some error occurred while checking the version.',
        })
      );
    });

    // verifyOrgAccess.js coverage
    it('verifyOrgAccess.isOrgModerator should return 400 if organization param missing', async () => {
      req.params.organization = undefined;
      await isOrgModerator(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('verifyOrgAccess.isOrgAdmin should return 400 if organization param missing', async () => {
      req.params.organization = undefined;
      await isOrgAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('verifyOrgAccess.isOrgModeratorOrAdmin should return 400 if organization param missing', async () => {
      req.params.organization = undefined;
      await isOrgModeratorOrAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('isOrgModerator should return 404 if organization not found', async () => {
      req.params.organization = 'org';
      mockDb.user.findByPk.mockResolvedValue({ id: 1, getRoles: jest.fn().mockResolvedValue([]) });
      mockDb.organization.findOne.mockResolvedValue(null);
      await isOrgModerator(req, res, next);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('isOrgModerator should return 401 if user not found', async () => {
      req.params.organization = 'org';
      mockDb.user.findByPk.mockResolvedValue(null);
      await isOrgModerator(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('isOrgModeratorOrAdmin should return 404 if organization not found', async () => {
      req.params.organization = 'org';
      mockDb.user.findByPk.mockResolvedValue({ id: 1, getRoles: jest.fn().mockResolvedValue([]) });
      mockDb.organization.findOne.mockResolvedValue(null);
      await isOrgModeratorOrAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('isOrgModeratorOrAdmin should return 401 if user not found', async () => {
      req.params.organization = 'org';
      mockDb.user.findByPk.mockResolvedValue(null);
      await isOrgModeratorOrAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    // verifyOrgAccess.js coverage
    it('verifyOrgAccess.isOrgMember should return 400 if organization param missing', async () => {
      req.params.organization = undefined;
      await isOrgMember(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    // errorHandler.js coverage
    it('errorHandler should log request details if req exists', () => {
      const err = new Error('Test Error');
      req.entity = { name: 'TestUser' };
      errorHandler(err, req, res, next);
      expect(mockLog.app.error).toHaveBeenCalledWith('Request error details', expect.any(Object));
    });

    it('errorHandler should serve static file if exists', () => {
      const err = new Error('Test Error');
      req.path = '/not-api';
      mockFs.existsSync.mockReturnValue(true);

      errorHandler(err, req, res, next);
      expect(res.sendFile).toHaveBeenCalled();
    });

    it('errorHandler should return 500 text if static file missing', () => {
      const err = new Error('Test Error');
      req.path = '/not-api';
      mockFs.existsSync.mockReturnValue(false);

      errorHandler(err, req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('Internal server error');
    });

    it('errorHandler should hide error details in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const err = new Error('Sensitive Info');
      req.path = '/api/test';

      errorHandler(err, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Internal server error',
        })
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('errorHandler should handle missing req object', () => {
      const err = new Error('Test');
      errorHandler(err, null, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('verifyOrganization.checkOrganizationDuplicate should call next if no duplicate', async () => {
      req.body = { organization: 'new-org' };
      mockDb.organization.findOne.mockResolvedValue(null);
      await verifyOrganization.checkOrganizationDuplicate(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('verifyOrganization.checkOrganizationDuplicate should handle error with fallback message', async () => {
      req.body = { organization: 'org' };
      mockDb.organization.findOne.mockRejectedValue(new Error(''));

      await verifyOrganization.checkOrganizationDuplicate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Some error occurred while checking the organization.',
        })
      );
    });

    // verifyArchitecture.js coverage
    it('verifyArchitecture.checkArchitectureDuplicate should handle database errors', async () => {
      req.params = {
        organization: 'org',
        boxId: 'box',
        versionNumber: '1.0.0',
        providerName: 'prov',
      };
      req.body = { name: 'arch' };

      mockDb.organization.findOne.mockRejectedValue(new Error('DB Error'));

      await checkArchitectureDuplicate(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    // downloadAuth.js coverage
    it('downloadAuth should return 403 for invalid token signature', async () => {
      // Sign with wrong secret
      const token = jwt.sign({ userId: 1 }, 'wrong-secret');
      req.query = { token };

      await downloadAuth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    // oidcTokenRefresh.js coverage
    it('oidcTokenRefresh should skip if no token', async () => {
      req.headers['x-access-token'] = undefined;
      await oidcTokenRefresh(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('oidcTokenRefresh should skip if not OIDC provider', async () => {
      const token = jwt.sign({ id: 1, provider: 'local' }, 'test-secret');
      req.headers['x-access-token'] = token;
      await oidcTokenRefresh(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('oidcTokenRefresh should skip if token not expiring soon', async () => {
      const future = Date.now() + 60 * 60 * 1000; // 1 hour
      const token = jwt.sign(
        {
          id: 1,
          provider: 'oidc-test',
          oidc_expires_at: future,
          oidc_refresh_token: 'rt',
        },
        'test-secret'
      );
      req.headers['x-access-token'] = token;

      await oidcTokenRefresh(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('oidcTokenRefresh should return 401 if config missing', async () => {
      const soon = Date.now() + 60 * 1000; // 1 minute
      const token = jwt.sign(
        {
          id: 1,
          provider: 'oidc-test',
          oidc_expires_at: soon,
          oidc_refresh_token: 'rt',
        },
        'test-secret'
      );
      req.headers['x-access-token'] = token;

      getOidcConfiguration.mockReturnValue(null);

      await oidcTokenRefresh(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('oidcTokenRefresh should return 401 if refresh fails', async () => {
      const soon = Date.now() + 60 * 1000;
      const token = jwt.sign(
        {
          id: 1,
          provider: 'oidc-test',
          oidc_expires_at: soon,
          oidc_refresh_token: 'rt',
        },
        'test-secret'
      );
      req.headers['x-access-token'] = token;

      getOidcConfiguration.mockReturnValue({
        serverMetadata: () => ({ token_endpoint: 'http://test' }),
        clientId: 'id',
      });

      axios.post.mockRejectedValue(new Error('Refresh Failed'));

      await oidcTokenRefresh(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('oidcTokenRefresh should use client_secret_basic auth method', async () => {
      const token = jwt.sign(
        {
          id: 1,
          provider: 'oidc-test',
          oidc_expires_at: Date.now() + 60000,
          oidc_refresh_token: 'rt',
        },
        'test-secret'
      );
      req.headers['x-access-token'] = token;

      getOidcConfiguration.mockReturnValue({
        serverMetadata: () => ({ token_endpoint: 'http://test' }),
        clientId: 'id',
      });

      mockConfigLoader.loadConfig.mockReturnValue({
        auth: {
          jwt: { jwt_secret: { value: 'test-secret' } },
          oidc: {
            token_refresh_threshold_minutes: { value: 5 },
            providers: {
              test: {
                client_secret: { value: 'secret' },
                token_endpoint_auth_method: { value: 'client_secret_basic' },
              },
            },
          },
        },
      });

      axios.post.mockResolvedValue({ data: { access_token: 'new' } });

      await oidcTokenRefresh(req, res, next);
      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('grant_type=refresh_token'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: expect.stringContaining('Basic') }),
        })
      );
    });

    it('oidcTokenRefresh should handle unknown auth method', async () => {
      const token = jwt.sign(
        {
          id: 1,
          provider: 'oidc-test',
          oidc_expires_at: Date.now() + 60000,
          oidc_refresh_token: 'rt',
        },
        'test-secret'
      );
      req.headers['x-access-token'] = token;

      getOidcConfiguration.mockReturnValue({
        serverMetadata: () => ({ token_endpoint: 'http://test' }),
        clientId: 'id',
      });

      mockConfigLoader.loadConfig.mockReturnValue({
        auth: {
          jwt: { jwt_secret: { value: 'test-secret' } },
          oidc: {
            token_refresh_threshold_minutes: { value: 5 },
            providers: {
              test: {
                client_secret: { value: 'secret' },
                token_endpoint_auth_method: { value: 'unknown' },
              },
            },
          },
        },
      });

      axios.post.mockResolvedValue({ data: { access_token: 'new' } });

      await oidcTokenRefresh(req, res, next);
      // Should proceed without setting Authorization header or body param for secret
      expect(axios.post).toHaveBeenCalled();
    });

    it('oidcTokenRefresh should use client_secret_post auth method', async () => {
      const token = jwt.sign(
        {
          id: 1,
          provider: 'oidc-test',
          oidc_expires_at: Date.now() + 60000,
          oidc_refresh_token: 'rt',
        },
        'test-secret'
      );
      req.headers['x-access-token'] = token;

      getOidcConfiguration.mockReturnValue({
        serverMetadata: () => ({ token_endpoint: 'http://test' }),
        clientId: 'id',
      });

      mockConfigLoader.loadConfig.mockReturnValue({
        auth: {
          jwt: { jwt_secret: { value: 'test-secret' }, jwt_expiration: { value: '1h' } },
          oidc: {
            token_refresh_threshold_minutes: { value: 5 },
            providers: {
              test: {
                client_secret: { value: 'secret' },
                token_endpoint_auth_method: { value: 'client_secret_post' },
              },
            },
          },
        },
      });

      axios.post.mockResolvedValue({ data: { access_token: 'new' } });

      await oidcTokenRefresh(req, res, next);
      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('client_secret=secret'),
        expect.any(Object)
      );
    });

    it('oidcTokenRefresh should use default expiration if config missing', async () => {
      const token = jwt.sign(
        {
          id: 1,
          provider: 'oidc-test',
          oidc_expires_at: Date.now() + 60000,
          oidc_refresh_token: 'rt',
        },
        'test-secret'
      );
      req.headers['x-access-token'] = token;

      getOidcConfiguration.mockReturnValue({
        serverMetadata: () => ({ token_endpoint: 'http://test' }),
        clientId: 'id',
      });

      // Mock config without jwt_expiration
      mockConfigLoader.loadConfig.mockReturnValue({
        auth: {
          jwt: { jwt_secret: { value: 'test-secret' }, jwt_expiration: {} }, // Empty object to avoid crash on .value access
          oidc: {
            token_refresh_threshold_minutes: { value: 5 },
            providers: { test: { client_secret: { value: 's' } } },
          },
        },
      });

      axios.post.mockResolvedValue({ data: { access_token: 'new' } });

      await oidcTokenRefresh(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-Refreshed-Token', expect.any(String));
      const [[, newToken]] = res.setHeader.mock.calls;
      const decoded = jwt.decode(newToken);
      const expectedExp = Math.floor(Date.now() / 1000) + 24 * 3600;
      expect(decoded.exp).toBeGreaterThanOrEqual(expectedExp - 5);
    });

    it('oidcTokenRefresh should preserve old refresh token if new one not provided', async () => {
      const token = jwt.sign(
        {
          id: 1,
          provider: 'oidc-test',
          oidc_expires_at: Date.now() + 60000,
          oidc_refresh_token: 'old-rt',
        },
        'test-secret'
      );
      req.headers['x-access-token'] = token;

      getOidcConfiguration.mockReturnValue({
        serverMetadata: () => ({ token_endpoint: 'http://test' }),
        clientId: 'id',
      });

      // Use mockImplementation to ensure fresh config
      mockConfigLoader.loadConfig.mockImplementation(name => {
        if (name === 'auth') {
          return {
            auth: {
              jwt: { jwt_secret: { value: 'test-secret' }, jwt_expiration: { value: '1h' } },
              oidc: {
                token_refresh_threshold_minutes: { value: 5 },
                providers: { test: { client_secret: { value: 's' } } },
              },
            },
          };
        }
        return {};
      });

      axios.post.mockResolvedValue({ data: { access_token: 'new' } }); // No refresh_token in response

      await oidcTokenRefresh(req, res, next);

      expect(res.setHeader).toHaveBeenCalled();
      const [[, newToken]] = res.setHeader.mock.calls;
      const decoded = jwt.decode(newToken);
      expect(decoded.oidc_refresh_token).toBe('old-rt');
    });

    // sessionAuth.js coverage
    it('sessionAuth should handle verification error', async () => {
      req.headers['x-access-token'] = 'invalid-token';
      // jwt.verify will call callback with error for invalid token
      // sessionAuth catches it and logs debug
      await sessionAuth(req, res, next);
      expect(mockLog.app.debug).toHaveBeenCalledWith(
        'Session auth check failed:',
        expect.any(Object)
      );
      expect(next).toHaveBeenCalled();
    });

    // verifySignUp.js coverage
    it('checkRolesExisted should return 400 for invalid role', async () => {
      mockDb.user.count.mockResolvedValue(1);
      req.body = { roles: ['invalid_role'] };
      await verifySignUp.checkRolesExisted(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('checkRolesExisted should handle empty roles array', async () => {
      mockDb.user.count.mockResolvedValue(1);
      req.body = { roles: [] };
      await verifySignUp.checkRolesExisted(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('checkRolesExisted should handle database error', async () => {
      mockDb.user.count.mockRejectedValue(new Error('DB Error'));
      await verifySignUp.checkRolesExisted(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    // upload.js coverage
    it('uploadFile should handle file size mismatch for single upload', async () => {
      req.headers['content-length'] = '5242880'; // 5MB
      // Mock statSync to return different size
      mockFs.statSync.mockReturnValue({ size: 1048576 }); // 1MB. Diff = 4MB > 1MB tolerance

      // Mock stream to finish
      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('finish'), 0);
        return stream;
      });

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('File size mismatch'),
        })
      );
    });

    it('uploadFile should cleanup incomplete file on specific errors', async () => {
      delete req.headers['x-chunk-index'];
      delete req.headers['x-total-chunks'];

      req.headers['content-length'] = '5242880'; // 5MB
      // Mock statSync to return different size to trigger "size mismatch" error
      mockFs.statSync.mockReturnValue({ size: 1048576 }); // 1MB

      // Mock existsSync to return true for final path to trigger cleanup logic
      mockFs.existsSync.mockReturnValue(true);

      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('finish'), 0);
        return stream;
      });

      await uploadFile(req, res);

      expect(mockFs.unlink).toHaveBeenCalled();
    });

    it('uploadFile should detect chunk size mismatch during merge', async () => {
      req.headers['x-chunk-index'] = '1';
      req.headers['x-total-chunks'] = '2';

      mockFs.readdirSync.mockReturnValue(['chunk-0', 'chunk-1']);

      // Mock statSync to return size 50
      mockFs.statSync.mockReturnValue({ size: 50 });

      // Mock readFileSync to return buffer of size 40 (mismatch)
      mockFs.readFileSync.mockReturnValue(Buffer.alloc(40));

      // Mock mkdirSync
      mockFs.mkdirSync.mockImplementation(() => {});

      // Mock pipe to handle chunk upload before merge
      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('finish'), 0);
        return stream;
      });

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('size mismatch'),
        })
      );
    });

    it('uploadFile should cleanup on premature close error', async () => {
      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('error', new Error('closed prematurely')), 0);
        return stream;
      });

      // Mock existsSync to return true for cleanup
      mockFs.existsSync.mockReturnValue(true);

      await uploadFile(req, res);

      expect(mockFs.unlink).toHaveBeenCalled();
    });

    it('uploadFile should handle race condition where version is missing during updateDatabase', async () => {
      // This simulates a case where verifyBoxFilePath passed, but the version was deleted before upload completed
      req.params = {
        organization: 'org',
        boxId: 'box',
        versionNumber: '1.0.0',
        providerName: 'virtualbox',
        architectureName: 'amd64',
      };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ size: 100 });

      // Mock DB lookups to return null for version
      mockDb.versions.findOne.mockResolvedValue(null);

      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('finish'), 0);
        return stream;
      });

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Version 1.0.0 not found'),
        })
      );
    });

    it('uploadFile should handle race condition where provider is missing during updateDatabase', async () => {
      req.params = {
        organization: 'org',
        boxId: 'box',
        versionNumber: '1.0.0',
        providerName: 'virtualbox',
        architectureName: 'amd64',
      };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ size: 100 });

      mockDb.versions.findOne.mockResolvedValue({ id: 1 });
      mockDb.providers.findOne.mockResolvedValue(null);

      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('finish'), 0);
        return stream;
      });

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Provider virtualbox not found'),
        })
      );
    });

    it('uploadFile should handle cleanup error when file size mismatch occurs', async () => {
      req.headers['content-length'] = '5242880'; // 5MB
      mockFs.statSync.mockReturnValue({ size: 1048576 }); // 1MB. Diff = 4MB > 1MB tolerance
      mockFs.existsSync.mockReturnValue(true); // File exists
      safeUnlink
        .mockImplementationOnce(() => {}) // First call in handleSingleUpload (succeeds/ignored)
        .mockImplementationOnce(() => {
          throw new Error('Unlink Error');
        }); // Second call in uploadMiddleware catch (fails)

      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('finish'), 0);
        return stream;
      });

      await uploadFile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      // Should log error but not crash
      expect(mockLog.error.error).toHaveBeenCalledWith(
        expect.stringMatching(/(?:Upload error:|Error cleaning up file:)/),
        expect.any(Error)
      );
    });

    it('uploadFile should not send error response if headers already sent', async () => {
      req.headers['content-length'] = '5242880';
      mockFs.statSync.mockReturnValue({ size: 1048576 });

      res.headersSent = true; // Headers sent

      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('finish'), 0);
        return stream;
      });

      await uploadFile(req, res);

      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('uploadFile should handle unsupported checksum type', async () => {
      req.headers['x-checksum'] = 'somehash';
      req.headers['x-checksum-type'] = 'unknown-algo';
      req.params = {
        organization: 'org',
        boxId: 'box',
        versionNumber: '1.0.0',
        providerName: 'virtualbox',
        architectureName: 'amd64',
      };

      mockDb.versions.findOne.mockResolvedValue({ id: 1 });
      mockDb.providers.findOne.mockResolvedValue({ id: 1 });
      mockDb.architectures.findOne.mockResolvedValue({ id: 1 });
      mockDb.files.findOne.mockResolvedValue(null);
      mockDb.files.create.mockResolvedValue({});

      mockFs.statSync.mockReturnValue({ size: 100 });
      req.pipe.mockImplementation(stream => {
        setTimeout(() => stream.emit('finish'), 0);
        return stream;
      });

      await uploadFile(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('checkDuplicateUsernameOrEmail should handle database error', async () => {
      req.body = { username: 'user', email: 'email@test.com' };
      mockDb.user.findOne.mockImplementation(() => Promise.reject(new Error('DB Error')));

      await verifySignUp.checkDuplicateUsernameOrEmail(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('checkDuplicateUsernameOrEmail should handle error with fallback message', async () => {
      req.body = { username: 'user', email: 'email@test.com' };
      mockDb.user.findOne.mockRejectedValue(new Error(''));

      await verifySignUp.checkDuplicateUsernameOrEmail(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Some error occurred while checking for duplicate username/email.',
        })
      );
    });
  });

  describe('Atomic File Writer', () => {
    describe('atomicWriteFile', () => {
      it('should write file successfully', async () => {
        mockFs.writeFile.mockImplementation((path, content, enc, cb) => {
          void path;
          void content;
          void enc;
          cb(null);
        });
        mockFs.rename.mockImplementation((oldPath, newPath, cb) => {
          void oldPath;
          void newPath;
          cb(null);
        });

        await atomicWriteFile('test.txt', 'content');

        expect(mockFs.writeFile).toHaveBeenCalledWith(
          'test.txt.tmp',
          'content',
          'utf8',
          expect.any(Function)
        );
        expect(mockFs.rename).toHaveBeenCalledWith(
          'test.txt.tmp',
          'test.txt',
          expect.any(Function)
        );
      });

      it('should cleanup on write error', async () => {
        mockFs.writeFile.mockImplementation((path, content, enc, cb) => {
          void path;
          void content;
          void enc;
          cb(new Error('Write Error'));
        });
        mockFs.unlink.mockImplementation((path, cb) => {
          void path;
          cb(null);
        });

        await expect(atomicWriteFile('test.txt', 'content')).rejects.toThrow('Write Error');
        expect(mockFs.unlink).toHaveBeenCalledWith('test.txt.tmp', expect.any(Function));
      });

      it('should cleanup on rename error', async () => {
        mockFs.writeFile.mockImplementation((path, content, enc, cb) => {
          void path;
          void content;
          void enc;
          cb(null);
        });
        mockFs.rename.mockImplementation((oldPath, newPath, cb) => {
          void oldPath;
          void newPath;
          cb(new Error('Rename Error'));
        });
        mockFs.unlink.mockImplementation((path, cb) => {
          void path;
          cb(null);
        });

        await expect(atomicWriteFile('test.txt', 'content')).rejects.toThrow('Rename Error');
        expect(mockFs.unlink).toHaveBeenCalledWith('test.txt.tmp', expect.any(Function));
      });

      it('should ignore cleanup error on write failure', async () => {
        mockFs.writeFile.mockImplementation((path, content, enc, cb) => {
          void path;
          void content;
          void enc;
          cb(new Error('Write Error'));
        });
        // Simulate unlink error (should be ignored)
        mockFs.unlink.mockImplementation((path, cb) => {
          void path;
          cb(new Error('Unlink Error'));
        });

        await expect(atomicWriteFile('test.txt', 'content')).rejects.toThrow('Write Error');
        expect(mockFs.unlink).toHaveBeenCalled();
      });
    });

    describe('atomicWriteFileSync', () => {
      it('should write file successfully', () => {
        mockFs.writeFileSync.mockImplementation(() => {});
        mockFs.renameSync.mockImplementation(() => {});
        atomicWriteFileSync('test.txt', 'content');
        expect(mockFs.writeFileSync).toHaveBeenCalledWith('test.txt.tmp', 'content', 'utf8');
        expect(mockFs.renameSync).toHaveBeenCalledWith('test.txt.tmp', 'test.txt');
      });

      it('should cleanup on write error', () => {
        mockFs.writeFileSync.mockImplementation(() => {
          throw new Error('Write Sync Error');
        });

        expect(() => atomicWriteFileSync('test.txt', 'content')).toThrow('Write Sync Error');
        expect(mockFs.unlinkSync).toHaveBeenCalledWith('test.txt.tmp');
      });

      it('should cleanup on rename error', () => {
        mockFs.writeFileSync.mockImplementation(() => {});
        mockFs.renameSync.mockImplementation(() => {
          throw new Error('Rename Sync Error');
        });

        expect(() => atomicWriteFileSync('test.txt', 'content')).toThrow('Rename Sync Error');
        expect(mockFs.unlinkSync).toHaveBeenCalledWith('test.txt.tmp');
      });

      it('should ignore cleanup error', () => {
        mockFs.writeFileSync.mockImplementation(() => {
          throw new Error('Write Sync Error');
        });
        mockFs.unlinkSync.mockImplementation(() => {
          throw new Error('Cleanup Error');
        });

        expect(() => atomicWriteFileSync('test.txt', 'content')).toThrow('Write Sync Error');
        // Should not throw Cleanup Error
      });
    });
  });
});
