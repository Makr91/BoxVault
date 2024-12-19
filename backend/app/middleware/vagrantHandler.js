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
        'has-auth': !!req.headers["authorization"],
        'is-vagrant': req.headers['user-agent']?.startsWith('Vagrant/') || false
      }
    });

  // Check for token in Authorization header
  let token = req.headers["authorization"];
  if (!token) {
    console.log('No Authorization header found');
    return null;
  }

  // Log original token length
  const originalLength = token.length;
  
  // Remove Bearer prefix
  token = token.replace(/^Bearer\s+/, '');
  const isJWT = token.split('.').length === 3;
  
  // Log token details for debugging (without exposing token)
  console.log('Token details:', {
    originalLength,
    cleanLength: token.length,
    isJWT: isJWT,
    type: isJWT ? 'JWT' : 'Service Account'
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
      return { 
        user, 
        isServiceAccount: decoded.isServiceAccount,
        token: token 
      };
    }
  } catch (err) {
    console.log('JWT verification failed, trying service account:', {
      error: err.message
    });

    // Not a valid JWT, try as service account token
    console.log('Looking up service account token:', {
      tokenLength: token.length,
      type: 'Service Account'
    });

    const serviceAccount = await ServiceAccount.findOne({
      where: { token: token },
      include: [{
        model: User,
        as: 'user'
      }]
    });

    console.log('Service account lookup result:', {
      found: !!serviceAccount,
      hasUser: !!(serviceAccount?.user),
      userId: serviceAccount?.user?.id,
      username: serviceAccount?.user?.username
    });

    if (serviceAccount && serviceAccount.user) {
      console.log('Service account authentication successful:', {
        userId: serviceAccount.user.id,
        username: serviceAccount.user.username,
        organizationId: serviceAccount.user.organizationId
      });
      return { 
        user: serviceAccount.user, 
        isServiceAccount: true,
        token: token 
      };
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
  if (parts.length === 2 && !parts.includes('boxes') && !parts.includes('vagrant.box')) {
    // Root metadata format: /:organization/:boxName
    // This is the first request Vagrant makes to get box metadata
    // Example: /STARTcloud/alma9-server
    return {
      organization: parts[0],
      boxName: parts[1],
      isDownload: false
    };
  }

  // Handle expanded format with /boxes/
  if (parts.includes('boxes') && !parts.includes('vagrant.box')) {
    const boxesIndex = parts.indexOf('boxes');
    if (boxesIndex > 0 && boxesIndex + 1 < parts.length) {
      // Example: /STARTcloud/boxes/alma9-server
      // Example: /STARTcloud/boxes/alma9-server/metadata
      return {
        organization: parts[0],
        boxName: parts[boxesIndex + 1].replace(/\/metadata$/, ''), // Remove /metadata if present
        isDownload: false
      };
    }
  }

  // Handle API formats
  if (parts[0] === 'api') {
    // Handle /api/v2/vagrant/:org/:box format
    if (parts[1] === 'v2' && parts[2] === 'vagrant' && parts.length === 5) {
      return {
        organization: parts[3],
        boxName: parts[4],
        isDownload: false
      };
    }
    // Handle /api/organization/:org/box/:box format
    if (parts[1] === 'organization' && parts[3] === 'box' && parts.length === 5) {
      return {
        organization: parts[2],
        boxName: parts[4],
        isDownload: false
      };
    }
  }

  // Log URL parsing details for debugging
  console.log('Parsing Vagrant URL:', {
    urlPath,
    parts,
    length: parts.length,
    hasBoxes: parts.includes('boxes'),
    hasVagrantBox: parts.includes('vagrant.box'),
    firstPart: parts[0],
    secondPart: parts[1],
    isMetadataRequest: parts.length === 2 && !parts.includes('boxes') && !parts.includes('vagrant.box')
  });
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

    // Log the incoming request (with minimal header info)
    console.log('Incoming Vagrant request:', {
      url: req.url,
      originalUrl: req.originalUrl,
      method: req.method,
      headers: {
        'has-auth': !!req.headers['authorization'],
        'is-vagrant': req.headers['user-agent']?.startsWith('Vagrant/') || false,
        'accepts-json': req.headers['accept']?.includes('application/json') || false
      },
      query: req.query,
      params: req.params,
      path: req.path
    });

    // Log request sequence for debugging
    console.log('Request sequence:', {
      isHeadRequest: req.method === 'HEAD',
      isGetRequest: req.method === 'GET',
      isMetadataCheck: req.method === 'HEAD' && req.headers['accept'] === 'application/json',
      isMetadataFetch: req.method === 'GET' && req.headers['accept'] === 'application/json'
    });

    // Authenticate the request
    const auth = await authenticateVagrantRequest(req);
    if (auth) {
      req.userId = auth.user.id;
      req.isServiceAccount = auth.isServiceAccount;
      req.user = auth.user;

      // Store the clean token for later
      if (auth.isServiceAccount) {
        req.serviceAccountToken = auth.token;
      }
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
      // For metadata URLs (not download URLs), set application/json Content-Type
      // This tells Vagrant this URL points to metadata
      if (!parsedUrl.isDownload) {
        res.set({
          'Content-Type': 'application/json',
          'Content-Length': '0',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache',
          'Vary': 'Accept'
        });
      } else {
        // For box downloads, set application/octet-stream Content-Type
        // This tells Vagrant this URL points to a box file
        res.set({
          'Content-Type': 'application/octet-stream',
          'Content-Length': '0',
          'Accept-Ranges': 'bytes'
        });
      }

      // Log HEAD request handling
      console.log('Handling HEAD request:', {
        url: req.url,
        isMetadata: !parsedUrl.isDownload,
        headers: res.getHeaders(),
        parsedUrl
      });

      res.status(200).end();
      return;
    }

    // Set headers based on request type
    if (parsedUrl.isDownload) {
      // For box downloads, let the download endpoint handle streaming
      if (req.serviceAccountToken) {
        req.headers['authorization'] = `Bearer ${req.serviceAccountToken}`;
      }
    } else {
      // For metadata requests, set JSON headers
      res.set({
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Vary': 'Accept',
        'Accept-Ranges': 'bytes'
      });

      // Ensure Accept header is set for Vagrant
      if (!req.headers.accept) {
        req.headers.accept = 'application/json';
      }

      // For metadata, rewrite to API endpoint
      req.url = `/api/organization/${parsedUrl.organization}/box/${parsedUrl.boxName}`;
    }

    console.log('Request handling:', {
      url: req.url,
      isDownload: parsedUrl.isDownload,
      organization: parsedUrl.organization,
      boxName: parsedUrl.boxName,
      version: parsedUrl.version,
      provider: parsedUrl.provider,
      architecture: parsedUrl.architecture,
      headers: res.getHeaders()
    });
    
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
