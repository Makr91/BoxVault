import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig, getSiteConfig } from '../utils/config-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { version } = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));

const STORAGE_PREFIX = 'boxvault';

const STATUS = {
  role: 'boxvault',
  version,
  brand: {
    name: 'BoxVault',
    logoUrl: '/brand/boxvault.svg',
    repo: 'https://github.com/Makr91/BoxVault',
  },
  collections: ['boxes', 'isos', 'downloads'],
  config: ['app', 'auth', 'db', 'mail'],
  features: [
    'setup',
    'admin',
    'org-console',
    'discover',
    'invitations',
    'uploads',
    'watches',
    'deploy',
    'favorites',
    'notifications',
    'health',
    'footer',
    'search',
    'events',
  ],
  events: { path: '/api/events', topics: ['session', 'notifications', 'health'] },
  links: { docs: '/docs', contact: '' },
  ticket: null,
};

/**
 * The browser OIDC client of the first enabled provider, in map order
 * @param {Object} providers - The auth.oidc.providers map, defaults filled
 * @returns {{issuer: string, clientId: string, scopes: string, storagePrefix: string}|null} The idp block, or null without an enabled provider
 */
const enabledIdp = providers => {
  const provider = Object.values(providers).find(entry => entry.enabled === true && entry.issuer);
  if (!provider) {
    return null;
  }
  return {
    issuer: provider.issuer,
    clientId: provider.client_id,
    scopes: provider.scope,
    storagePrefix: STORAGE_PREFIX,
  };
};

const packOf = site => {
  const pack = site?.brand?.pack;
  return pack && typeof pack.name === 'string' && pack.name.trim() !== ''
    ? { name: pack.name, css: pack.css }
    : null;
};

/**
 * The brand, collections and links of one hostname: the sites map entry over
 * the defaults, the defaults alone for the unnamed hostname
 * @param {Object|null} site - The sites map entry
 * @returns {{brand: Object, collections: string[], links: Object}} The per-host members
 */
const faceOf = site => {
  if (!site) {
    return { brand: STATUS.brand, collections: STATUS.collections, links: STATUS.links };
  }
  const theme = site.brand?.default_theme;
  const pack = packOf(site);
  return {
    brand: {
      ...STATUS.brand,
      name: site.brand?.name || STATUS.brand.name,
      logoUrl: site.brand?.logo_url || STATUS.brand.logoUrl,
      ...(theme ? { theme } : {}),
      ...(pack ? { pack } : {}),
    },
    collections: site.collections?.length ? site.collections : STATUS.collections,
    links: {
      docs: site.links?.docs ?? STATUS.links.docs,
      contact: site.links?.contact ?? STATUS.links.contact,
    },
  };
};

/**
 * The feature tokens of one hostname: every token BoxVault supports, with
 * local-accounts first while local accounts are on, for a site without a
 * features list; exactly the listed tokens for a site with one, local-accounts
 * among them only while listed and local accounts are on
 * @param {Object|null} site - The sites map entry
 * @param {boolean} localEnabled - Whether auth.jwt.local_enabled is on
 * @returns {string[]} The feature tokens
 */
const featuresOf = (site, localEnabled) => {
  if (!Array.isArray(site?.features)) {
    return localEnabled ? ['local-accounts', ...STATUS.features] : STATUS.features;
  }
  return site.features.filter(token => token !== 'local-accounts' || localEnabled);
};

/**
 * @swagger
 * /api/status:
 *   get:
 *     summary: App identity and capabilities for the STARTcloud UI (public)
 *     description: Probed by the STARTcloud UI against its own origin before anything renders. role names the app, version is this backend's version, auth lists the session methods the UI may create (first entry wins) and is decided per request from auth.jwt.local_enabled, idp describes the browser OIDC client when auth is idp, collections names the collection registry entries to mount in order, config names the config files the admin page draws one tab each for, features is the gate every route, menu row and control checks with hasFeature, events names the one event stream and its topics, and ticket is null because BoxVault serves its ticket config at /api/config/ticket. brand, collections and links are answered per Host header from the sites map of the app configuration, the unnamed hostname answering the defaults.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: App status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [role, version, brand, auth, collections, config, features, events, links, ticket]
 *               properties:
 *                 role:
 *                   type: string
 *                   example: boxvault
 *                 version:
 *                   type: string
 *                   example: "0.77.0"
 *                 brand:
 *                   type: object
 *                   required: [name, logoUrl, repo]
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: BoxVault
 *                     logoUrl:
 *                       type: string
 *                       description: Path this host serves the brand mark from
 *                       example: /brand/boxvault.svg
 *                     repo:
 *                       type: string
 *                       example: https://github.com/Makr91/BoxVault
 *                     theme:
 *                       type: string
 *                       description: The site's default variant, present when the hostname's sites entry names one
 *                       enum: [light, dark]
 *                       example: dark
 *                     pack:
 *                       type: object
 *                       description: The pack the page is stamped with, present when the hostname's sites entry names one
 *                       required: [name, css]
 *                       properties:
 *                         name:
 *                           type: string
 *                           example: prominic
 *                         css:
 *                           type: string
 *                           example: /themes/prominic/prominic.css?v=a1b2c3
 *                 auth:
 *                   type: array
 *                   description: Session methods, first entry is the one the UI creates. backend is this app's own session, answered while local accounts are on; idp is browser OIDC against the issuer named in idp, answered while local accounts are off and a provider is enabled
 *                   items:
 *                     type: string
 *                     enum: [backend, idp]
 *                   example: [backend]
 *                 idp:
 *                   type: object
 *                   description: The browser OIDC client, present only when auth is idp; taken from the first enabled entry of auth.oidc.providers in map order
 *                   required: [issuer, clientId, scopes, storagePrefix]
 *                   properties:
 *                     issuer:
 *                       type: string
 *                       example: https://auth.example.com
 *                     clientId:
 *                       type: string
 *                       example: boxvault
 *                     scopes:
 *                       type: string
 *                       description: Space-separated scopes requested at authorization
 *                       example: openid profile email
 *                     storagePrefix:
 *                       type: string
 *                       description: Prefix of the browser storage keys the UI keeps the session under
 *                       example: boxvault
 *                 collections:
 *                   type: array
 *                   description: Collection registry entries to mount, in order; the first is implicit (no route segment)
 *                   items:
 *                     type: string
 *                   example: [boxes, isos, downloads]
 *                 config:
 *                   type: array
 *                   description: Config file names the admin page draws one tab each for, served at /api/config/<name>
 *                   items:
 *                     type: string
 *                   example: [app, auth, db, mail]
 *                 features:
 *                   type: array
 *                   description: Kebab-case feature tokens. local-accounts is present while auth.jwt.local_enabled is on and gates /register and the profile password, email and delete sections; setup gates /setup and the setup gate; admin gates /admin and the Admin row (still needs ROLE_ADMIN); org-console gates /org-console (still needs org OWNER/ADMIN); discover gates /organizations/discover and the Discover button; invitations gates the Invitations tab; uploads gates ISO and box file uploads; watches gates watch stars and the Watched filter; deploy gates the Deploy button (still needs the hyperweaver entitlement and a configured URL); favorites gates the Add to Favorites toggle; notifications gates the Notifications row (still needs the scope); footer gates the footer row; health gates the footer health heart, drawn only while footer is listed too; search gates the app-wide search box backed by /api/search; events gates the one event stream at events.path. Answered per Host header from the sites map, a site entry without a features list answering every token above and a site entry with one answering exactly the tokens it lists, local-accounts among them only while listed and auth.jwt.local_enabled is on
 *                   items:
 *                     type: string
 *                   example: [local-accounts, setup, admin, org-console, discover, invitations, uploads, watches, deploy, favorites, notifications, health, footer, search, events]
 *                 events:
 *                   type: object
 *                   required: [path, topics]
 *                   description: The one server-sent event stream of the universal events contract, opened once per tab by the UI runtime
 *                   properties:
 *                     path:
 *                       type: string
 *                       example: /api/events
 *                     topics:
 *                       type: array
 *                       description: Every topic this host streams; session sends session-terminated, notifications sends unread-count, health sends health with the /api/health shape when the status or a service state changes
 *                       items:
 *                         type: string
 *                       example: [session, notifications, health]
 *                 links:
 *                   type: object
 *                   required: [docs, contact]
 *                   properties:
 *                     docs:
 *                       type: string
 *                       example: /docs
 *                     contact:
 *                       type: string
 *                       example: ""
 *                 ticket:
 *                   type: object
 *                   nullable: true
 *                   description: Always null here; the ticket configuration is served by /api/config/ticket
 *                   example: null
 */
const getStatus = (req, res) => {
  const authConfig = loadConfig('auth');
  const localEnabled = authConfig.auth?.jwt?.local_enabled !== false;
  const idp = localEnabled ? null : enabledIdp(authConfig.auth?.oidc?.providers || {});
  const site = getSiteConfig(req.hostname);
  return res.json({
    ...STATUS,
    ...faceOf(site),
    auth: idp ? ['idp'] : ['backend'],
    ...(idp ? { idp } : {}),
    features: featuresOf(site, localEnabled),
  });
};

export { getStatus };
