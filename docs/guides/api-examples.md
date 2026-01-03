---
title: API Examples
layout: default
parent: Guides
nav_order: 4
permalink: /docs/guides/api-examples/
---

## API Examples

{: .no_toc }

This guide provides comprehensive examples for using the BoxVault REST API with curl commands and detailed responses.

## Table of contents

{: .no_toc .text-delta }

1. TOC
   {:toc}

---

## Authentication

All authenticated endpoints require a JWT token in the `x-access-token` header:

```bash
curl -H "x-access-token: YOUR_JWT_TOKEN" https://boxvault.example.com/api/user
```

### Sign In

```bash
curl -X POST https://boxvault.example.com/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "username": "YOUR_USERNAME",
    "password": "YOUR_PASSWORD",
    "stayLoggedIn": true
  }'
```

**Response:**

```json
{
  "id": "user_id",
  "username": "username",
  "email": "email@example.com",
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "roles": ["user", "admin"],
  "organization": "myorg"
}
```

### Sign Up

```bash
curl -X POST https://boxvault.example.com/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser",
    "email": "newuser@example.com",
    "password": "password123",
    "invitationToken": "optional-invitation-token"
  }'
```

### Refresh Token

```bash
# Only available if stayLoggedIn=true during signin
curl -X GET https://boxvault.example.com/api/auth/refresh-token \
  -H "x-access-token: YOUR_CURRENT_TOKEN"
```

---

## Organizations

### Create Organization

```bash
curl -X POST https://boxvault.example.com/api/organization \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "myorg",
    "description": "My Organization",
    "email": "org@example.com"
  }'
```

### Send Invitation

```bash
curl -X POST https://boxvault.example.com/api/auth/invite \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "organizationName": "myorg"
  }'
```

**Response:**

```json
{
  "message": "Invitation sent successfully!",
  "invitationToken": "761ae0028a11ee75a02f16f702b9aa63312acfe0",
  "invitationTokenExpires": 1735467934627,
  "organizationId": 1,
  "invitationLink": "https://boxvault.example.com/register?token=761ae0028a11ee75a02f16f702b9aa63312acfe0&organization=myorg"
}
```

---

## Box Management

### Create Box

You can create boxes in ANY organization you're a member of:

```bash
# Create box in organization "myorg"
curl -X POST https://boxvault.example.com/api/organization/myorg/box \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "debian12",
    "description": "Debian 12 Server",
    "isPublic": false
  }'

# Create box in a different organization "otherorg" (if you're a member)
curl -X POST https://boxvault.example.com/api/organization/otherorg/box \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ubuntu22",
    "description": "Ubuntu 22.04 Server",
    "isPublic": true
  }'
```

**Permission Notes:**

- Any organization member can create boxes
- You can only update/delete boxes you created
- Moderators and admins can update/delete any box in their organizations

### Create Box Version

```bash
curl -X POST https://boxvault.example.com/api/organization/myorg/box/debian12/version \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "versionNumber": "1.0.0",
    "description": "Initial release"
  }'
```

### Create Provider

```bash
curl -X POST https://boxvault.example.com/api/organization/myorg/box/debian12/version/1.0.0/provider \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "virtualbox",
    "description": "VirtualBox provider"
  }'
```

### Create Architecture

```bash
curl -X POST https://boxvault.example.com/api/organization/myorg/box/debian12/version/1.0.0/provider/virtualbox/architecture \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "amd64",
    "defaultBox": true
  }'
```

---

## File Operations

### Upload Box File

Files are uploaded directly to the server using a single request. To show upload progress, use curl's progress bar:

```bash
# Upload with progress bar and reliable transfer settings
curl --progress-bar \
  --max-time 0 \
  --connect-timeout 0 \
  --retry 5 \
  --retry-delay 10 \
  --retry-max-time 0 \
  -o upload_response.txt \
  -X POST "https://boxvault.example.com/api/organization/myorg/box/debian12/version/1.0.0/provider/virtualbox/architecture/amd64/file/upload" \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/octet-stream" \
  -H "X-File-Name: vagrant.box" \
  --upload-file box-file.box
```

**Upload Options Explained:**

- `--progress-bar`: Show a progress bar during upload
- `--max-time 0`: Disable maximum time the transfer can take
- `--connect-timeout 0`: Disable connection timeout
- `--retry 5`: Retry up to 5 times if the transfer fails
- `--retry-delay 10`: Wait 10 seconds between retries
- `--retry-max-time 0`: Disable the maximum time for retries
- `-o upload_response.txt`: Save server response to file

### Download Box File

BoxVault provides multiple ways to download box files:

1. **Direct browser download:**

   ```bash
   curl -O "https://boxvault.example.com/myorg/boxes/debian12/versions/1.0.0/    providers/virtualbox/amd64/vagrant.box"
   ```

2. **Using Vagrant CLI:**

   ```bash
   vagrant box add "boxvault.example.com/myorg/debian12"
   ```

3. **Using download link:**

   ```bash
   # Get download link
   curl -X POST "https://boxvault.example.com/api/organization/myorg/box/debian12/   version/1.0.0/provider/virtualbox/architecture/amd64/file/get-download-link" \
     -H "x-access-token: YOUR_JWT_TOKEN"

   # Download using returned URL
   curl -O "DOWNLOAD_URL"
   ```

### Get Box Metadata

```bash
curl "https://boxvault.example.com/api/organization/myorg/box/debian12/metadata"
```

**Response:**

```json
{
  "name": "debian12",
  "description": "Debian 12 Server",
  "versions": [
    {
      "version": "1.0.0",
      "providers": [
        {
          "name": "virtualbox",
          "url": "https://boxvault.example.com/myorg/boxes/debian12/versions/1.0.0/providers/virtualbox/amd64/vagrant.box",
          "checksum_type": "sha256",
          "checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          "fileSize": "1508591037"
        }
      ]
    }
  ]
}
```

**Note:** File sizes are returned in bytes. To convert to GB:

```javascript
const bytesToGB = (bytes) => (bytes / 1024 / 1024 / 1024).toFixed(2);
console.log(bytesToGB(1508591037)); // Outputs: "1.40"
```

---

## Service Account Management

### Create Service Account

```bash
curl -X POST https://boxvault.example.com/api/service-accounts \
  -H "x-access-token: YOUR_ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "CI/CD Service Account",
    "expirationDays": 365
  }'
```

**Response:**

```json
{
  "id": 1,
  "username": "mark-7fb6603d",
  "token": "319b8554ee85c3df139dbbb98169b64a4b50f338968bdc145fd851eb68eff0f0",
  "expiresAt": "2025-12-28T10:51:02.000Z",
  "description": "CI/CD Service Account",
  "createdAt": "2024-12-28T10:51:02.000Z",
  "updatedAt": "2024-12-28T10:51:02.000Z",
  "userId": 1
}
```

### Authenticate Service Account

```bash
curl -X POST https://boxvault.example.com/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "username": "mark-7fb6603d",
    "password": "319b8554ee85c3df139dbbb98169b64a4b50f338968bdc145fd851eb68eff0f0",
    "stayLoggedIn": true
  }'
```

---

## System Configuration

### Check Setup Status

```bash
curl -X GET https://boxvault.example.com/api/setup/status
```

### Upload SSL Certificate

```bash
curl -X POST https://boxvault.example.com/api/setup/upload-ssl \
  -H "Content-Type: multipart/form-data" \
  -F "cert=@/path/to/cert.pem" \
  -F "key=@/path/to/key.pem"
```

### Test SMTP Configuration

```bash
curl -X POST https://boxvault.example.com/api/mail/test-smtp \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "host": "smtp.example.com",
    "port": 587,
    "secure": true,
    "auth": {
      "user": "smtp-user",
      "pass": "smtp-password"
    },
    "to": "recipient@example.com",
    "from": "sender@example.com"
  }'
```

---

## Error Handling

### Common Error Responses

**Role-Based Access Errors:**

```json
{
  "error": "INSUFFICIENT_PERMISSIONS",
  "message": "Require Admin Role",
  "details": {
    "requiredRole": "admin",
    "currentRoles": ["user"]
  }
}
```

**Authentication Errors:**

```json
{
  "error": "TOKEN_EXPIRED",
  "message": "JWT token has expired",
  "details": {
    "expiredAt": "2024-01-01T00:00:00Z"
  }
}
```

**Upload Errors:**

```json
{
  "error": "CHUNK_TOO_LARGE",
  "message": "Upload chunk exceeds size limit",
  "details": {
    "maxSize": 104857600,
    "receivedSize": 157286400
  }
}
```

**Validation Errors:**

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid input parameters",
  "details": {
    "name": "Only alphanumeric characters, hyphens and underscores allowed",
    "version": "Must follow semantic versioning (x.y.z)"
  }
}
```

### HTTP Status Codes

- `200 OK` - Request succeeded
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid parameters
- `401 Unauthorized` - Missing or invalid authentication
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `408 Request Timeout` - Upload timeout
- `409 Conflict` - Resource already exists
- `413 Payload Too Large` - Upload chunk too large
- `500 Internal Server Error` - Server error
- `507 Insufficient Storage` - Not enough storage space

---

## Complete API Reference

For the complete API reference with all endpoints, parameters, and responses, visit:

- **[Interactive API Documentation](/api-docs/)** - Swagger UI with live testing
- **[API Overview](../api/)** - High-level API information
- **[Authentication Guide](../guides/authentication/)** - Detailed authentication setup
