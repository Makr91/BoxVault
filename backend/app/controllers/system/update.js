import { exec } from 'child_process';
import https from 'https';
import http from 'http';
import { gt } from 'semver';
import { log } from '../../utils/Logger.js';
import { loadConfig } from '../../utils/config-loader.js';

const fetchLatestVersionFromRepo = url =>
  new Promise((resolve, reject) => {
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
export const getUpdateStatus = async (req, res) => {
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
      let urlToFetch = packagesUrl;
      if (urlToFetch.endsWith('/')) {
        urlToFetch += 'Packages';
      }

      log.app.info('Fetching latest version from repository URL', { url: urlToFetch });
      candidateVersion = await fetchLatestVersionFromRepo(urlToFetch).catch(err => {
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

    const updateAvailable = gt(candidateVersion, installedVersion);

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
