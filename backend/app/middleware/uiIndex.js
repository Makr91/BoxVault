import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getSiteConfig } from '../utils/config-loader.js';

const UI_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../ui');

const escape = value =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const packOf = site => {
  const pack = site?.brand?.pack;
  return pack && typeof pack.name === 'string' && pack.name.trim() !== '' ? pack : null;
};

const stamp = (html, theme, pack) => {
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
  return out;
};

const pageFor = path =>
  path === '/callback/' || path === '/callback' ? 'callback/index.html' : 'index.html';

/**
 * The handler answering a page GET with the served UI's index.html, read from
 * disk on every request and stamped for the site the request's hostname
 * selects: data-brand-theme with the site's default theme (light when unset),
 * data-brand and the pack stylesheet link before the head's end when the site
 * names a pack, answered no-store; the callback entry is served for /callback/.
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
    const html = stamp(raw, site?.brand?.default_theme || 'light', packOf(site));
    return res
      .status(status)
      .set('Cache-Control', 'no-store, no-transform')
      .type('text/html; charset=utf-8')
      .send(html);
  };

export { uiIndex };
