import { log } from '../utils/Logger.js';
import { extractBearerToken, findServiceAccountByRawToken } from '../utils/serviceAccountAuth.js';
import { t, getDefaultLocale } from '../config/i18n.js';

const isVagrantRequest = req => {
  const userAgent = req.headers['user-agent'] || '';
  return userAgent.startsWith('Vagrant/');
};

const validateVagrantToken = async token => {
  try {
    log.app.info('Attempting to validate token:', `${token.substring(0, 8)}...`);
    const serviceAccount = await findServiceAccountByRawToken(token);

    if (!serviceAccount) {
      log.app.info('No valid service account found for token');
      return null;
    }

    log.app.info('Successfully validated token for user:', serviceAccount.user.id);
    // Service accounts impersonate their owning user
    return {
      userId: serviceAccount.user.id,
      isServiceAccount: true,
      serviceAccountId: serviceAccount.id,
    };
  } catch (err) {
    log.error.error('Error validating vagrant token:', {
      error: err.message,
      stack: err.stack,
      token: `${token.substring(0, 8)}...`,
    });
  }

  return null;
};

const parseVagrantUrl = url => {
  // Remove any query parameters
  const [urlPath] = url.split('?');
  const parts = urlPath.split('/').filter(Boolean);

  // Handle all formats that Vagrant uses:
  // 1. /:organization/:boxName (shorthand format)
  // 2. /:organization/boxes/:boxName (expanded format)
  // 3. /api/v2/vagrant/:organization/:boxName (API format)
  // 4. /:organization/boxes/:boxName/versions/:version/providers/:provider/:arch/vagrant.box (download format)

  // First check if this is a box download URL
  // Format: /:org/boxes/:box/versions/:version/providers/:provider/:arch/vagrant.box
  if (parts.includes('vagrant.box')) {
    const boxesIndex = parts.indexOf('boxes');
    const versionsIndex = parts.indexOf('versions');
    const providersIndex = parts.indexOf('providers');

    if (
      boxesIndex !== -1 &&
      versionsIndex !== -1 &&
      providersIndex !== -1 &&
      parts.length >= providersIndex + 2
    ) {
      return {
        organization: parts[0],
        boxName: parts[boxesIndex + 1],
        isDownload: true,
        version: parts[versionsIndex + 1],
        provider: parts[providersIndex + 1],
        architecture: parts[providersIndex + 2],
      };
    }
    return null;
  }

  // Then handle metadata request formats
  if (parts.length === 2) {
    // Shorthand format: /:organization/:boxName
    return {
      organization: parts[0],
      boxName: parts[1],
      isDownload: false,
    };
  } else if (parts.length === 3 && parts[1] === 'boxes') {
    // Expanded format: /:organization/boxes/:boxName
    return {
      organization: parts[0],
      boxName: parts[2],
      isDownload: false,
    };
  } else if (
    parts.length === 5 &&
    parts[0] === 'api' &&
    parts[1] === 'v2' &&
    parts[2] === 'vagrant'
  ) {
    // API format: /api/v2/vagrant/:organization/:boxName
    return {
      organization: parts[3],
      boxName: parts[4],
      isDownload: false,
    };
  }
  return null;
};

const vagrantHandler = async (req, res, next) => {
  // Only process GET and HEAD requests
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next();
  }

  // Skip static files
  if (req.url.match(/\.(?:ico|png|jpg|jpeg|gif|css|js|json|svg|woff|woff2|ttf|eot)$/)) {
    return next();
  }

  // Check if this is a Vagrant request
  req.isVagrantRequest = isVagrantRequest(req);
  if (!req.isVagrantRequest) {
    return next();
  }

  // For Vagrant requests, validate the Bearer token. A PRESENTED token that
  // fails validation is rejected immediately — it must never silently degrade
  // to anonymous access. Requests with no credentials stay anonymous so public
  // box downloads keep working. (This middleware runs before the i18n
  // middleware, so translation goes through t() with the default locale.)
  const bearerToken = extractBearerToken(req);
  if (bearerToken) {
    const authInfo = await validateVagrantToken(bearerToken);
    if (!authInfo) {
      log.app.warn('Vagrant request presented an invalid or expired service account token', {
        url: req.url,
      });
      return res.status(401).json({ message: t('auth.vagrantInvalidToken', getDefaultLocale()) });
    }
    req.userId = authInfo.userId;
    req.isServiceAccount = authInfo.isServiceAccount;
    req.serviceAccountId = authInfo.serviceAccountId;
  }

  // Parse the URL
  const parsedUrl = parseVagrantUrl(req.url);
  if (!parsedUrl) {
    return next();
  }

  // Store parsed URL info for the controller
  req.vagrantInfo = {
    originalUrl: req.originalUrl,
    organization: parsedUrl.organization,
    boxName: parsedUrl.boxName,
    // Store the full requested name for Vagrant metadata
    requestedName: `${parsedUrl.organization}/${parsedUrl.boxName}`,
    isDownload: parsedUrl.isDownload,
    version: parsedUrl.version,
    provider: parsedUrl.provider,
    architecture: parsedUrl.architecture,
  };

  // For HEAD requests, handle metadata detection (ONLY if not a download)
  if (req.method === 'HEAD' && !parsedUrl.isDownload) {
    // Only set Content-Type to indicate this is metadata
    res.set('Content-Type', 'application/json');
    res.status(200).end();
    return undefined;
  }

  // For box downloads
  if (parsedUrl.isDownload) {
    // For box downloads, rewrite Vagrant's URL format to our API endpoint
    req.url = `/api/organization/${parsedUrl.organization}/box/${parsedUrl.boxName}/version/${parsedUrl.version}/provider/${parsedUrl.provider}/architecture/${parsedUrl.architecture}/file/download`;

    // Don't set Content-Type for downloads
    // Let the download endpoint handle streaming the file

    log.app.info('Vagrant Download Request:', {
      ...req.vagrantInfo,
      userAgent: req.headers['user-agent'],
    });

    next();
    return undefined;
  }

  // For GET requests to metadata endpoint
  // Set headers for JSON metadata response
  res.set({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    Vary: 'Accept',
  });

  // Ensure Accept header is set for Vagrant
  if (!req.headers.accept) {
    req.headers.accept = 'application/json';
  }

  // Rewrite the URL to our API format
  req.url = `/api/organization/${parsedUrl.organization}/box/${parsedUrl.boxName}/metadata`;

  // Log request details for debugging
  log.app.info('Vagrant Request:', {
    ...req.vagrantInfo,
    userAgent: req.headers['user-agent'],
    headers: res.getHeaders(),
  });

  return next();
};

export default vagrantHandler;
