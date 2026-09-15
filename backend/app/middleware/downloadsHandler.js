import { log } from '../utils/Logger.js';
import { getSiteConfig } from '../utils/config-loader.js';

const ROOT_ROUTERS = ['api', 'scim', 'badge'];

const apiPathFor = (organization, [product, release, patch, file]) => {
  const base = `/api/organization/${organization}/download`;
  if (!product) {
    return base;
  }
  if (!release) {
    return `${base}/${product}`;
  }
  if (!patch) {
    return `${base}/${product}/release/${release}`;
  }
  if (!file) {
    return `${base}/${product}/release/${release}/patch/${patch}`;
  }
  return `${base}/${product}/release/${release}/patch/${patch}/file/${file}/download`;
};

const parseDownloadsUrl = (url, downloadsFirst) => {
  const [urlPath, query] = url.split('?');
  const parts = urlPath.split('/').filter(Boolean);
  if (parts.length === 0 || ROOT_ROUTERS.includes(parts[0])) {
    return null;
  }
  if (!downloadsFirst && parts[1] !== 'downloads') {
    return null;
  }
  const rest = downloadsFirst ? parts.slice(1) : parts.slice(2);
  if (rest.length > 4) {
    return null;
  }
  return { organization: parts[0], rest, query };
};

/**
 * The one-address rule of the downloads collection: a GET or HEAD under
 * /{org}/downloads/... (or under /{org}/... on a hostname whose first
 * collection is downloads) whose Accept does not name text/html is rewritten
 * to the matching /api/organization/:org/download/... route, a product,
 * release or patch address to its JSON read and a file address, by key or by
 * file name, to the download route; a browser falls through to the SPA.
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Next handler
 * @returns {*} The next handler's result
 */
const downloadsHandler = (req, res, next) => {
  void res;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next();
  }
  if ((req.headers.accept || '').includes('text/html')) {
    return next();
  }
  const site = getSiteConfig(req.hostname);
  const parsed = parseDownloadsUrl(req.url, site?.collections?.[0] === 'downloads');
  if (!parsed) {
    return next();
  }
  const [product, release, patch, file] = parsed.rest;
  req.downloadsInfo = {
    originalUrl: req.originalUrl,
    organization: parsed.organization,
    product,
    release,
    patch,
    file,
  };
  const apiPath = apiPathFor(parsed.organization, parsed.rest);
  req.url = parsed.query ? `${apiPath}?${parsed.query}` : apiPath;
  log.app.info('Downloads request:', { ...req.downloadsInfo, url: req.url });
  return next();
};

export default downloadsHandler;
