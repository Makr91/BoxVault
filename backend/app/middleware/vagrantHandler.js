const db = require('../models');
const { log } = require('../utils/Logger');
const ServiceAccount = db.service_account;
const User = db.user;

const isVagrantRequest = req => {
  const userAgent = req.headers['user-agent'] || '';
  return userAgent.startsWith('Vagrant/');
};

const extractBearerToken = req => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
};

const validateVagrantToken = async token => {
  if (!token) {
    log.app.info('No token provided for validation');
    return null;
  }

  try {
    log.app.info('Attempting to validate token:', `${token.substring(0, 8)}...`);
    const serviceAccount = await ServiceAccount.findOne({
      where: {
        token,
        expiresAt: {
          [db.Sequelize.Op.or]: {
            [db.Sequelize.Op.gt]: new Date(),
            [db.Sequelize.Op.eq]: null,
          },
        },
      },
      include: [
        {
          model: User,
          as: 'user',
        },
      ],
    });

    if (!serviceAccount) {
      log.app.info('No service account found for token');
      return null;
    }

    if (!serviceAccount.user) {
      log.app.info('Service account found but no associated user');
      return null;
    }

    log.app.info('Successfully validated token for user:', serviceAccount.user.id);
    return {
      userId: serviceAccount.user.id,
      isServiceAccount: true,
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
  const urlPath = url.split('?')[0];
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
  if (req.url.match(/\.(ico|png|jpg|jpeg|gif|css|js|json|svg|woff|woff2|ttf|eot)$/)) {
    return next();
  }

  // Check if this is a Vagrant request
  req.isVagrantRequest = isVagrantRequest(req);
  if (!req.isVagrantRequest) {
    return next();
  }

  // For Vagrant requests, validate the Bearer token
  const bearerToken = extractBearerToken(req);
  if (bearerToken) {
    const authInfo = await validateVagrantToken(bearerToken);
    if (authInfo) {
      req.userId = authInfo.userId;
      req.isServiceAccount = authInfo.isServiceAccount;
    }
  }

  // Parse the URL
  const parsedUrl = parseVagrantUrl(req.url);
  if (!parsedUrl) {
    return next();
  }

  // For HEAD requests, handle metadata detection
  if (req.method === 'HEAD') {
    // Only set Content-Type to indicate this is metadata
    res.set('Content-Type', 'application/json');
    res.status(200).end();
    return;
  }

  // For box downloads
  if (parsedUrl.isDownload) {
    // For box downloads, rewrite Vagrant's URL format to our API endpoint
    req.url = `/api/organization/${parsedUrl.organization}/box/${parsedUrl.boxName}/version/${parsedUrl.version}/provider/${parsedUrl.provider}/architecture/${parsedUrl.architecture}/file/download`;

    // Don't set Content-Type for downloads
    // Let the download endpoint handle streaming the file
    next();
    return;
  }

  // For GET requests to metadata endpoint
  if (!parsedUrl.isDownload) {
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
  }

  // Rewrite the URL to our API format
  req.url = `/api/organization/${parsedUrl.organization}/box/${parsedUrl.boxName}/metadata`;

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

  // Log request details for debugging
  log.app.info('Vagrant Request:', {
    ...req.vagrantInfo,
    userAgent: req.headers['user-agent'],
    headers: res.getHeaders(),
  });

  next();
};

module.exports = vagrantHandler;
