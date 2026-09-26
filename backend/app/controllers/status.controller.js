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
    logo_url: '/brand/boxvault/mark.svg',
    repo: 'https://github.com/Makr91/BoxVault',
    changelog: 'https://github.com/Makr91/BoxVault/releases',
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
    'sidebar',
    'search',
    'events',
  ],
  events: { path: '/api/events', topics: ['session', 'notifications', 'health'] },
  links: {
    docs: '/docs',
    contact: '',
    community: [
      { label: 'Sponsor BoxVault', url: 'https://github.com/sponsors/Makr91' },
      { label: 'Makr91 on GitHub', url: 'https://github.com/Makr91' },
    ],
  },
  ticket: null,
};

/**
 * The browser OIDC client of the first enabled provider, in map order
 * @param {Object} providers - The auth.oidc.providers map, defaults filled
 * @returns {{issuer: string, client_id: string, scopes: string, storage_prefix: string}|null} The idp block, or null without an enabled provider
 */
const enabledIdp = providers => {
  const provider = Object.values(providers).find(entry => entry.enabled === true && entry.issuer);
  if (!provider) {
    return null;
  }
  return {
    issuer: provider.issuer,
    client_id: provider.client_id,
    scopes: provider.scope,
    storage_prefix: STORAGE_PREFIX,
  };
};

const packOf = site => {
  const name = site?.brand?.pack;
  return typeof name === 'string' && name.trim() !== ''
    ? { name, css: `/themes/${name}/${name}.css` }
    : null;
};

/**
 * The packs a person may choose on one hostname: its brand.packs list of
 * bare names in order, each with the stylesheet path built as pack.css is
 * and the name as its label; empty for a site without the key, which the
 * status leaves out so the UI offers every pack of its build
 * @param {Object|null} site - The sites map entry
 * @returns {Array<{name: string, css: string, label: string}>} The offered packs
 */
const packsOf = site =>
  (Array.isArray(site?.brand?.packs) ? site.brand.packs : [])
    .filter(name => typeof name === 'string' && name.trim() !== '')
    .map(name => ({ name, css: `/themes/${name}/${name}.css`, label: name }));

/**
 * The brand, collections, links, organization, sorts and groups of one
 * hostname: the sites map entry over the defaults, the defaults alone for the
 * unnamed hostname; a site's links.community replaces the default list whole;
 * organization is present only while the entry names the one organization
 * the face serves, sorts only while the entry carries a table order, groups
 * only while it carries a grouping
 * @param {Object|null} site - The sites map entry
 * @returns {{brand: Object, collections: string[], links: Object, organization?: string, sorts?: Object, groups?: Object}} The per-host members
 */
const faceOf = site => {
  if (!site) {
    return { brand: STATUS.brand, collections: STATUS.collections, links: STATUS.links };
  }
  const theme = site.brand?.default_theme;
  const pack = packOf(site);
  const packs = packsOf(site);
  return {
    ...(site.organization ? { organization: site.organization } : {}),
    ...(site.sorts && Object.keys(site.sorts).length > 0 ? { sorts: site.sorts } : {}),
    ...(site.groups && Object.keys(site.groups).length > 0 ? { groups: site.groups } : {}),
    brand: {
      ...STATUS.brand,
      name: site.brand?.name || STATUS.brand.name,
      logo_url: site.brand?.logo_url || STATUS.brand.logo_url,
      ...(theme ? { theme } : {}),
      ...(pack ? { pack } : {}),
      ...(packs.length > 0 ? { packs } : {}),
    },
    collections: site.collections?.length ? site.collections : STATUS.collections,
    links: {
      docs: site.links?.docs ?? STATUS.links.docs,
      contact: site.links?.contact ?? STATUS.links.contact,
      community: site.links?.community ?? STATUS.links.community,
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
 *     description: Probed by the STARTcloud UI against its own origin before anything renders. role names the app, version is this backend's version, auth lists the session methods the UI may create (first entry wins) and is decided per request from auth.jwt.local_enabled, idp describes the browser OIDC client when auth is idp, collections names the collection registry entries to mount in order, config names the config files the admin page draws one tab each for, features is the gate every route, menu row, column and control checks with hasFeature, events names the one event stream and its topics, and ticket is null because BoxVault serves its ticket config at /api/config/ticket. brand (its packs list included), collections, links (its community list included), features, organization, sorts and groups are answered per Host header from the sites map of the app configuration, the unnamed hostname answering the defaults and none of organization, sorts or groups.
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
 *                   required: [name, logo_url, repo, changelog]
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: BoxVault
 *                     logo_url:
 *                       type: string
 *                       description: Path this host serves the brand mark from, the mark.svg of a folder under /brand/, the same folder the host's manifest and icon links name
 *                       example: /brand/boxvault/mark.svg
 *                     repo:
 *                       type: string
 *                       example: https://github.com/Makr91/BoxVault
 *                     changelog:
 *                       type: string
 *                       description: The releases page the About page's Changelog button opens
 *                       example: https://github.com/Makr91/BoxVault/releases
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
 *                           example: /themes/prominic/prominic.css
 *                     packs:
 *                       type: array
 *                       description: The packs a person may choose on this hostname, in the order of its sites entry's brand.packs, present only while that list has entries; absent, the UI offers every pack of its own build, and an empty list offers none; a person's choice persists as the pack preference
 *                       items:
 *                         type: object
 *                         required: [name, css, label]
 *                         properties:
 *                           name:
 *                             type: string
 *                             example: prominic
 *                           css:
 *                             type: string
 *                             example: /themes/prominic/prominic.css
 *                           label:
 *                             type: string
 *                             example: prominic
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
 *                   required: [issuer, client_id, scopes, storage_prefix]
 *                   properties:
 *                     issuer:
 *                       type: string
 *                       example: https://auth.example.com
 *                     client_id:
 *                       type: string
 *                       example: boxvault
 *                     scopes:
 *                       type: string
 *                       description: Space-separated scopes requested at authorization
 *                       example: openid profile email
 *                     storage_prefix:
 *                       type: string
 *                       description: Prefix of the browser storage keys the UI keeps the session under
 *                       example: boxvault
 *                 organization:
 *                   type: string
 *                   description: The name of the one organization this hostname serves, present only while its sites entry names one; the UI then leaves that organization's crumb out
 *                   example: Prominic
 *                 sorts:
 *                   type: object
 *                   description: The order each table of this hostname opens in, present only while its sites entry carries one; a map of collection key (boxes, isos, downloads) to level (items, versions, providers, architectures) to a sort stack the UI applies before a person sorts, each entry naming a column key of that level's table
 *                   additionalProperties:
 *                     type: object
 *                     additionalProperties:
 *                       type: array
 *                       items:
 *                         type: object
 *                         required: [column, direction]
 *                         properties:
 *                           column:
 *                             type: string
 *                             example: name
 *                           direction:
 *                             type: string
 *                             enum: [asc, desc]
 *                   example: { downloads: { providers: [{ column: name, direction: desc }] } }
 *                 groups:
 *                   type: object
 *                   description: The field each level of this hostname groups its rows by, present only while its sites entry carries one; a map of collection key (boxes, isos, downloads) to level (items, versions, providers, architectures) to family or vendor, the UI drawing that level's rows under one sub-header per value, beneath the organization groups on a host of many organizations and alone on a host whose status names its one organization
 *                   additionalProperties:
 *                     type: object
 *                     additionalProperties:
 *                       type: string
 *                       enum: [family, vendor]
 *                   example: { downloads: { items: family } }
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
 *                   description: Kebab-case feature tokens. local-accounts is present while auth.jwt.local_enabled is on and gates /register and the profile password, email and delete sections; setup gates /setup and the setup gate; admin gates /admin and the Admin row (still needs ROLE_ADMIN); org-console gates /org-console (still needs org OWNER/ADMIN); discover gates /organizations/discover and the Discover button; invitations gates the Invitations tab; uploads gates ISO and box file uploads; watches gates watch stars and the Watched filter; deploy gates the Deploy button (still needs the hyperweaver entitlement and a configured URL); favorites gates the Add to Favorites toggle; notifications gates the Notifications row (still needs the scope); footer gates the footer row; health gates the footer health heart, drawn only while footer is listed too; sidebar gates the sidebar column, every group and tree the mounted features export, without it no column and the brand stays in the header; search gates the app-wide search box backed by /api/search; events gates the one event stream at events.path. Answered per Host header from the sites map, a site entry without a features list answering every token above and a site entry with one answering exactly the tokens it lists, local-accounts among them only while listed and auth.jwt.local_enabled is on
 *                   items:
 *                     type: string
 *                   example: [local-accounts, setup, admin, org-console, discover, invitations, uploads, watches, deploy, favorites, notifications, health, footer, sidebar, search, events]
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
 *                   required: [docs, contact, community]
 *                   properties:
 *                     docs:
 *                       type: string
 *                       example: /docs
 *                     contact:
 *                       type: string
 *                       example: ""
 *                     community:
 *                       type: array
 *                       description: The community and support links the About page draws after the repository, the changelog and the contact address, in this order; answered per Host header, a sites entry's links.community replacing the defaults whole
 *                       items:
 *                         type: object
 *                         required: [label, url]
 *                         properties:
 *                           label:
 *                             type: string
 *                             description: The host's own text, drawn as it is
 *                             example: Sponsor BoxVault
 *                           url:
 *                             type: string
 *                             format: uri
 *                             description: An https URL
 *                             example: https://github.com/sponsors/Makr91
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
