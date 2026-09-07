---
title: Authentication
layout: default
parent: Guides
nav_order: 3
permalink: /guides/authentication/
---

## Authentication Guide

{: .no_toc }

Learn about BoxVault authentication, JWT tokens, and API access.

## Table of contents

{: .no_toc .text-delta }

1. TOC
   {:toc}

---

## Overview

BoxVault signs its own HS256 session tokens (JWT) for the web interface and the API, accepts the access tokens of a configured identity provider when the resource-server setting is on, and issues raw service-account keys for automation.

## User Authentication

### Web Interface Login

1. Navigate to BoxVault web interface
2. Click "Sign In"
3. Enter username and password, or pick an identity provider
4. The STARTcloud UI stores the session token and sends it as `x-access-token`

### API Authentication

Get JWT token via API:

```bash
curl -X POST https://boxvault.example.com/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"username":"your-username","password":"your-password","stay_logged_in":false}'
```

Response:

```json
{
  "id": 1,
  "username": "your-username",
  "name": "Your Name",
  "email": "user@example.com",
  "verified": true,
  "roles": ["ROLE_USER"],
  "organization": "myorg",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "isServiceAccount": false,
  "provider": "local",
  "stayLoggedIn": false
}
```

The body also carries `organizations`, `preferredLanguage`, `preferredTheme`, `emailHash`, `avatarUrl` and `entitlements`. There is no refresh token.

### Using JWT Tokens

Include the token in API requests:

```bash
curl -H "x-access-token: YOUR_JWT_TOKEN" \
  https://boxvault.example.com/api/user
```

## Token Management

### Token Expiration

```yaml
auth:
  jwt:
    jwt_secret: a-random-string-of-at-least-32-characters
    jwt_expiration: 24h
  local:
    local_session_timeout: 24
```

`auth.jwt.jwt_expiration` is the lifetime of a token signed at sign-in (`24h`, `7d`, `1h`); a sign-in with `stay_logged_in: true` is signed for `auth.local.local_session_timeout` hours instead.

### Token Refresh

A session renews its token with the current one; only a session token is accepted here, never a service-account key:

```bash
curl -X POST https://boxvault.example.com/api/auth/refresh-token \
  -H "x-access-token: YOUR_CURRENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"stay_logged_in":true}'
```

The answer is the sign-in body again with a new `accessToken`. The STARTcloud UI refreshes four minutes after the last refresh while the session was kept.

### Token Revocation

There is no sign-out route for a local session: the client drops the token, and it expires on its own. An OIDC session ends at the identity provider too:

```bash
curl -X POST https://boxvault.example.com/api/auth/oidc/logout \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

The answer carries `redirect_url`, the provider's end-session URL, when the provider supports RP-initiated logout. `POST /api/auth/oidc/logout/local` ends the BoxVault side alone. Tokens issued before a user's `sessionsInvalidAfter` timestamp are refused.

## User Roles and Permissions

### Role Hierarchy

| Scope           | Roles                                                                 |
| --------------- | --------------------------------------------------------------------- |
| global          | `admin` (full system access), `user`                                  |
| organization    | `owner`, `admin`, `member`                                            |
| service account | `ROLE_SERVICE_ACCOUNT`, acting as its creator inside one organization |

The sign-in answers the global roles as `ROLE_USER` and `ROLE_ADMIN`; the organization role is per membership.

### Permission Matrix

| Action                     | Admin | Org Admin          | Member                 | Service Account    |
| -------------------------- | ----- | ------------------ | ---------------------- | ------------------ |
| Create Organization        | ✓     | ✓                  | ✗                      | ✗                  |
| Manage Users               | ✓     | ✓ (org only)       | ✗                      | ✗                  |
| Create Boxes               | ✓     | ✓                  | ✓ (in any member org)  | ✓ (scoped to org)  |
| Update Own Boxes           | ✓     | ✓                  | ✓                      | ✓                  |
| Update Others' Boxes       | ✓     | ✓ (org only)       | ✗                      | ✗                  |
| Delete Own Boxes           | ✓     | ✓                  | ✓                      | ✓                  |
| Delete Others' Boxes       | ✓     | ✓ (org only)       | ✗                      | ✗                  |
| Download Public Boxes      | ✓     | ✓                  | ✓                      | ✓                  |
| Download Private Boxes     | ✓     | ✓ (member orgs)    | ✓ (member orgs)        | ✓ (scoped org)     |
| Delete All Boxes (org)     | ✓     | ✓ (org only)       | ✗                      | ✗                  |
| System Settings            | ✓     | ✗                  | ✗                      | ✗                  |

**Notes:**

- Users can create boxes in ANY organization they belong to (not just their primary organization)
- Users can only modify/delete boxes they created
- Org admins and owners can modify/delete ANY box within their organizations
- Service accounts are scoped to a specific organization at creation time

## Service Accounts

### Creating Service Accounts

Any member of the organization creates a service account for it; the raw token is returned once and stored as a sha256 hash:

```bash
curl -X POST https://boxvault.example.com/api/service-accounts \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "CI/CD Pipeline",
    "expiration_days": 90,
    "organization_id": 1
  }'
```

`expiration_days` may not exceed `auth.jwt.service_account_max_expiry_days` (365 by default). The answer carries `id`, `username` (`<creator>-<8 hex>`), `description`, `expiresAt`, `organization_id`, `createdAt` and `token`. `GET /api/service-accounts` lists yours, `GET /api/service-accounts/organizations` the organizations you may create one in, and `DELETE /api/service-accounts/:id` revokes one.

### Service Account Authentication

A service account either signs in with its username and raw token to receive a session JWT, or presents the raw token directly on every request:

```bash
curl -X POST https://boxvault.example.com/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"username":"ci-7fb6603d","password":"RAW_SERVICE_ACCOUNT_TOKEN"}'

curl -H "Authorization: Bearer RAW_SERVICE_ACCOUNT_TOKEN" \
  https://boxvault.example.com/api/organization/myorg/box
```

A service account acts as its creator: a suspended creator's keys stop working, and an expired account is refused.

### Identity-provider tokens

With `auth.resource_server.enabled: true` and `auth.resource_server.audience` set, an access token minted by a configured OIDC provider is accepted on `Authorization: Bearer` (or `Authorization: DPoP` with a `DPoP` proof for a key-bound token); the user is resolved by the token's subject and provisioned on first contact. The credentials of a request are resolved in the order session JWT on `x-access-token`, identity-provider token on `Authorization`, raw service-account key.

## API Security

### Rate Limiting

One window, `rate_limiting.window_minutes` (15), with a ceiling per class of request:

| Limiter                                             | Key in `app.config.yaml`                              | Schema default                      |
| --------------------------------------------------- | ----------------------------------------------------- | ----------------------------------- |
| every request                                       | `rate_limiting.max_requests`                          | 1000 (100 in the packaged template) |
| file upload, info, download-link and delete routes  | `rate_limiting.file_operations_max_requests`          | 2000                                |
| file downloads                                      | `rate_limiting.download_max_requests`                 | 2000                                |
| download-link generation                            | `rate_limiting.download_link_max_requests`            | 100                                 |
| architecture operations                             | `rate_limiting.architecture_operations_max_requests`  | 500                                 |

A refused request answers `429` with `RateLimit-*` headers and `{ "error": "RATE_LIMIT_EXCEEDED", "message": "…" }`; `skip_successful_requests` and `skip_failed_requests` exclude a class of answers from the count.

### CORS Configuration

```yaml
boxvault:
  origin: https://boxvault.example.com
  allowed_origins:
    - https://catalog.example.com
```

`boxvault.origin` is always allowed; `boxvault.allowed_origins` adds other browser origins. Credentials, the `x-access-token`, `Authorization` and `DPoP` headers and the `X-Refreshed-Token` response header are allowed; both keys need a restart.

## Security Best Practices

### Password Requirements

- At least `auth.local.local_password_min_length` characters, 15 by default, and at most 128
- No composition rule by default; `local_password_require_uppercase`, `local_password_require_lowercase`, `local_password_require_numbers` and `local_password_require_symbols` turn one on each
- Not on the route's blocklist of common passwords, refused as `422` with rule `blocklist`
- Hashed with bcrypt at `auth.local.local_bcrypt_rounds`

### JWT Security

- Use strong secret keys (256-bit minimum)
- Rotate secrets regularly
- Set appropriate expiration times
- Use HTTPS in production

### Account Security

- Email verification is required for local sign-in by default
- Suspending a user refuses their sign-in and every service account they created
- Revoke unused service accounts; every one expires

## Integration Examples

### CI/CD Pipeline

The version, provider and architecture must exist before the upload; the file is the raw request body.

```yaml
- name: Upload Box to BoxVault
  run: |
    curl --fail -X POST "$BOXVAULT_URL/api/organization/myorg/box/mybox/version/1.0.0/provider/virtualbox/architecture/amd64/file/upload" \
      -H "Authorization: Bearer ${{ secrets.BOXVAULT_TOKEN }}" \
      -H "Content-Type: application/octet-stream" \
      -H "X-File-Name: mybox.box" \
      --upload-file mybox.box
```

### Vagrant Plugin

```ruby
Vagrant.configure("2") do |config|
  config.vm.box = "myorg/ubuntu-20.04"
  config.vm.box_url = "https://boxvault.example.com/myorg/ubuntu-20.04"
  config.vm.box_download_options = {
    "header" => "Authorization: Bearer RAW_SERVICE_ACCOUNT_TOKEN"
  }
end
```

Vagrant identifies itself by its user agent; a presented token that is invalid or expired is refused with `401`, and a request without one reaches public boxes only.

## Troubleshooting

### Common Issues

**Invalid token:**

- Check token expiration
- Verify token format
- Ensure correct header name: `x-access-token` for a session JWT, `Authorization: Bearer` for a raw service-account key

**Permission denied:**

- Check user role
- Verify organization membership
- Review resource permissions

**Rate limit exceeded:**

- Implement exponential backoff
- Use service accounts for automation
- Contact admin for limit increases
