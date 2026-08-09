---
title: Configuration
layout: default
nav_order: 4
permalink: /configuration/
---

## Configuration

{: .no_toc }

BoxVault configuration options and settings.

## Table of contents

{: .no_toc .text-delta }

1. TOC
   {:toc}

---

## Overview

BoxVault uses configuration files to manage database connections, authentication settings, file storage, and other application parameters. Configuration can be managed through environment variables or configuration files.

## Configuration Files

BoxVault supports multiple configuration formats:

- **YAML** - Primary configuration format
- **JSON** - Alternative configuration format
- **Environment Variables** - Override any configuration setting

### Default Configuration Locations

BoxVault looks for configuration files in the following order:

1. `./config/` (relative to application root)
2. `/etc/boxvault/`
3. `~/.boxvault/`

## Database Configuration

Configure your database connection:

```yaml
database:
  dialect: "sqlite" # or "mysql", "postgresql", "mariadb"
  host: "localhost"
  port: 3306
  database: "boxvault"
  username: "boxvault"
  password: "your-password"
  storage: "./data/boxvault.db" # SQLite only
  logging: false
```

## Authentication Configuration

JWT and authentication settings:

```yaml
auth:
  jwt:
    secret: "your-jwt-secret-key"
    expiresIn: "24h"
  bcrypt:
    rounds: 12
```

## File Storage Configuration

Configure where Vagrant boxes are stored:

```yaml
storage:
  boxStorageDirectory: "./storage/boxes"
  maxFileSize: "2GB"
  allowedExtensions: [".box"]
  tempDirectory: "./storage/temp"
```

## Server Configuration

HTTP server settings:

```yaml
server:
  port: 3000
  host: "0.0.0.0"
  cors:
    enabled: true
    origin: "*"
  ssl:
    enabled: false
    cert: "./ssl/cert.pem"
    key: "./ssl/key.pem"
```

## Email Configuration

SMTP settings for notifications:

```yaml
email:
  enabled: false
  smtp:
    host: "smtp.example.com"
    port: 587
    secure: false
    auth:
      user: "noreply@example.com"
      pass: "your-password"
  from: "BoxVault <noreply@example.com>"
```

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
BoxVault's origin by `frontend/public/notification-sw.js`.

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

Application logging settings:

```yaml
logging:
  level: "info" # debug, info, warn, error
  file: "./logs/boxvault.log"
  maxSize: "10MB"
  maxFiles: 5
  console: true
```

## Environment Variables

Override any configuration using environment variables with the `BOXVAULT_` prefix:

```bash
# Database
export BOXVAULT_DATABASE_HOST=localhost
export BOXVAULT_DATABASE_PORT=5432
export BOXVAULT_DATABASE_DATABASE=boxvault

# Authentication
export BOXVAULT_AUTH_JWT_SECRET=your-secret-key

# Storage
export BOXVAULT_STORAGE_BOXSTORAGEDIRECTORY=/var/lib/boxvault/boxes

# Server
export BOXVAULT_SERVER_PORT=8080
```

## Production Configuration

Recommended settings for production:

```yaml
database:
  dialect: "postgresql"
  host: "db.example.com"
  port: 5432
  database: "boxvault_prod"
  username: "boxvault"
  password: "${DB_PASSWORD}"
  logging: false

auth:
  jwt:
    secret: "${JWT_SECRET}"
    expiresIn: "1h"
  bcrypt:
    rounds: 14

storage:
  boxStorageDirectory: "/var/lib/boxvault/boxes"
  maxFileSize: "5GB"
  tempDirectory: "/tmp/boxvault"

server:
  port: 3000
  host: "127.0.0.1"
  cors:
    enabled: true
    origin: ["https://boxvault.example.com"]
  ssl:
    enabled: true
    cert: "/etc/ssl/certs/boxvault.pem"
    key: "/etc/ssl/private/boxvault.key"

logging:
  level: "warn"
  file: "/var/log/boxvault/boxvault.log"
  console: false
```

## Configuration Validation

BoxVault validates configuration on startup and will report any errors or missing required settings. Use the `--validate-config` flag to check configuration without starting the server:

```bash
npm start -- --validate-config
```
