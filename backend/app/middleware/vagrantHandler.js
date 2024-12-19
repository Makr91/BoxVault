const isVagrantRequest = (req) => {
  const userAgent = req.headers['user-agent'] || '';
  return userAgent.startsWith('Vagrant/');
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
  // Format: /:org/:box/versions/:version/providers/:provider/:arch/vagrant.box
  if (parts.includes('vagrant.box')) {
    const versionsIndex = parts.indexOf('versions');
    const providersIndex = parts.indexOf('providers');
    
    if (versionsIndex !== -1 && providersIndex !== -1 && parts.length >= providersIndex + 3) {
      // In the download URL, org and box are the first two parts
      return {
        organization: parts[0],
        boxName: parts[1],
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

const vagrantHandler = (req, res, next) => {
  // Only process GET and HEAD requests
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next();
  }

  // Check if this is a Vagrant request
  if (!isVagrantRequest(req)) {
    return next();
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
    // For box downloads, rewrite to our download endpoint
    // Note: Keep the URL format consistent with what we return in metadata
    req.url = `/api/file/download/${parsedUrl.organization}/${parsedUrl.boxName}/${parsedUrl.version}/${parsedUrl.provider}/${parsedUrl.architecture}/vagrant.box`;
    
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
};

module.exports = vagrantHandler;
