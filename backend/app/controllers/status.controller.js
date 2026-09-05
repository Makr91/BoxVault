import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { version } = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));

const STATUS = {
  role: 'boxvault',
  version,
  brand: {
    name: 'BoxVault',
    logoUrl: '/brand/boxvault.svg',
    repo: 'https://github.com/Makr91/BoxVault',
  },
  auth: ['backend'],
  collections: ['boxes', 'isos'],
  config: ['app', 'auth', 'db', 'mail'],
  features: [
    'local-accounts',
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
    'search',
    'events',
  ],
  events: { path: '/api/events', topics: ['session', 'notifications'] },
  links: { docs: '/docs', contact: '' },
  ticket: null,
};

/**
 * @swagger
 * /api/status:
 *   get:
 *     summary: App identity and capabilities for the STARTcloud UI (public)
 *     description: Probed by the STARTcloud UI against its own origin before anything renders. role names the app, version is this backend's version, auth lists the session methods the UI may create (first entry wins), collections names the collection registry entries to mount in order, config names the config files the admin page draws one tab each for, features is the gate every route, menu row and control checks with hasFeature, events names the one event stream and its topics, and ticket is null because BoxVault serves its ticket config at /api/config/ticket.
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
 *                 auth:
 *                   type: array
 *                   description: Session methods, first entry is the one the UI creates. backend is this app's own session; idp is browser OIDC against an issuer named in idp
 *                   items:
 *                     type: string
 *                     enum: [backend, idp]
 *                   example: [backend]
 *                 collections:
 *                   type: array
 *                   description: Collection registry entries to mount, in order; the first is implicit (no route segment)
 *                   items:
 *                     type: string
 *                   example: [boxes, isos]
 *                 config:
 *                   type: array
 *                   description: Config file names the admin page draws one tab each for, served at /api/config/<name>
 *                   items:
 *                     type: string
 *                   example: [app, auth, db, mail]
 *                 features:
 *                   type: array
 *                   description: Kebab-case feature tokens. local-accounts gates /register and the profile password, email and delete sections; setup gates /setup and the setup gate; admin gates /admin and the Admin row (still needs ROLE_ADMIN); org-console gates /org-console (still needs org OWNER/ADMIN); discover gates /organizations/discover and the Discover button; invitations gates the Invitations tab; uploads gates ISO and box file uploads; watches gates watch stars and the Watched filter; deploy gates the Deploy button (still needs the hyperweaver entitlement and a configured URL); favorites gates the Add to Favorites toggle; notifications gates the Notifications row (still needs the scope); health gates the footer health heart; search gates the app-wide search box backed by /api/search; events gates the one event stream at events.path
 *                   items:
 *                     type: string
 *                   example: [local-accounts, setup, admin, org-console, discover, invitations, uploads, watches, deploy, favorites, notifications, health, search, events]
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
 *                       description: Every topic this host streams; session sends session-terminated, notifications sends unread-count
 *                       items:
 *                         type: string
 *                       example: [session, notifications]
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
  void req;
  return res.json(STATUS);
};

export { getStatus };
