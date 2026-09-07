# Notifications from the STARTcloud UI estate

Cross-repo notes for whoever works in this repository. Each item is an open
to-do here and is removed when done. Read every file named below in full
before acting on any of it.

Estate-wide tracking is `../authorization-server-private/priorities.yaml`,
read-only from this repository. The contracts are
`../startcloud-ui/docs/guides/universal-navbar.md`, `universal-pages.md`,
`universal-session.md`, `universal-events.md`, `universal-validation.md`,
`universal-config.md`, `preferences-and-branding.md`,
`universal-identity.md` and `UI-GROWTH-GUIDE.md`; the copies under
`../authorization-server-private/docs/guides/` are pointer stubs and are
never cited. Every line below cites the file that decides it. Paths without
a drive are relative to this repository's root.

## 1. Messages to the contract owner

Why: each line is a place where this repository follows a rule the
contracts do not yet carry, or refuses one they do; the change is the
contract's, in `../startcloud-ui/docs/guides/`, and nothing here moves
until it lands.

- This UI backend writes its own configuration directory directly, as the
  service user, under `CONFIG_DIR`: the setup page and the admin page
  through `PUT /api/setup` and `PUT /api/config/<name>`
  (`backend/app/controllers/config/helpers.js`), the first-boot VAPID pair
  (`backend/app/utils/webPush.js`) and the setup token
  (`backend/server.js`), and the unit grants the write
  (`packaging/DEBIAN/systemd/boxvault.service`). That is the whole point of
  a YAML config system on a normal `/etc` path. `universal-config.md:256-257`
  ("a boot never writes `/etc`") contradicts it and is wrong for this
  estate. The rule is "the service user owns `CONFIG_DIR` and the UI
  backend writes it; `postinst` creates a missing file from the schema's
  defaults and the UI backend generates its own secrets there on first
  boot".
- 413 has no type in the validation contract's registry
  (`universal-validation.md:386`); this UI backend answers it as
  `payload-too-large`, the slug the notification hub's own family already
  uses (`backend/app/utils/problem.js`); the registry gains that line.
- A reserved first segment refused as an organization name
  (`universal-pages.md:136-153`) has no named rule in the validation
  vocabulary; this UI backend answers it as `unique` with
  `params.scope: global` (`backend/app/utils/reservedSegments.js`); the
  contract either names that shape or adds a rule.
- `health` on the events stream: `universal-navbar.md:492,602-613` says
  the heart's state rides the stream where `events` is advertised, and
  the shared `Footer.jsx` stops polling on that token, but
  `universal-events.md` registers a `health` event only inside the
  identity provider's admin-only `admin` topic. This UI backend advertises
  `events` and streams `session` and `notifications`, so its heart loads
  once and never updates. The fix is a `health` core topic (event
  `health`, data the `/api/health` shape, no snapshot, the client reads
  `GET /api/health` on connect) that every UI backend advertising `health`
  and `events` streams; `backend/app/utils/events.js` broadcasts it the
  day the row lands.
- `unread_only` against `unreadOnly`: `universal-identity.md:1386` names
  the hub's list query `unread_only`, `universal-navbar.md:703` names it
  `unreadOnly`; `backend/app/controllers/notification.controller.js:66`
  forwards `unreadOnly` and follows the hub once the two lines agree.

## 2. Coordinated with startcloud-ui, one release both sides

Why: each rename lands on the route and in the UI adapter in the same
release, never on one side first; the UI still sends the old shape at the
lines named, so this repository moves on the `bump/startcloud-ui` pull
request that carries the new one.

- `password`: `backend/app/rules/password.json:3-5` and
  `backend/app/utils/rules.js:67` read `new_password`; the contract says
  `password` (`universal-validation.md:175`);
  `../startcloud-ui/src/features/profile/api/profile.js:8-9` sends
  `new_password`.
- `allOf` rule shapes: `backend/app/rules/defs.json:4,10` write "not
  containing `..`" as a lookahead; the contract writes
  `allOf: [{ pattern }, { not: { pattern: "\\.\\." } }]`
  (`universal-validation.md:83,89,225`);
  `../startcloud-ui/src/utils/validation.js:119-124,171-179` evaluates
  neither `allOf` nor `not`, and `backend/app/utils/validation.js` follows
  it in the same release.
- `test_email` and `assigned_role`: `backend/app/controllers/mail/test.js:68`
  reads `testEmail`, `backend/app/controllers/request/approve.js:151`
  reads `assignedRole`; `../startcloud-ui/src/features/admin/api/admin.js:16`
  and `../startcloud-ui/src/features/organizations/api/organizations.js:43-47`
  send the camelCase names.
- `requires_restart`: `backend/app/controllers/config/update.js` answers
  `requiresRestart` on the 200 and
  `../startcloud-ui/src/features/admin/components/AdminConfig.jsx:153`
  reads it; the contract says `requires_restart`
  (`universal-config.md:198`).
- `/api/favorites` and `/api/favorites/save` stay beside the new
  `GET`/`PUT /api/user/favorites` proxies
  (`backend/app/controllers/favorites/user.js`,
  `backend/app/routes/favorites.routes.js`) until the bump that moves the
  UI's read lands; then the two old routes go.

## 3. Open decisions

Why: each needs a word from Mark before a line changes.

- Service accounts: `backend/app/middleware/authJwt.js` passes `isAdmin`
  through the owner's global role on `backend/app/routes/ssl.routes.js`,
  `system.routes.js` and `mail.routes.js`, and every organization check
  scopes a service account to its owner's memberships
  (`UserOrg.findUserOrgRole(req.userId, …)` in `file/download.js`,
  `file/info.js`, `file/link.js`, `box/findone.js`,
  `architecture/findone.js`, `version/create.js`, `version/delete.js`,
  `provider/create.js`, `architecture/create.js`, `file/upload.js`,
  `file/remove.js`) rather than to `service_account.organization_id`.
  Proposed: a service account never reaches a system-admin route, reads
  and writes only inside its own organization at a stored role capped by
  its creator's current role there, and reads public items elsewhere.
- `backend/server.js` runs `sync({ alter: true })` on every boot; the
  repository has no database migration path, so it stays until one
  exists.
- `repo_estate.tooling`: no sibling repository carries an `.editorconfig`,
  so none was copied; the estate names its source or drops the line.
- `.github/PULL_REQUEST_TEMPLATE.md` is startcloud-ui's, the UI family's
  shape; `../hyperweaver-server/.github/PULL_REQUEST_TEMPLATE.md` is the
  Node-backend family's; Mark names which family BoxVault follows.

## 4. Not dead, by trace

Why: the estate's dead-code list names these; a full trace found a caller,
so they stay and `priorities.yaml` records the reason.

- `service_account_without_organization`: the `!serviceAccount` half at
  `backend/app/controllers/user/organizations.js:99-101` is reached by a
  live service-account JWT after `DELETE /service-accounts/:id`.
- `scim_body_not_object`: `backend/app/controllers/scim/users.js:373-375,482-484`
  and `scim/groups.js:129-131,246-248` are reached by a bodyless or
  non-JSON push, which leaves `req.body` undefined.
- `search_scope_escape`: `backend/app/controllers/search/scope.js:34-35`
  stays until a MySQL test run exists.
