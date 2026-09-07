---
title: Getting Started
layout: default
parent: Guides
nav_order: 1
permalink: /guides/getting-started/
---

## Getting Started with BoxVault

{: .no_toc }

From a fresh package to the first box download.

## Table of contents

{: .no_toc .text-delta }

1. TOC
   {:toc}

---

## What is BoxVault?

BoxVault is a self-hosted Vagrant box repository:

- **Host Vagrant boxes** - Store and distribute boxes and ISOs for your team
- **Manage versions** - Track versions, providers and architectures of every box
- **Control access** - Organizations with owner, admin and member roles, service accounts for automation
- **API integration** - A REST API for CI/CD, and the Vagrant box protocol at the root

## Prerequisites

- A Debian host (bookworm or trixie) with `nodejs (>= 22.0.0)`, `sqlite3` and `openssl`, or an OmniOS host with `ooce/runtime/node-22`
- Disk space under `/var/lib/boxvault/storage` for box files
- An SMTP server, since local accounts must verify their email before signing in by default

## Installation

Download `boxvault_<version>_amd64.deb` from the [releases page](https://github.com/Makr91/BoxVault/releases) and install it:

```bash
sudo apt install gdebi-core
sudo gdebi -n boxvault_VERSION_amd64.deb
sudo systemctl enable --now boxvault
```

The install prints a **setup token** and stores it in `/etc/boxvault/setup.token`. The OmniOS package and every detail are in the [Installation Guide](../installation/).

## Initial Setup

### 1. Open the setup page

Browse to `https://localhost` (the package listens on 443, with 80 redirecting). Until the database is configured BoxVault serves only the setup page, `GET /api/status` and `/api/setup/*`.

### 2. Enter the setup token

The page verifies it at `POST /api/setup/verify-token` and then loads every configuration file and its schema.

### 3. Fill the four files

| File   | What to set                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------------- |
| `app`  | `boxvault.origin` and `boxvault.api_url` (the public URL), the listen ports, `box_storage_directory` |
| `auth` | `auth.jwt.jwt_secret`, a random string of at least 32 characters                                     |
| `db`   | `database_type` `sqlite` with `sql.storage`, or `mysql` with the connection                          |
| `mail` | `smtp_connect`, `smtp_settings.from`, `smtp_auth`                                                    |

Submit writes every file at once; a value that breaks its schema is painted on its field and nothing is written until all pass. The setup token is deleted on success. Restart the service so port and certificate changes apply:

```bash
sudo systemctl restart boxvault
```

### 4. Register the first account

Open `/register`. The first account gets the global `admin` role and a personal organization named after its username. Verify the email from the message BoxVault sends, then sign in.

### 5. Create Your First Organization

1. Open the user menu and choose the organization console
2. Create an organization: name, description, access mode (`private`, `invite_only` or `request_to_join`)
3. Invite members by email; an invitation carries the role `member` or `admin`

Users can belong to several organizations, create boxes in any organization they are a member of, and switch the active organization from the user menu. A service account is scoped to one organization at creation.

### 6. Upload Your First Box

1. Open the organization and choose "Create Box"
2. Fill in the box: name (letters, digits, dashes and periods), description, public or private
3. Create a version (for example `1.0.0`)
4. Add a provider (for example `virtualbox`)
5. Add an architecture (for example `amd64`)
6. Upload the `.box` file

## Using BoxVault

### Web Interface

- **Home** - the boxes and ISOs of every organization you can see, with search and filters
- **Organization console** - the organization record, members, invitations and join requests
- **Admin** - every organization, user and the four configuration files
- **Profile** - password, email, display name, preferences and service accounts

### API Access

```bash
curl -X POST https://boxvault.example.com/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{ "username": "admin", "password": "your-password", "stay_logged_in": true }'

curl -H "x-access-token: YOUR_TOKEN" \
  https://boxvault.example.com/api/organization/myorg/box
```

The sign-in answers `accessToken`; every request carries it as `x-access-token`. Request bodies are `snake_case`, and the rules every form and route enforce are served at `GET /api/rules`. See the [API Examples](../api-examples/).

### Vagrant Integration

```ruby
Vagrant.configure("2") do |config|
  config.vm.box = "myorg/debian12"
  config.vm.box_url = "https://boxvault.example.com/myorg/debian12"
end
```

BoxVault answers the Vagrant client at `/<organization>/<box>` with the box metadata and serves the file from `/<organization>/boxes/<box>/versions/<version>/providers/<provider>/<architecture>/vagrant.box`. A private box needs a service-account token:

```ruby
  config.vm.box_download_options = { "header" => "Authorization: Bearer RAW_SERVICE_ACCOUNT_TOKEN" }
```

## Configuration

BoxVault reads four plain YAML files from `CONFIG_DIR` (`/etc/boxvault`): `app.config.yaml`, `auth.config.yaml`, `db.config.yaml` and `mail.config.yaml`. `CONFIG_DIR` is the only environment variable it reads; every other setting is a value in a file, edited on the admin page or by hand. The keys are in the [Configuration](../../configuration/) reference.

## User Management

### Roles

| Scope           | Roles                                                     |
| --------------- | --------------------------------------------------------- |
| global          | `user`, `admin` (the admin page, every organization)      |
| organization    | `owner`, `admin`, `member`                                |
| service account | `ROLE_SERVICE_ACCOUNT`, scoped to one organization        |

### Creating Users

A global admin creates a user inside an organization from the admin page; anyone else joins by invitation, by a join request to a `request_to_join` organization, or by self-registration while `auth.local.local_allow_new_organizations` is on.

### Organization Management

An owner or admin manages membership from the organization console:

1. Invite by email with the role `member` or `admin`
2. Approve or deny join requests
3. Change a member's role (owner only) or remove a member
4. Create service accounts for CI

## Best Practices

### Box Naming

Use consistent naming conventions:

- `organization/box-name` (e.g., `mycompany/ubuntu-20.04`)
- Include OS and version in the name
- Use semantic versioning for box versions

### Version Management

- Use semantic versioning (e.g., 1.0.0, 1.1.0, 2.0.0)
- Document changes in version descriptions
- Test boxes before publishing

### Security

- Use passphrases: the minimum is 15 characters and no composition rule applies
- Give service accounts the shortest `expiration_days` the job allows
- Keep BoxVault updated
- Serve HTTPS; the package does so out of the box

## Next Steps

Now that you have BoxVault running:

1. **[Configure](../../configuration/)** - Set up production configuration
2. **[Install](../installation/)** - Deploy to production
3. **[API Reference](../../api/)** - Explore the API
4. **[Authentication](../authentication/)** - Set up API access
5. **[Backend Integration](../backend-integration/)** - Integrate with CI/CD

## Getting Help

Need help? Check out:

- **[Troubleshooting](../installation/#troubleshooting)** - Common issues
- **[GitHub Issues](https://github.com/Makr91/BoxVault/issues)** - Bug reports
- **[GitHub Discussions](https://github.com/Makr91/BoxVault/discussions)** - Community help
- **[Support](../../support/)** - Support resources
