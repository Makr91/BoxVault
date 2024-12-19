const isVagrantRequest = (req) => {
  const userAgent = req.headers['user-agent'] || '';
  return userAgent.startsWith('Vagrant/');
};

const parseVagrantUrl = (url) => {
  // Remove any query parameters
  const urlPath = url.split('?')[0];
  const parts = urlPath.split('/').filter(Boolean);

  // Handle both formats:
  // 1. /:organization/:boxName
  // 2. /:organization/boxes/:boxName
  if (parts.length === 2) {
    return {
      organization: parts[0],
      boxName: parts[1]
    };
  } else if (parts.length === 3 && parts[1] === 'boxes') {
    return {
      organization: parts[0],
      boxName: parts[2]
    };
  }
  return null;
};

const vagrantHandler = (req, res, next) => {
  // Only process GET requests
  if (req.method !== 'GET') {
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

  // Set proper headers for Vagrant
  res.set({
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  });

  // Rewrite the URL to our API format
  req.url = `/api/organization/${parsedUrl.organization}/box/${parsedUrl.boxName}`;
  
  // Store original URL and Vagrant flag for use in controller
  req.originalVagrantUrl = req.url;
  req.isVagrantRequest = true;

  // Log request details for debugging
  console.log('Vagrant Request:', {
    originalUrl: req.originalUrl,
    rewrittenUrl: req.url,
    userAgent: req.headers['user-agent']
  });

  next();
};

module.exports = vagrantHandler;
