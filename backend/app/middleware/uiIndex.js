import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getSiteConfig } from '../utils/config-loader.js';

const UI_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../ui');
const BUILT_BRAND = '/brand/startcloud/';
const BRAND_FOLDER = /^\/brand\/(?<folder>[A-Za-z0-9_-]+)\//;

const escape = value =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const packOf = site => {
  const name = site?.brand?.pack;
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

const stamp = (html, theme, pack, folder) => {
  let attributes = ` data-brand-theme="${escape(theme)}"`;
  if (pack) {
    attributes += ` data-brand="${escape(pack.name)}"`;
  }
  const htmlTag = html.indexOf('<html');
  let out =
    htmlTag < 0 ? html : `${html.slice(0, htmlTag + 5)}${attributes}${html.slice(htmlTag + 5)}`;
  if (pack) {
    const head = out.indexOf('</head>');
    if (head >= 0) {
      const link = `<link rel="stylesheet" href="${escape(pack.css)}">`;
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
 * selects: data-brand-theme with the site's default theme (light when unset),
 * data-brand and the pack stylesheet link before the head's end when the site
 * names a pack, every icon link of the head pointed into the site's brand
 * folder when its logo_url names one, answered no-store; the callback entry is
 * served for /callback/.
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
    const html = stamp(
      raw,
      site?.brand?.default_theme || 'light',
      packOf(site),
      brandFolderOf(site)
    );
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

export { uiIndex, uiManifest, brandFolderOf };
