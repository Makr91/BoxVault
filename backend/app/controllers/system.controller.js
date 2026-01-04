const fs = require('fs');
const { exec } = require('child_process');
const https = require('https');
const http = require('http');
const { log } = require('../utils/Logger');
const semver = require('semver');
const { loadConfig } = require('../utils/config-loader');
const { getStorageRoot } = require('../utils/paths');
const { getIsoStorageRoot } = require('./iso/helpers');

/**
 * @swagger
 * /api/system/storage:
 *   get:
 *     summary: Get storage usage information
 *     description: Retrieve disk space usage for Box and ISO storage locations. Requires Node.js v18.15.0 or later.
 *     tags: [System]
 *     security:
 *       - JwtAuth: []
 *     responses:
 *       200:
 *         description: Storage information retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 boxes:
 *                   $ref: '#/components/schemas/StorageInfo'
 *                 isos:
 *                   $ref: '#/components/schemas/StorageInfo'
 *       500:
 *         description: Internal server error.
 *       501:
 *         description: Not supported on this Node.js version.
 */
exports.getStorageInfo = async (req, res) => {
  void req;
  if (!fs.promises.statfs) {
    return res.status(501).json({
      error: 'NOT_SUPPORTED',
      message: 'Disk usage monitoring requires Node.js v18.15.0 or later',
    });
  }

  try {
    const boxPath = getStorageRoot();
    const isoPath = getIsoStorageRoot();

    const getUsage = async dirPath => {
      if (!fs.existsSync(dirPath)) {
        return null;
      }
      const stats = await fs.promises.statfs(dirPath);
      return {
        path: dirPath,
        total: stats.blocks * stats.bsize,
        free: stats.bavail * stats.bsize,
        used: (stats.blocks - stats.bfree) * stats.bsize,
      };
    };

    const [boxUsage, isoUsage] = await Promise.all([getUsage(boxPath), getUsage(isoPath)]);

    return res.json({ boxes: boxUsage, isos: isoUsage });
  } catch (error) {
    log.error.error('Error getting storage info', { error: error.message });
    return res.status(500).send({ message: 'Failed to retrieve storage information' });
  }
};

const fetchLatestVersionFromRepo = url =>
  new Promise((resolve, reject) => {
    if (!url) {
      // This is not an error, just means it's not configured.
      resolve(null);
      return;
    }

    const client = url.startsWith('https') ? https : http;

    const req = client.get(url, res => {
      try {
        if (res.statusCode !== 200) {
          res.resume(); // Consume response data to free up memory
          reject(new Error(`Failed to fetch Packages file: Status Code ${res.statusCode}`));
          return;
        }

        let data = '';
        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          const packages = data.split('\n\n');
          for (const pkg of packages) {
            if (pkg.trim().startsWith('Package: boxvault')) {
              const versionMatch = pkg.match(/^Version: (?<version>.*)$/m);
              if (versionMatch?.groups?.version) {
                resolve(versionMatch.groups.version.trim());
                return;
              }
            }
          }
          reject(new Error('Could not find boxvault package in Packages file'));
        });
      } catch (e) {
        reject(e);
      }
    });

    req.on('error', err => {
      reject(err);
    });
  });

/**
 * @swagger
 * /api/system/update-check:
 *   get:
 *     summary: Check for application updates
 *     description: Checks if the application was installed via APT and if a newer version is available in the repository.
 *     tags: [System]
 *     security:
 *       - JwtAuth: []
 *     responses:
 *       200:
 *         description: Update status retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isAptManaged:
 *                   type: boolean
 *                 updateAvailable:
 *                   type: boolean
 *                 currentVersion:
 *                   type: string
 *                 latestVersion:
 *                   type: string
 */
exports.getUpdateStatus = async (req, res) => {
  void req;
  const packageName = 'boxvault';
  const appConfig = loadConfig('app');
  const packagesUrl = appConfig.boxvault?.repository_packages_url?.value;

  const getVersion = command =>
    new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        const version = stdout.trim();
        if (!version) {
          reject(new Error(`Command returned empty version: ${command}`));
          return;
        }
        resolve(version);
      });
    });

  try {
    const installedVersionCmd = `dpkg-query --show --showformat='\${Version}' ${packageName}`;
    let candidateVersion;

    if (packagesUrl) {
      log.app.info('Fetching latest version from repository URL', { url: packagesUrl });
      candidateVersion = await fetchLatestVersionFromRepo(packagesUrl).catch(err => {
        log.app.warn('Failed to fetch from repository URL, falling back to apt-cache.', {
          error: err.message,
        });
        return null;
      });
    }

    if (!candidateVersion) {
      const candidateVersionCmd = `apt-cache policy ${packageName} | grep Candidate | cut -d ' ' -f 4`;
      candidateVersion = await getVersion(candidateVersionCmd);
    }

    const installedVersion = await getVersion(installedVersionCmd);

    const updateAvailable = semver.gt(candidateVersion, installedVersion);

    return res.status(200).json({
      isAptManaged: true,
      updateAvailable,
      currentVersion: installedVersion,
      latestVersion: candidateVersion,
    });
  } catch (error) {
    log.app.warn('Update check failed, assuming not managed by apt.', { error: error.message });
    return res.status(200).json({
      isAptManaged: false,
      updateAvailable: false,
      currentVersion: 'unknown',
      latestVersion: 'unknown',
    });
  }
};
