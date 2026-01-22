import { jest } from '@jest/globals';
import yaml from 'js-yaml';

const mockJwt = {
  verify: jest.fn(),
  sign: jest.fn(),
};

const mockFs = {
  writeFile: jest.fn(),
  unlink: jest.fn(),
  rename: jest.fn(),
  writeFileSync: jest.fn(),
  renameSync: jest.fn(),
  unlinkSync: jest.fn(),
  rm: jest.fn(),
  rmSync: jest.fn(),
  mkdirSync: jest.fn(),
  existsSync: jest.fn(),
};

const mockConfigLoader = {
  loadConfig: jest.fn(),
};

const mockLog = {
  app: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
};

jest.unstable_mockModule('fs', () => ({
  default: mockFs,
  ...mockFs,
}));
jest.unstable_mockModule('../app/utils/config-loader.js', () => mockConfigLoader);
jest.unstable_mockModule('jsonwebtoken', () => ({ default: mockJwt }));
jest.unstable_mockModule('../app/utils/Logger.js', () => ({ log: mockLog }));

const { atomicWriteFile, atomicWriteFileSync } = await import('../app/utils/atomic-file-writer.js');
const { checkSessionAuth, verifyDownloadToken, generateDownloadToken } =
  await import('../app/utils/auth.js');
const { safeUnlink, safeRm, safeRmdirSync, safeMkdirSync, safeRenameSync, safeExistsSync } =
  await import('../app/utils/fsHelper.js');

describe('Atomic File Writer', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('atomicWriteFile', () => {
    it('should write to temp file and rename', async () => {
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
      expect(mockFs.rename).toHaveBeenCalledWith('test.txt.tmp', 'test.txt', expect.any(Function));
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
        cb(new Error('Rename failed'));
      });
      mockFs.unlink.mockImplementation((path, cb) => {
        void path;
        cb();
      });

      await expect(atomicWriteFile('test.txt', 'content')).rejects.toThrow('Rename failed');
      expect(mockFs.unlink).toHaveBeenCalledWith('test.txt.tmp', expect.any(Function));
    });

    it('should cleanup on write error', async () => {
      mockFs.writeFile.mockImplementation((path, content, enc, cb) => {
        void path;
        void content;
        void enc;
        cb(new Error('Write failed'));
      });
      mockFs.unlink.mockImplementation((path, cb) => {
        void path;
        cb();
      });

      await expect(atomicWriteFile('test.txt', 'content')).rejects.toThrow('Write failed');
      expect(mockFs.unlink).toHaveBeenCalledWith('test.txt.tmp', expect.any(Function));
    });
  });

  describe('atomicWriteFileSync', () => {
    it('should write synchronously', () => {
      atomicWriteFileSync('test.txt', 'content');
      expect(mockFs.writeFileSync).toHaveBeenCalledWith('test.txt.tmp', 'content', 'utf8');
      expect(mockFs.renameSync).toHaveBeenCalledWith('test.txt.tmp', 'test.txt');
    });

    it('should cleanup on sync error', () => {
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Sync write failed');
      });

      expect(() => atomicWriteFileSync('test.txt', 'content')).toThrow('Sync write failed');
      expect(mockFs.unlinkSync).toHaveBeenCalledWith('test.txt.tmp');
    });

    it('should handle cleanup error (ignore it) and throw original error', () => {
      mockFs.writeFileSync.mockImplementation(() => {});
      mockFs.renameSync.mockImplementation(() => {
        throw new Error('Rename failed');
      });
      mockFs.unlinkSync.mockImplementation(() => {
        throw new Error('Cleanup failed');
      });

      expect(() => atomicWriteFileSync('test.txt', 'content')).toThrow('Rename failed');
      // Should have tried to unlink
      expect(mockFs.unlinkSync).toHaveBeenCalledWith('test.txt.tmp');
    });
  });

  describe('Configuration File Operations', () => {
    it('should write configuration file atomically', async () => {
      const configPath = '/etc/boxvault/db.config.yaml';
      const configData = { sql: { dialect: 'sqlite' } };
      const yamlContent = yaml.dump(configData);

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

      await atomicWriteFile(configPath, yamlContent, 'utf8');

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        `${configPath}.tmp`,
        yamlContent,
        'utf8',
        expect.any(Function)
      );
      expect(mockFs.rename).toHaveBeenCalledWith(
        `${configPath}.tmp`,
        configPath,
        expect.any(Function)
      );
    });
  });

  describe('Paths Utility', () => {
    beforeEach(() => {
      mockConfigLoader.loadConfig.mockReset();
      jest.resetModules();
    });

    it('should use fallback storage path if config load fails', async () => {
      mockConfigLoader.loadConfig.mockImplementation(() => {
        throw new Error('Config Error');
      });

      const { getStorageRoot } = await import('../app/utils/paths.js');
      expect(getStorageRoot()).toBe('/var/lib/boxvault/storage');
    });

    it('should use configured storage path', async () => {
      mockConfigLoader.loadConfig.mockReturnValue({
        boxvault: {
          box_storage_directory: { value: '/custom/storage' },
        },
      });

      const { getStorageRoot } = await import('../app/utils/paths.js');
      expect(getStorageRoot()).toBe('/custom/storage');
    });

    it('should throw error for path traversal in getSecureBoxPath', async () => {
      const { getSecureBoxPath } = await import('../app/utils/paths.js');
      expect(() => getSecureBoxPath('..', 'etc', 'passwd')).toThrow(
        'Path traversal attempt detected'
      );
    });
  });

  describe('Auth Utilities', () => {
    beforeEach(() => {
      mockConfigLoader.loadConfig.mockReturnValue({
        auth: { jwt: { jwt_secret: { value: 'secret' } } },
      });
      mockJwt.verify.mockReset();
      mockJwt.sign.mockReset();
    });

    it('checkSessionAuth should return false if no token', async () => {
      const req = { headers: {} };
      const result = await checkSessionAuth(req);
      expect(result).toBe(false);
    });

    it('checkSessionAuth should return true and populate req on success', async () => {
      const req = { headers: { 'x-access-token': 'valid' } };
      mockJwt.verify.mockImplementation((token, secret, cb) => {
        void token;
        void secret;
        cb(null, { id: 1, isServiceAccount: true });
      });

      const result = await checkSessionAuth(req);
      expect(result).toBe(true);
      expect(req.userId).toBe(1);
      expect(req.isServiceAccount).toBe(true);
    });

    it('checkSessionAuth should default isServiceAccount to false if missing in token', async () => {
      const req = { headers: { 'x-access-token': 'valid' } };
      mockJwt.verify.mockImplementation((token, secret, cb) => {
        void token;
        void secret;
        cb(null, { id: 1 });
      });

      const result = await checkSessionAuth(req);
      expect(result).toBe(true);
      expect(req.isServiceAccount).toBe(false);
    });

    it('checkSessionAuth should return false on verify error', async () => {
      const req = { headers: { 'x-access-token': 'invalid' } };
      mockJwt.verify.mockImplementation((token, secret, cb) => {
        void token;
        void secret;
        cb(new Error('Invalid'));
      });

      const result = await checkSessionAuth(req);
      expect(result).toBe(false);
      expect(mockLog.app.debug).toHaveBeenCalledWith(
        'Session auth check failed:',
        expect.any(Object)
      );
    });

    it('verifyDownloadToken should return decoded token', async () => {
      mockJwt.verify.mockImplementation((token, secret, cb) => {
        void token;
        void secret;
        cb(null, { foo: 'bar' });
      });
      const result = await verifyDownloadToken('token');
      expect(result).toEqual({ foo: 'bar' });
    });

    it('verifyDownloadToken should throw on error', async () => {
      mockJwt.verify.mockImplementation((token, secret, cb) => {
        void token;
        void secret;
        cb(new Error('Invalid'));
      });
      await expect(verifyDownloadToken('token')).rejects.toThrow('Invalid');
    });

    it('generateDownloadToken should sign token', () => {
      mockJwt.sign.mockReturnValue('signed-token');
      const result = generateDownloadToken({ data: 1 });
      expect(result).toBe('signed-token');
      expect(mockJwt.sign).toHaveBeenCalledWith({ data: 1 }, 'secret', { expiresIn: '1h' });
    });
  });

  describe('FS Helper Utilities', () => {
    it('safeUnlink should log info on error', () => {
      mockFs.unlink.mockImplementation((path, cb) => {
        void path;
        cb(new Error('Unlink Error'));
      });
      safeUnlink('file.txt');
      expect(mockLog.app.info).toHaveBeenCalledWith(
        expect.stringContaining('Could not delete the file')
      );
    });

    it('safeUnlink should log error on exception', () => {
      mockFs.unlink.mockImplementation(() => {
        throw new Error('Sync Error');
      });
      safeUnlink('file.txt');
      expect(mockLog.app.error).toHaveBeenCalledWith(
        expect.stringContaining('Error in safeUnlink')
      );
    });

    it('safeRm should log info on error', () => {
      mockFs.rm.mockImplementation((path, options, cb) => {
        void path;
        void options;
        cb(new Error('Rm Error'));
      });
      safeRm('dir', {});
      expect(mockLog.app.info).toHaveBeenCalledWith(
        expect.stringContaining('Could not delete the directory')
      );
    });

    it('safeRm should log error on exception', () => {
      mockFs.rm.mockImplementation(() => {
        throw new Error('Sync Error');
      });
      safeRm('dir', {});
      expect(mockLog.app.error).toHaveBeenCalledWith(expect.stringContaining('Error in safeRm'));
    });

    it('safeRmdirSync should remove dir if exists', () => {
      mockFs.existsSync.mockReturnValue(true);
      safeRmdirSync('dir');
      expect(mockFs.rmSync).toHaveBeenCalledWith('dir', { force: true });
    });

    it('safeRmdirSync should skip if not exists', () => {
      mockFs.existsSync.mockReturnValue(false);
      safeRmdirSync('dir');
      expect(mockFs.rmSync).not.toHaveBeenCalled();
    });

    it('safeMkdirSync should call mkdirSync', () => {
      safeMkdirSync('dir', { recursive: true });
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('dir', { recursive: true });
    });

    it('safeRenameSync should call renameSync', () => {
      safeRenameSync('old', 'new');
      expect(mockFs.renameSync).toHaveBeenCalledWith('old', 'new');
    });

    it('safeExistsSync should call existsSync', () => {
      mockFs.existsSync.mockReturnValue(true);
      expect(safeExistsSync('path')).toBe(true);
      expect(mockFs.existsSync).toHaveBeenCalledWith('path');
    });
  });
});
