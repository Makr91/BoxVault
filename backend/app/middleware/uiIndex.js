import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getSiteConfig } from '../utils/config-loader.js';
import { log } from '../utils/Logger.js';

const UI_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../ui');
const BUILT_BRAND = '/brand/startcloud/';
const BRAND_FOLDER = /^\/brand\/(?<folder>[A-Za-z0-9_-]+)\//;
const SAFE_PATH = /^\/(?![/\\])/;

const escape = value =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const themeOf = site => {
  const name = site?.brand?.theme;
  return typeof name === 'string' && name.trim() !== ''
    ? { name, css: `/themes/${name}/${name}.css` }
    : null;
};

/**
 * The brand folder a site's mark lives in: the `<name>` of a logo_url shaped
 * `/brand/<name>/…`, null for the unnamed hostname or a mark kept elsewhere.
 * @param {Object|null} site - The sites map entry
 * @returns {string|null} The folder name
 */
const brandFolderOf = site => {
  const match = BRAND_FOLDER.exec(site?.brand?.logo_url || '');
  return match ? match.groups.folder : null;
};

const stampLinks = (html, folder) =>
  folder
    ? html.replace(
        /(?<head><link\b[^>]*\bhref=")\/brand\/startcloud\//g,
        `$<head>/brand/${folder}/`
      )
    : html;

const faultAttributes = fault =>
  fault
    ? ` data-error-status="${escape(fault.status)}" data-error-reference="${escape(fault.reference)}" data-error-path="${escape(fault.path)}"`
    : '';

const stamp = (html, theme, folder, fault = null) => {
  const brand = theme ? ` data-brand="${escape(theme.name)}"` : '';
  const attributes = `${brand}${faultAttributes(fault)}`;
  const htmlTag = html.indexOf('<html');
  let out =
    htmlTag < 0 ? html : `${html.slice(0, htmlTag + 5)}${attributes}${html.slice(htmlTag + 5)}`;
  if (theme) {
    const head = out.indexOf('</head>');
    if (head >= 0) {
      const link = `<link rel="stylesheet" href="${escape(theme.css)}">`;
      out = `${out.slice(0, head)}${link}${out.slice(head)}`;
    }
  }
  return stampLinks(out, folder);
};

const pageFor = path =>
  path === '/callback/' || path === '/callback' ? 'callback/index.html' : 'index.html';

/**
 * The handler answering a page GET with the served UI's index.html, read from
 * disk on every request and stamped for the site the request's hostname
 * selects: data-brand and the theme's stylesheet link before the head's end
 * when the site names a theme, never a mode, which is the person's or the
 * operating system's, every icon link of the head pointed into the site's
 * brand folder when its logo_url names one, answered no-store; the callback
 * entry is served for /callback/.
 * @param {number} [status] - The status to answer, 404 for a refused direct file address
 * @returns {Function} The Express handler
 */
const uiIndex =
  (status = 200) =>
  (req, res) => {
    let raw;
    try {
      raw = readFileSync(join(UI_ROOT, pageFor(req.path)), 'utf8');
    } catch {
      return res
        .status(404)
        .set('Cache-Control', 'no-store')
        .type('text/plain; charset=utf-8')
        .send('Not Found');
    }
    const site = getSiteConfig(req.hostname);
    const html = stamp(raw, themeOf(site), brandFolderOf(site));
    return res
      .status(status)
      .set('Cache-Control', 'no-store, no-transform')
      .type('text/html; charset=utf-8')
      .send(html);
  };

const pathOf = req => {
  const [raw] = String(req.originalUrl || '/').split('?');
  try {
    const path = encodeURI(decodeURI(raw));
    return SAFE_PATH.test(path) ? path : '/';
  } catch {
    return '/';
  }
};

/**
 * Answer a refused browser navigation with the served UI's index.html in place
 * of the problem body: read from disk and stamped for the site as `uiIndex`
 * stamps it, plus `data-error-status`, `data-error-reference` (sixteen
 * lowercase hex characters minted for this answer and logged with the status,
 * the path and the problem type) and `data-error-path` (the request path,
 * percent-encoded, no query, `/` when it does not start with a single slash)
 * on `<html>`, answered with the fault's own status, no-store.
 * @param {import('express').Request} req - The request
 * @param {import('express').Response} res - The response
 * @param {{status: number, type: string}} fault - The fault's status and problem type
 * @returns {import('express').Response|null} The response, or null when the page cannot be read
 */
const errorPage = (req, res, { status, type }) => {
  let raw;
  try {
    raw = readFileSync(join(UI_ROOT, 'index.html'), 'utf8');
  } catch {
    return null;
  }
  const fault = { status, reference: randomBytes(8).toString('hex'), path: pathOf(req) };
  const line = { reference: fault.reference, status, path: fault.path, type };
  if (status >= 500) {
    log.error.error('Error page answered', line);
  } else {
    log.app.warn('Error page answered', line);
  }
  const site = getSiteConfig(req.hostname);
  const html = stamp(raw, themeOf(site), brandFolderOf(site), fault);
  return res
    .status(status)
    .set('Cache-Control', 'no-store, no-transform')
    .type('text/html; charset=utf-8')
    .send(html);
};

/**
 * The handler answering /manifest.json per host: for a hostname whose sites
 * entry names a brand folder, the built manifest with name and short_name
 * from the site's brand name and every icon src moved into that folder,
 * answered no-cache; every other hostname falls through to the file as built.
 * @param {import('express').Request} req - The request
 * @param {import('express').Response} res - The response
 * @param {import('express').NextFunction} next - The static file handler
 * @returns {*} The stamped manifest, or the next handler's result
 */
const uiManifest = (req, res, next) => {
  const site = getSiteConfig(req.hostname);
  const folder = brandFolderOf(site);
  if (!folder) {
    return next();
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(UI_ROOT, 'manifest.json'), 'utf8'));
  } catch {
    return next();
  }
  const name = site.brand?.name || manifest.name;
  return res
    .set('Cache-Control', 'no-cache')
    .type('application/manifest+json')
    .send(
      JSON.stringify({
        ...manifest,
        name,
        short_name: name,
        icons: (manifest.icons || []).map(icon => ({
          ...icon,
          src: String(icon.src).replace(BUILT_BRAND, `/brand/${folder}/`),
        })),
      })
    );
};

export { uiIndex, uiManifest, brandFolderOf, errorPage };
