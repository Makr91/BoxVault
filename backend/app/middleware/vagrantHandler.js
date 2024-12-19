const isVagrantRequest = (req) => {
  const userAgent = req.headers['user-agent'] || '';
  return userAgent.startsWith('Vagrant/');
};

const parseVagrantUrl = (url) => {
  // Expected format: /:organization/:boxName
  const parts = url.split('/').filter(Boolean);
  if (parts.length !== 2) return null;

  return {
    organization: parts[0],
    boxName: parts[1]
  };
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

  // Rewrite the URL to our API format
  req.url = `/api/organization/${parsedUrl.organization}/box/${parsedUrl.boxName}`;
  
  // Store original URL and Vagrant flag for use in controller
  req.originalVagrantUrl = req.url;
  req.isVagrantRequest = true;

  next();
};

module.exports = vagrantHandler;
