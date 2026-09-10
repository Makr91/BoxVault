---
title: Installation
layout: default
parent: Guides
nav_order: 2
permalink: /guides/installation/
---

## Installation Guide

{: .no_toc }

How BoxVault is installed from its Debian and OmniOS packages and brought through first-run setup.

## Table of contents

{: .no_toc .text-delta }

1. TOC
   {:toc}

---

## System Requirements

BoxVault ships as an operating-system package, never as an npm module, a Docker image or a tarball.

| Platform                  | Package                                                                    | Runtime                                    |
| ------------------------- | -------------------------------------------------------------------------- | ------------------------------------------ |
| Debian (bookworm, trixie) | `boxvault_<version>_amd64.deb` attached to every GitHub release            | `nodejs (>= 22.0.0)`, `sqlite3`, `openssl` |
| OmniOS                    | `boxvault-<version>.p5p` built by `packaging/omnios/build.sh`              | `ooce/runtime/node-22`, `database/sqlite-3` |

SQLite is the packaged database; MySQL is optional and configured at setup. Reserve disk for `boxvault.box_storage_directory` (`/var/lib/boxvault/storage`), where every box and ISO lands.

## Debian Package

### Install

```bash
sudo apt install gdebi-core
sudo gdebi -n boxvault_VERSION_amd64.deb
```

The package installs:

| Path                                          | Content                                                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `/opt/boxvault/`                              | `server.js`, `package.json`, `app/`, `scripts/`, `ui/` (the pinned STARTcloud UI) and `node_modules/`                                      |
| `/opt/boxvault/config-templates/`             | the four config templates from `packaging/config/`                                                                                         |
| `/opt/boxvault/scripts/certbot-deploy-hook.sh` | the Certbot renewal hook                                                                                                                   |
| `/etc/boxvault/`                              | shipped in the payload; `app.config.yaml`, `auth.config.yaml`, `db.config.yaml`, `mail.config.yaml` copied from the templates where no file of that name exists, an empty `setup.token` on a fresh install, `ssl/` created by the service |
| `/etc/systemd/system/boxvault.service`        | the unit                                                                                                                                   |
| `/var/lib/boxvault/`                          | the SQLite database, uploads and box storage                                                                                               |
| `/var/log/boxvault/`                          | log files                                                                                                                                  |

`postinst` creates the `boxvault` system user, sets `/etc/boxvault` to that user and mode `0750`, and creates an empty `/etc/boxvault/setup.token` on a fresh install. The first start fills the token with 64 hex characters and logs its path; read it with `sudo cat /etc/boxvault/setup.token`, the setup page asks for it. When `/etc/letsencrypt/renewal-hooks/deploy` exists the Certbot hook is installed there as `boxvault-cert-deploy.sh`.

### Start

```bash
sudo systemctl enable --now boxvault
systemctl status boxvault
journalctl -u boxvault -f
```

Then open `https://localhost` (or `http://localhost`, which redirects once a certificate exists) and complete [first-run setup](#first-run-setup).

### The systemd unit

| Setting                         | Value                                                                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`, `Group`                 | `boxvault`                                                                                                                                                  |
| `WorkingDirectory`, `ExecStart` | `/opt/boxvault`, `/usr/bin/node server.js`                                                                                                                  |
| `Environment`                   | `CONFIG_DIR=/etc/boxvault`                                                                                                                                  |
| configuration directory         | `ConfigurationDirectory=boxvault`, `ConfigurationDirectoryMode=0750`, re-asserting the owner and mode on every start                                        |
| `After`                         | `network.target mysql.service`                                                                                                                              |
| `Restart`                       | `on-failure`, 10 seconds                                                                                                                                    |
| hardening                       | `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, `ReadWritePaths=/var/lib/boxvault /var/log/boxvault /etc/boxvault /local`, `CAP_NET_BIND_SERVICE` for ports 80 and 443 |
| limits                          | `MemoryMax=12G`, `TasksMax=600`                                                                                                                             |

There is no `ExecReload`; a configuration change that the schema marks `requiresRestart` is listed on the admin page with its reason, and `POST /api/config/restart` or `systemctl restart boxvault` applies it.

### Upgrade

Install the new `.deb` the same way. `postinst` detects the upgrade, runs `scripts/migrate-config.js` as the `boxvault` user against `/etc/boxvault/` (each file is moved to its schema's version, only the keys a migration changes are rewritten, the previous copy kept as `.bak`), preserves the database, then asks for `systemctl restart boxvault`.

### Remove

`apt remove boxvault` keeps the user, the data and the configuration for a reinstall; `apt purge boxvault` deletes the user, `/var/lib/boxvault`, `/var/log/boxvault` and `/etc/boxvault`.

## OmniOS Package

The IPS package is `application/management/boxvault`, publisher `Makr91`, built on an OmniOS host by `packaging/omnios/build.sh` into `boxvault-<version>.p5p`; the release workflow does not build it. It creates the `boxvault` user and group (uid and gid 303), installs `/opt/boxvault/` with `startup.sh`, the four config files and an empty `setup.token` under `/etc/boxvault/` marked `preserve`, `/var/lib/boxvault/database/`, `/var/log/boxvault/` and the SMF manifest `/lib/svc/manifest/application/boxvault.xml`.

```bash
pfexec pkg install application/management/boxvault
pfexec svcadm enable application/management/boxvault
svcs -l application/management/boxvault
```

The service `svc:/application/management/boxvault:default` runs `/opt/boxvault/startup.sh` as `boxvault` with `CONFIG_DIR=/etc/boxvault`; the script runs the configuration migrations and then `exec`s `node server.js` in the foreground under `startd/duration = child`, so SMF supervises the process and brings it back after `POST /api/config/restart`. The first start fills `/etc/boxvault/setup.token` and logs its path; the process log is the SMF log of the service. Building and the manual `pkgsend` path are in [packaging/omnios/README.md](https://github.com/Makr91/BoxVault/blob/main/packaging/omnios/README.md).

## First-Run Setup

A fresh install carries an empty `<CONFIG_DIR>/setup.token`; the first start fills it with 64 hex characters, and while the file exists BoxVault is in setup mode: it serves the UI, `GET /api/status`, the `/api/config/*` routes and the `/api/setup/*` routes and nothing else. The STARTcloud UI's setup gate opens the setup page, which drives the routes below under the setup token.

| Step                               | Route                                                                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| check the gate                     | `GET /api/setup/status`, answering `{ "setup_complete": false }` while the token file exists                                                                       |
| verify the token                   | `POST /api/setup/verify-token` with `{ "token": "<setup token>" }`, answering `204`; the browser keeps the token it sent as the bearer of every later setup call    |
| read the files and their schemas   | `GET /api/setup` and `GET /api/setup/schema` with `Authorization: Bearer <setup token>`, the raw files with nothing masked                                          |
| upload a certificate and key       | `POST /api/config/app/upload` with the parts `file` and `pointer` (`/ssl/cert_path` or `/ssl/key_path`), writing the file at the path that property holds          |
| write every file                   | `PUT /api/setup` with `{ "configs": { "app": …, "auth": …, "db": …, "mail": … } }`, one merge patch per file; a `422` lists every failing value of every file and nothing is written until none fail |
| done                               | the `200 { "message": "Setup complete." }` deletes the token; `GET /api/setup/status` answers `{ "setup_complete": true }` and every other setup route `404`        |

BoxVault opens the database as soon as the setup page writes `db.config.yaml`. Port and certificate changes are listed on `GET /api/config/restart-status` with their reasons; apply them with `POST /api/config/restart` or a service restart.

### The first account

Register at `/register`. The first account receives the global `admin` role and owns a personal organization named after its username; it is accepted even while `auth.local.local_allow_new_organizations` is off. Local sign-in requires a verified email while `auth.local.local_require_email_verification` is on, the packaged default, so either configure `mail.config.yaml` during setup or turn that knob off.

## TLS

With `ssl.generate_ssl: true` BoxVault writes a self-signed certificate and key to `ssl.cert_path` and `ssl.key_path` (`/etc/boxvault/ssl/public.crt` and `private.key`) when none exist, serves HTTPS on `boxvault.api_listen_port_encrypted` with TLS 1.2 and 1.3, and redirects `boxvault.api_listen_port_unencrypted` to it. Replace the pair through the upload buttons of the setup page or the admin page, which call `POST /api/config/app/upload`, or through Certbot.

The Certbot hook reads the domain from `boxvault.origin`, copies `/etc/letsencrypt/live/<domain>/fullchain.pem` and `privkey.pem` to `/etc/boxvault/ssl/public.crt` and `private.key`, and restarts the service. When Certbot is installed after BoxVault, install the hook by hand:

```bash
sudo cp /opt/boxvault/scripts/certbot-deploy-hook.sh /etc/letsencrypt/renewal-hooks/deploy/boxvault-cert-deploy.sh
```

Behind a reverse proxy or CDN keep `boxvault.trust_proxy: true` so the client address behind one `X-Forwarded-For` hop is the one the rate limiters count.

## Database

SQLite at `sql.storage` (`/var/lib/boxvault/database/boxvault.db`) needs nothing else. For MySQL set `database_type: mysql` and `sql.host`, `sql.port`, `sql.user`, `sql.password` and `sql.database`, with the pool under `mysql_pool`; the Debian unit orders BoxVault after `mysql.service`.

```bash
sudo apt install mysql-server
sudo mysql -e "CREATE DATABASE boxvault;"
sudo mysql -e "CREATE USER 'boxvault'@'localhost' IDENTIFIED BY 'your_password';"
sudo mysql -e "GRANT ALL PRIVILEGES ON boxvault.* TO 'boxvault'@'localhost';"
sudo mysql -e "FLUSH PRIVILEGES;"
```

BoxVault synchronises its schema at boot; there is no migration command to run.

## Monitoring

```bash
curl https://localhost/api/health
curl https://localhost/api/status
```

`GET /api/health` is public and answers `{ status, timestamp, version, environment, supported_languages, default_language, frontend_logging, services }`, `status` being `ok`, `warning` or `error` and `services` one coarse word each for `database`, `storage_boxes`, `storage_isos` and, when providers are configured, `oidc_providers`. Disk usage above `monitoring.disk_space_warning_threshold` raises the warning and, at most once per `monitoring.alert_frequency_hours`, emails `smtp_settings.alert_emails`.

Logs go to the journal on Debian and to `logging.log_directory` on both platforms; `logging.level` and `logging.categories` set the detail.

## Troubleshooting

**The service exits at boot with `Configuration failed validation`:** the journal names the file and the pointer of every failing value; fix the file under `/etc/boxvault/` and restart.

**Port already in use:** change `boxvault.api_listen_port_unencrypted` or `api_listen_port_encrypted` in `app.config.yaml` and restart.

**The setup page refuses the token:** the token is the content of `/etc/boxvault/setup.token`, filled on the first start and deleted once setup completes; a completed install answers `404` on every setup route.

**Local sign-in answers 403 after registration:** the account's email is not verified; configure mail or turn `auth.local.local_require_email_verification` off.

**File upload fails:** check the free space and ownership of `boxvault.box_storage_directory` and the `boxvault.box_max_file_size` ceiling in GB.

```bash
sudo journalctl -u boxvault -f
sudo ls -la /var/log/boxvault/
```

## Backup and Recovery

```bash
sudo tar -czf boxvault-config.tar.gz /etc/boxvault/
sudo tar -czf boxvault-storage.tar.gz /var/lib/boxvault/storage/
sudo cp /var/lib/boxvault/database/boxvault.db boxvault.db.bak
```

For MySQL replace the last line with `mysqldump -u boxvault -p boxvault > backup.sql`. Restore the three in place, fix ownership to `boxvault:boxvault`, and restart.
