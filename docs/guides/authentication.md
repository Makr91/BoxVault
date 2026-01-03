---
title: Authentication
layout: default
parent: Guides
nav_order: 3
permalink: /docs/guides/authentication/
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

BoxVault uses JWT (JSON Web Tokens) for authentication, providing secure access to both the web interface and API endpoints.

## User Authentication

### Web Interface Login

1. Navigate to BoxVault web interface
2. Click "Sign In"
3. Enter username/email and password
4. Access granted with session cookie

### API Authentication

Get JWT token via API:

```bash
curl -X POST http://localhost:3000/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"username":"your-username","password":"your-password"}'
```

Response:

```json
{
  "id": 1,
  "username": "your-username",
  "email": "user@example.com",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Using JWT Tokens

Include the token in API requests:

```bash
curl -H "x-access-token: YOUR_JWT_TOKEN" \
  http://localhost:3000/api/user/profile
```

## Token Management

### Token Expiration

JWT tokens have configurable expiration times:

```yaml
auth:
  jwt:
    secret: "your-secret-key"
    expiresIn: "24h" # 24 hours
```

### Token Refresh

Refresh expired tokens:

```bash
curl -X POST http://localhost:3000/api/auth/refreshtoken \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"YOUR_REFRESH_TOKEN"}'
```

### Token Revocation

Logout/revoke tokens:

```bash
curl -X POST http://localhost:3000/api/auth/signout \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

## User Roles and Permissions

### Role Hierarchy

1. **Admin** - Full system access
2. **Moderator** - Organization management
3. **User** - Basic access
4. **Service Account** - API-only access

### Permission Matrix

| Action                     | Admin | Moderator (org)    | User (org member)      | Service Account    |
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
- Moderators and admins can modify/delete ANY box within their organizations
- Service accounts are scoped to a specific organization at creation time

## Service Accounts

### Creating Service Accounts

Service accounts are for API-only access:

```bash
curl -X POST http://localhost:3000/api/admin/service-accounts \
  -H "x-access-token: ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CI/CD Pipeline",
    "description": "Automated box uploads",
    "organizationId": 1
  }'
```

### Service Account Authentication

```bash
curl -X POST http://localhost:3000/api/auth/service-account \
  -H "Content-Type: application/json" \
  -d '{"clientId":"service-account-id","clientSecret":"service-account-secret"}'
```

## API Security

### Rate Limiting

API requests are rate limited:

- **Authenticated**: 1000 requests/hour
- **Unauthenticated**: 100 requests/hour
- **File uploads**: 10 uploads/hour

### CORS Configuration

Configure CORS for web applications:

```yaml
server:
  cors:
    enabled: true
    origin: ["https://your-app.com"]
    credentials: true
```

## Security Best Practices

### Password Requirements

- Minimum 8 characters
- Mix of uppercase, lowercase, numbers
- Special characters recommended
- No common passwords

### JWT Security

- Use strong secret keys (256-bit minimum)
- Rotate secrets regularly
- Set appropriate expiration times
- Use HTTPS in production

### Account Security

- Enable two-factor authentication (if available)
- Regular password changes
- Monitor login activity
- Revoke unused tokens

## Integration Examples

### CI/CD Pipeline

```yaml
# GitHub Actions example
- name: Upload Box to BoxVault
  run: |
    TOKEN=$(curl -s -X POST $BOXVAULT_URL/api/auth/service-account \
      -H "Content-Type: application/json" \
      -d '{"clientId":"${{ secrets.BOXVAULT_CLIENT_ID }}","clientSecret":"${{ secrets.BOXVAULT_CLIENT_SECRET }}"}' \
      | jq -r '.accessToken')

    curl -X POST $BOXVAULT_URL/api/organization/myorg/box/mybox/version/1.0.0/provider/virtualbox/architecture/amd64/file \
      -H "x-access-token: $TOKEN" \
      -F "file=@mybox.box"
```

### Vagrant Plugin

```ruby
# Vagrantfile
Vagrant.configure("2") do |config|
  config.vm.box = "myorg/ubuntu-20.04"
  config.vm.box_url = "https://boxvault.example.com/api/organization/myorg/box/ubuntu-20.04"
  config.vm.box_download_options = {
    "x-access-token" => ENV['BOXVAULT_TOKEN']
  }
end
```

## Troubleshooting

### Common Issues

**Invalid token:**

- Check token expiration
- Verify token format
- Ensure correct header name

**Permission denied:**

- Check user role
- Verify organization membership
- Review resource permissions

**Rate limit exceeded:**

- Implement exponential backoff
- Use service accounts for automation
- Contact admin for limit increases
