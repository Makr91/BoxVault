---
title: Configuration
layout: default
nav_order: 4
permalink: /configuration/
---

## Configuration

{: .no_toc }

BoxVault configuration files, their keys and how they are validated.

## Table of contents

{: .no_toc .text-delta }

1. TOC
   {:toc}

---

## Overview

BoxVault reads four plain YAML files, `app.config.yaml`, `auth.config.yaml`, `db.config.yaml` and `mail.config.yaml`, each described by a JSON Schema shipped beside the code in `backend/app/config/schema/<name>.schema.yaml`. Every value is a literal in its file: there is no JSON form, no environment override and no `${VAR}` interpolation.

## Configuration Files

| Environment | Directory                             | File name                |
| ----------- | ------------------------------------- | ------------------------ |
| production  | `CONFIG_DIR`, default `/etc/boxvault` | `<name>.config.yaml`     |
| development | `backend/app/config/`                 | `<name>.dev.config.yaml` |

`CONFIG_DIR` is the only environment variable BoxVault reads. Production against development is chosen by which config directory exists. The Debian unit sets `CONFIG_DIR=/etc/boxvault`, and a fresh install copies the four files from `/opt/boxvault/config-templates/` into `/etc/boxvault/`; the CI derives the development files from the same templates in `packaging/config/`.

Every file carries `schemaVersion` at its root, `1` for `app`, `auth` and `db` and `2` for `mail`, and `snake_case` keys. A missing key takes the schema's `default`; a key the schema does not know is logged as a warning and ignored. The files are `0600`, owned by the `boxvault` service user, because `auth.config.yaml`, `db.config.yaml` and `mail.config.yaml` carry secrets.

## Database Configuration

`db.config.yaml`, as the package ships it:

```yaml
schemaVersion: 1
database_type: sqlite
sql:
  host: localhost
  port: 3306
  logging: false
  user: boxvault
  password: CHANGE_THIS_PASSWORD
  database: boxvault
  storage: /var/lib/boxvault/database/boxvault.db
  dialect: ''
mysql_pool:
  max: 5
  min: 0
  acquire: 30000
  idle: 5000
```

| Key                                                              | Meaning                                                                                                                                              |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `database_type`                                                  | `mysql` or `sqlite`; nothing else is accepted                                                                                                        |
| `sql.host`, `sql.port`, `sql.user`, `sql.password`, `sql.database` | the MySQL connection, drawn only while `database_type` is `mysql`                                                                                    |
| `sql.storage`                                                    | the SQLite file, drawn only while `database_type` is `sqlite`                                                                                        |
| `sql.logging`                                                    | log every SQL statement                                                                                                                              |
| `sql.dialect`                                                    | read-only, set from `database_type` by the setup page; while it is empty BoxVault stays in setup mode and serves only `/api/status` and `/api/setup/*` |
| `mysql_pool.max`, `mysql_pool.min`, `mysql_pool.acquire`, `mysql_pool.idle` | the MySQL connection pool                                                                                                                            |

## Authentication Configuration

The keys of `auth.config.yaml` an operator changes first:

```yaml
schemaVersion: 1
auth:
  jwt:
    jwt_secret: a-random-string-of-at-least-32-characters
    jwt_expiration: 24h
    jwt_issuer: boxvault
    jwt_audience: boxvault-api
    service_account_max_expiry_days: 365
    local_enabled: true
  local:
    local_require_email_verification: true
    local_password_min_length: 15
    local_bcrypt_rounds: 10
    local_session_timeout: 24
    local_allow_new_organizations: false
```

`auth.jwt.jwt_secret` signs every session token and is required; BoxVault warns at boot when it is shorter than 32 characters. `auth.jwt.jwt_expiration` is the token lifetime (`24h`, `7d`, `1h`); a stay-logged-in session lives `auth.local.local_session_timeout` hours instead. `auth.local.local_bcrypt_rounds` is the bcrypt cost of local passwords. The `auth.oidc`, `auth.resource_server`, `auth.scim` and `auth.external` sections configure identity providers and are described by the schema served at `GET /api/config/auth/schema`.

## File Storage Configuration

In `app.config.yaml`:

```yaml
boxvault:
  box_storage_directory: /var/lib/boxvault/storage
  box_max_file_size: 10
  iso_storage_directory: ''
```

`box_max_file_size` is in GB and caps every upload; an empty `iso_storage_directory` stores ISOs under `<box_storage_directory>/iso`.

## Server Configuration

In `app.config.yaml`:

```yaml
boxvault:
  origin: https://boxvault.example.com
  api_url: https://boxvault.example.com/api
  api_listen_port_unencrypted: 80
  api_listen_port_encrypted: 443
  trust_proxy: true
  allowed_origins: []
ssl:
  generate_ssl: true
  cert_path: /etc/boxvault/ssl/public.crt
  key_path: /etc/boxvault/ssl/private.key
```

`boxvault.origin` is the URL browsers reach BoxVault at and the one CORS origin always allowed; `boxvault.allowed_origins` adds more. `api_listen_port_unencrypted` and `api_listen_port_encrypted` are the ports the process binds; the package binds 80 and 443 with `CAP_NET_BIND_SERVICE`. When both `ssl.cert_path` and `ssl.key_path` exist BoxVault serves HTTPS on the encrypted port and redirects the unencrypted one to it; `ssl.generate_ssl: true` writes a self-signed pair there when none exists. `trust_proxy: true` trusts one `X-Forwarded-For` hop in front of BoxVault.

### Other app.config.yaml sections

| Section                | Purpose                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `gravatar`             | `base_url` and `api_key` of the server-side Gravatar profile proxy                                                                       |
| `ticket_system`        | `enabled`, `base_url`, `req_type`, `fallback_customer_id` and `context` of the Help ticket link, served at `GET /api/config/ticket`      |
| `hyperweaver`          | `url` of the Hyperweaver UI the Deploy button links to; empty hides the button                                                           |
| `monitoring`           | disk thresholds, alert frequency, service-account and SSL expiry warnings                                                                |
| `rate_limiting`        | see the [Authentication Guide](guides/authentication/#rate-limiting)                                                                     |
| `internationalization` | `default_language`, `supported_languages`, `fallback_language`, `auto_detect`, `force_language`                                          |
| `frontend_logging`     | the levels the STARTcloud UI logs at, served in `GET /api/health`                                                                        |
| `notifications`        | the push notification keys, below                                                                                                        |

## Email Configuration

`mail.config.yaml`:

```yaml
schemaVersion: 2
smtp_connect:
  host: smtp.example.com
  port: 587
  secure: true
  reject_unauthorized: true
smtp_settings:
  from: noreply@your-domain.com
  reply_to: support@your-domain.com
  rate_limit: 10
  alert_emails: []
smtp_auth:
  user: your-smtp-username
  password: CHANGE_THIS_SMTP_PASSWORD
```

`smtp_connect.host`, `smtp_connect.port` and `smtp_settings.from` are required. `reject_unauthorized` refuses a TLS certificate that cannot be verified, `rate_limit` caps the emails sent per second and `alert_emails` lists the recipients of disk-space alerts. `POST /api/mail/test-smtp` sends a test message with these settings.

## User Profile Fields

Beyond username and email, a BoxVault user carries five optional fields. All are
nullable, and all follow the same three-tier contract:

1. **SCIM** at provision/update — authoritative, full desired state, so an
   absent attribute clears the stored value.
2. **The OIDC claim at login** — fresher than the last SCIM push, so it
   overwrites. A claim that is absent never clears anything.
3. **Null**, with a documented render fallback.

| field | SCIM attribute | OIDC claim | fallback when null |
| --- | --- | --- | --- |
| `name` | `displayName`, else `name.formatted` | `name` | the username |
| `preferredLanguage` | `preferredLanguage` | `preferences.language` | the org's locale, then the configured default |
| `locale` | `locale` | — | only a fallback for `preferredLanguage` |
| `timezone` | `timezone` | — | — |
| `preferredTheme` | — | `preferences.theme` | the browser-local choice |

Local accounts have no provider, so both upper tiers are empty: `name` is set at
registration or edited on the profile page, and `preferredLanguage` is captured
from the request locale at registration.

Two deliberate omissions:

- The standard OIDC `locale` claim is **not** consumed. The identity provider
  currently emits a hardcoded value there, so reading it would pin every user to
  one language. `preferences.language` is the supported read path until the
  provider announces otherwise.
- `username` is not editable. For SCIM-managed accounts it mirrors the
  provider's `userName` and is overwritten on every push, which is why `name`
  exists as a separate, user-owned field.

### Colour scheme

`preferredTheme` holds `light`, `dark`, or `auto` — the **variant only**. The
brand pack is a property of the site, not of the person, so a user who belongs to
two tenants never drags one tenant's branding into the other. A composed value
such as `nomadservices-dark` is not a valid preference and is rejected on read.

`auto` is stored as `auto`, never resolved before storage: the resolved
light/dark is computed at render time from `prefers-color-scheme` and tracks the
operating system live. The stored preference and the applied value are
deliberately separate — collapsing them is what makes a theme toggle freeze at
whatever it happened to resolve to on first load.

The account value is applied when it changes, not on every render, so using the
in-app toggle afterwards still works.

### Saving a preference

`PATCH /api/user/preferences` accepts `language`, `theme`, and `timezone`, all
optional. An omitted key is left unchanged; `null` or `""` clears it.

Which store is authoritative depends on the account:

- **Federated accounts** — the write is delegated to the identity provider's
  own `PATCH /api/user/preferences` on the acting user's token, and the local
  columns are updated only after that succeeds. The provider's SCIM push then
  converges every other consumer. Writing locally first would be reverted on the
  next push, which is why delegation comes first and a failure is surfaced
  rather than swallowed.
- **Local accounts** — there is no provider, so the BoxVault columns are the
  whole story and the write applies directly.

The language switcher and the theme toggle both write through automatically for
signed-in users. Both are fire-and-forget: the interface changes immediately and
a failed save is logged rather than blocking the click.

### Which language a message is written in

Anything BoxVault composes **for** someone else — notifications fanned out to box
watchers, invitation and verification email — resolves the language from the
recipient, never from whoever triggered it. The request locale answers the wrong
question there: an invite sent by an English-speaking admin should still arrive
in the invitee's language.

The chain is: the recipient's `preferredLanguage`, then their `locale`, then the
organization's `locale` (synced from the identity provider, and the only signal
available for an invitee who has no account yet), then the configured default.
Every result is narrowed by RFC 4647 lookup to a locale this deployment actually
ships, so an unsupported tag degrades to the default rather than breaking.

## Notification Configuration

BoxVault sends its own browser/OS toast notifications. They are signed with
BoxVault's own VAPID keypair and delivered to push subscriptions registered on
BoxVault's origin by the STARTcloud UI's `notification-sw.js`.

This is deliberately independent of the auth server's notification hub. The hub
supplies the in-page bell feed — the durable, cross-app record — and never
raises an OS toast on BoxVault's behalf. Keeping the toast channel local means:

- toasts carry BoxVault's identity, not the auth server's
- clicking a toast can focus an already-open BoxVault tab (service worker
  `clients.matchAll` is origin-scoped and cannot reach across origins)
- one event cannot produce two toasts from two independent senders, which no
  amount of `tag` or `Topic` deduplication can fix across origins
- the notification permission the user grants is spent on the origin whose
  content they are actually agreeing to receive
- toasts keep working when the hub is unreachable

```yaml
notifications:
  enabled: true # false disables OS toasts; the bell feed is unaffected
  vapid_subject: "mailto:admin@example.com"
  vapid_public_key: "" # generated on first start when empty
  vapid_private_key: "" # generated on first start when empty
```

`vapid_subject` is the contact URI push services use to reach the operator about
delivery problems. Use a real address in production.

The keypair is generated automatically the first time BoxVault starts with these
fields empty, and written back to `app.config.yaml`. **Replacing either key
invalidates every existing subscription** — each browser must re-enable
notifications, because a subscription is cryptographically bound to the public
key it was created with.

Toasts require a BoxVault session only, so local accounts receive them; the bell
feed still requires an OIDC login because the feed lives on the hub.

## Logging Configuration

In `app.config.yaml`:

```yaml
logging:
  level: info
  console_enabled: true
  log_directory: /var/log/boxvault
  performance_threshold_ms: 1000
  enable_compression: true
  compression_age_days: 7
  max_files: 30
  categories:
    app: info
    api: info
    database: warn
    auth: info
    file: info
```

`level` is `error`, `warn`, `info` or `debug` and `categories` overrides it per category. Log files live under `log_directory`; `max_files` archived files are kept per log and gzipped after `compression_age_days` while `enable_compression` is on.

## Production Configuration

The templates in `packaging/config/` are the production starting point; `postinst` installs them into `/etc/boxvault/` and the setup page writes the values. Every value is literal, so a secret is written into the file itself, never as `${VAR}`. The values every deployment changes:

| Key                                            | Value                                                                                   |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| `boxvault.origin`, `boxvault.api_url`          | the public URL and its `/api`                                                           |
| `auth.jwt.jwt_secret`                          | a random string of at least 32 characters                                               |
| `database_type` and `sql.*`                    | `sqlite` with `sql.storage`, or `mysql` with the connection                             |
| `smtp_connect`, `smtp_settings`, `smtp_auth`   | the mail server, since local sign-in requires a verified email by default               |

## Configuration Validation

Every boot evaluates each file against its schema, defaults filled first, and refuses to start when any value fails, logging one line per failing pointer and a warning per unknown key. There is no separate validation flag; `node server.js` is the check.

The admin page and the setup page evaluate the same schema before writing:

| Route                                                        | Answer                                                                                                                                                                                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/config/<name>`                                     | the file as JSON, `writeOnly` values masked; admin only                                                                                                                                                                                     |
| `GET /api/config/<name>/schema`                              | the schema document; admin only                                                                                                                                                                                                             |
| `PUT /api/config/<name>`                                     | validates the merged file, answers `422` as `application/problem+json` with a pointer per failing value, then writes the file atomically with a backup beside it; the `200` carries `requires_restart` when a changed key needs one |
| `POST /api/config/restart`                                   | exits for the process manager; admin only                                                                                                                                                                                                   |
| `GET /api/setup`, `GET /api/setup/schema`, `PUT /api/setup`  | every file at once under the setup token, pointers as `/configs/<name>/…`                                                                                                                                                                   |

An upgrade runs `scripts/migrate-config.js` from `postinst`: the files are migrated in place to the schema's `schemaVersion`, new keys filled from their defaults, and the previous copies kept beside them as `.bak`.
