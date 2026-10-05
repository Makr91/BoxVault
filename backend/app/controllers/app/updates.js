import { exec } from 'child_process';
import { promises, readFileSync } from 'fs';
import https from 'https';
import http from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { coerce, gt } from 'semver';
import { log } from '../../utils/Logger.js';
import { loadConfig } from '../../utils/config-loader.js';
import { problem } from '../../utils/problem.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { version: packageVersion } = JSON.parse(
  readFileSync(join(__dirname, '../../../package.json'), 'utf8')
);

const RELEASE_PACKAGE = 'boxvault';
const PACKAGE_NAMES = [RELEASE_PACKAGE, 'boxvault-dev'];
const RELEASES_URL = 'https://github.com/Makr91/BoxVault/releases';
const DATA_DIRECTORY = '/var/lib/boxvault';
const UPDATE_REQUEST_PATH = `${DATA_DIRECTORY}/update.request`;

const fetchLatestVersionFromRepo = (url, packageName) =>
  new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;

    const req = client.get(url, res => {
      try {
        if (res.statusCode !== 200) {
          res.resume();
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
            if (pkg.trim().split('\n')[0].trim() === `Package: ${packageName}`) {
              const versionMatch = pkg.match(/^Version: (?<version>.*)$/m);
              if (versionMatch?.groups?.version) {
                resolve(versionMatch.groups.version.trim());
                return;
              }
            }
          }
          reject(new Error(`Could not find ${packageName} package in Packages file`));
        });
      } catch (e) {
        reject(e);
      }
    });

    req.on('error', err => {
      reject(err);
    });
  });

const getVersion = command =>
  new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      const found = stdout.trim();
      if (!found) {
        reject(new Error(`Command returned empty version: ${command}`));
        return;
      }
      resolve(found);
    });
  });

const installedVersion = packageName =>
  getVersion(`dpkg-query --show --showformat='\${Version}' ${packageName}`);

const watchActive = () =>
  new Promise(resolve => {
    exec('systemctl is-active boxvault-update.path', error => resolve(!error));
  });

const resolveInstalled = ([packageName, ...rest]) =>
  installedVersion(packageName)
    .then(version => ({ packageName, version }))
    .catch(error => {
      if (rest.length === 0) {
        throw error;
      }
      return resolveInstalled(rest);
    });

const candidateFromRepository = (packagesUrl, packageName) => {
  const urlToFetch = packagesUrl.endsWith('/') ? `${packagesUrl}Packages` : packagesUrl;
  log.app.info('Fetching latest version from repository URL', { url: urlToFetch });
  return fetchLatestVersionFromRepo(urlToFetch, packageName).catch(err => {
    log.app.warn('Failed to fetch from repository URL, falling back to apt-cache.', {
      error: err.message,
    });
    return null;
  });
};

const isNewer = (latest, current) => {
  const latestVersion = coerce(latest);
  const currentVersion = coerce(current);
  return Boolean(latestVersion && currentVersion) && gt(latestVersion, currentVersion);
};

const releaseUrlOf = latest => {
  if (!latest) {
    return null;
  }
  const tag = coerce(latest)?.version || latest;
  return `${RELEASES_URL}/tag/v${tag}`;
};

/**
 * The installed and the published version of the BoxVault package: the
 * installed one from dpkg-query, boxvault first and boxvault-dev second, the
 * published one of that same package from the configured Packages file or
 * apt-cache, compared on their coerced semantic versions so a Debian revision
 * never fails the comparison; a host where neither can be read is not managed
 * by apt and answers this build's own version and no latest one
 * @returns {Promise<{package_name: string|null, current_version: string, latest_version: string|null, update_available: boolean, is_apt_managed: boolean}>} The update state
 */
const resolveUpdate = async () => {
  const packagesUrl = loadConfig('app').boxvault?.repository_packages_url;
  try {
    const { packageName, version: installed } = await resolveInstalled(PACKAGE_NAMES);
    const candidate =
      (packagesUrl ? await candidateFromRepository(packagesUrl, packageName) : null) ||
      (await getVersion(`apt-cache policy ${packageName} | grep Candidate | cut -d ' ' -f 4`));
    return {
      package_name: packageName,
      current_version: installed,
      latest_version: candidate,
      update_available: isNewer(candidate, installed),
      is_apt_managed: true,
    };
  } catch (error) {
    log.app.warn('Update check failed, assuming not managed by apt.', { error: error.message });
    return {
      package_name: null,
      current_version: packageVersion,
      latest_version: null,
      update_available: false,
      is_apt_managed: false,
    };
  }
};

/**
 * @swagger
 * /api/app/updates/check:
 *   get:
 *     summary: Check for application updates
 *     description: Reads the installed package version with dpkg-query, boxvault first and boxvault-dev second, and the published version of that same package from boxvault.repository_packages_url, falling back to apt-cache, and says whether a newer one is published, comparing the two as semantic versions with any Debian revision dropped. Always 200; a host where neither package is installed is not managed by apt and answers this build's own version, latest_version null and update_available false. Global admins only; a service account is refused unless it is a live superadmin account.
 *     tags: [System]
 *     security:
 *       - JwtAuth: []
 *     responses:
 *       200:
 *         description: The update state
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [current_version, latest_version, update_available, release_url, release_date, changelog, is_apt_managed]
 *               properties:
 *                 current_version:
 *                   type: string
 *                   example: "0.106.0"
 *                 latest_version:
 *                   type: string
 *                   nullable: true
 *                   description: The published version, null while it cannot be read
 *                   example: "0.107.0"
 *                 update_available:
 *                   type: boolean
 *                   example: true
 *                 release_url:
 *                   type: string
 *                   nullable: true
 *                   description: The GitHub release of latest_version without its Debian revision, null while no latest version is known
 *                   example: https://github.com/Makr91/BoxVault/releases/tag/v0.107.0
 *                 release_date:
 *                   type: string
 *                   nullable: true
 *                   description: Always null; the Packages file carries no date
 *                   example: null
 *                 changelog:
 *                   type: string
 *                   example: https://github.com/Makr91/BoxVault/releases
 *                 is_apt_managed:
 *                   type: boolean
 *                   example: true
 *       403:
 *         description: The caller is not a global admin, or is a service account other than a live superadmin one
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const checkUpdate = async (req, res) => {
  void req;
  const state = await resolveUpdate();
  return res.status(200).json({
    current_version: state.current_version,
    latest_version: state.latest_version,
    update_available: state.update_available,
    release_url: releaseUrlOf(state.latest_version),
    release_date: null,
    changelog: RELEASES_URL,
    is_apt_managed: state.is_apt_managed,
  });
};

/**
 * @swagger
 * /api/app/updates/apply:
 *   post:
 *     summary: Apply the published application update
 *     description: Writes the target version to /var/lib/boxvault/update.request, which the package's root-owned boxvault-update.path unit watches; its boxvault-update.service removes the request and runs apt-get install -y --only-upgrade boxvault as root outside this service, so the upgrade may restart the service. Answers before the upgrade runs. Refused when the host is not managed by apt, when the installed package is boxvault-dev, which is checked but never applied from here, when no newer version is published, or when boxvault-update.path is not active, as on a host without systemd. Global admins only; a service account is refused unless it is a live superadmin account.
 *     tags: [System]
 *     security:
 *       - JwtAuth: []
 *     responses:
 *       202:
 *         description: The upgrade was requested
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [message, task_id, target_version]
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Updating to 0.107.0; the service restarts when the upgrade finishes.
 *                 task_id:
 *                   type: string
 *                   nullable: true
 *                   description: Always null; the upgrade runs outside any task queue
 *                   example: null
 *                 target_version:
 *                   type: string
 *                   example: "0.107.0"
 *       400:
 *         description: The host is not managed by apt, runs boxvault-dev, already runs the published version, or has no active boxvault-update.path unit
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       403:
 *         description: The caller is not a global admin, or is a service account other than a live superadmin one
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: The update request could not be written
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const applyUpdate = async (req, res) => {
  const state = await resolveUpdate();
  if (!state.is_apt_managed) {
    return problem(res, req, {
      status: 400,
      type: 'bad-request',
      title: req.__('updates.notAptManaged'),
    });
  }
  if (state.package_name !== RELEASE_PACKAGE) {
    return problem(res, req, {
      status: 400,
      type: 'bad-request',
      title: req.__('updates.devPackage'),
    });
  }
  if (!state.update_available) {
    return problem(res, req, {
      status: 400,
      type: 'bad-request',
      title: req.__('updates.upToDate', { version: state.current_version }),
    });
  }
  if (!(await watchActive())) {
    return problem(res, req, {
      status: 400,
      type: 'bad-request',
      title: req.__('updates.watchInactive'),
    });
  }

  try {
    await promises.writeFile(UPDATE_REQUEST_PATH, state.latest_version);
  } catch (error) {
    log.error.error('Application update request could not be written', {
      error: error.message,
      path: UPDATE_REQUEST_PATH,
      target_version: state.latest_version,
    });
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('updates.launchFailed'),
    });
  }

  log.app.info('Application update requested', {
    current_version: state.current_version,
    target_version: state.latest_version,
    path: UPDATE_REQUEST_PATH,
  });
  return res.status(202).json({
    message: req.__('updates.launched', { version: state.latest_version }),
    task_id: null,
    target_version: state.latest_version,
  });
};
