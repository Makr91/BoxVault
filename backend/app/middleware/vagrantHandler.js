const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const jwt = require("jsonwebtoken");
const db = require("../models");
const User = db.user;
const ServiceAccount = db.service_account;

const authConfigPath = path.join(__dirname, '../config/auth.config.yaml');
let authConfig;
try {
  const fileContents = fs.readFileSync(authConfigPath, 'utf8');
  authConfig = yaml.load(fileContents);
} catch (e) {
  console.error(`Failed to load auth configuration: ${e.message}`);
}

const isVagrantRequest = (req) => {
  const userAgent = req.headers['user-agent'] || '';
  return userAgent.startsWith('Vagrant/');
};

const authenticateVagrantRequest = async (req) => {
  console.log('Authenticating Vagrant request:', {
    headers: {
      'authorization': !!req.headers["authorization"],
      'user-agent': req.headers['user-agent']
    }
  });

  // Check for token in Authorization header
  let token = req.headers["authorization"];
  if (!token) {
    console.log('No Authorization header found');
    return null;
  }

  // Log raw token for debugging
  console.log('Raw Authorization header:', {
    value: token,
    length: token.length
  });

  // Remove Bearer if present
  token = token.replace(/^Bearer\s+/, '');
  console.log('Processed token:', {
    value: token,
    isJWT: token.split('.').length === 3,
    length: token.length,
    startsWithBearer: token.startsWith('Bearer')
  });

  try {
    // First try as JWT token
    const decoded = await jwt.verify(token, authConfig.jwt.jwt_secret.value);
    if (decoded.id) {
      const user = await User.findByPk(decoded.id);
      console.log('JWT authentication successful:', {
        userId: decoded.id,
        isServiceAccount: decoded.isServiceAccount
      });
      return { user, isServiceAccount: decoded.isServiceAccount };
    }
  } catch (err) {
    console.log('JWT verification failed, trying service account:', {
      error: err.message
    });

    // Not a valid JWT, try as service account token
    const serviceAccount = await ServiceAccount.findOne({
      where: { token },
      include: [{
        model: User,
        as: 'user'
      }]
    });

    if (serviceAccount && serviceAccount.user) {
      console.log('Service account authentication successful:', {
        userId: serviceAccount.user.id,
        username: serviceAccount.user.username
      });
      return { user: serviceAccount.user, isServiceAccount: true };
    }
  }

  console.log('Authentication failed: No valid token found');
  return null;
};

const parseVagrantUrl = (url) => {
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
    
    if (boxesIndex !== -1 && versionsIndex !== -1 && providersIndex !== -1 && 
        parts.length >= providersIndex + 2) {
      return {
        organization: parts[0],
        boxName: parts[boxesIndex + 1],
        isDownload: true,
        version: parts[versionsIndex + 1],
        provider: parts[providersIndex + 1],
        architecture: parts[providersIndex + 2]
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
      isDownload: false
    };
  } else if (parts.length === 3 && parts[1] === 'boxes') {
    // Expanded format: /:organization/boxes/:boxName
    return {
      organization: parts[0],
      boxName: parts[2],
      isDownload: false
    };
  } else if (parts.length === 5 && parts[0] === 'api' && parts[1] === 'v2' && parts[2] === 'vagrant') {
    // API format: /api/v2/vagrant/:organization/:boxName
    return {
      organization: parts[3],
      boxName: parts[4],
      isDownload: false
    };
  }
  return null;
};

const vagrantHandler = async (req, res, next) => {
  try {
    // Only process GET and HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    // Check if this is a Vagrant request
    req.isVagrantRequest = isVagrantRequest(req);
    if (!req.isVagrantRequest) {
      return next();
    }

    // Authenticate the request
    const auth = await authenticateVagrantRequest(req);
    if (auth) {
      req.userId = auth.user.id;
      req.isServiceAccount = auth.isServiceAccount;
      req.user = auth.user;
    }

  // Parse the URL
  const parsedUrl = parseVagrantUrl(req.url);
  if (!parsedUrl) {
    console.log('Not a Vagrant URL format:', {
      url: req.url,
      method: req.method,
      headers: req.headers
    });
    return next();
  }

  // Log parsed URL and authentication details
  console.log('Vagrant request details:', {
    parsedUrl,
    auth: {
      hasToken: !!req.headers["authorization"],
      userId: req.userId,
      isServiceAccount: req.isServiceAccount
    },
    headers: req.headers,
    method: req.method
  });

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
        'Vary': 'Accept'
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
      architecture: parsedUrl.architecture
    };

    // Log request details for debugging
    console.log('Vagrant Request:', {
      ...req.vagrantInfo,
      userAgent: req.headers['user-agent'],
      headers: res.getHeaders()
    });

    next();
  } catch (error) {
    console.error('Error in vagrant handler:', error);
    res.status(500).json({ 
      message: "Internal server error processing Vagrant request",
      error: error.message 
    });
  }
};

module.exports = vagrantHandler;
