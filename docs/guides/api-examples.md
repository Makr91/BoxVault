---
title: API Examples
layout: default
parent: Guides
nav_order: 4
permalink: /guides/api-examples/
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
    "stay_logged_in": true
  }'
```

**Response:**

```json
{
  "id": "user_id",
  "username": "username",
  "email": "email@example.com",
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "roles": ["ROLE_USER", "ROLE_ADMIN"],
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
    "invitation_token": "optional-invitation-token"
  }'
```

### Refresh Token

```bash
curl -X POST https://boxvault.example.com/api/auth/refresh-token \
  -H "x-access-token: YOUR_CURRENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "stay_logged_in": true }'
```

---

## Organizations

### Create Organization

```bash
curl -X POST https://boxvault.example.com/api/organization \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "organization": "myorg",
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
    "organization_name": "myorg",
    "invite_role": "member"
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
    "is_public": false
  }'

# Create box in a different organization "otherorg" (if you're a member)
curl -X POST https://boxvault.example.com/api/organization/otherorg/box \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ubuntu22",
    "description": "Ubuntu 22.04 Server",
    "is_public": true
  }'
```

**Permission Notes:**

- Any organization member can create boxes; a guest reads and downloads only, every write answers `403`
- You can only update/delete boxes you created
- Org admins and owners can update/delete any box in their organizations

### Create Box Version

```bash
curl -X POST https://boxvault.example.com/api/organization/myorg/box/debian12/version \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "version_number": "1.0.0",
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
    "default_box": true
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
   curl -O "https://boxvault.example.com/myorg/boxes/debian12/versions/1.0.0/providers/virtualbox/amd64/vagrant.box"
   ```

2. **Using Vagrant CLI:**

   ```bash
   vagrant box add "boxvault.example.com/myorg/debian12"
   ```

3. **Using download link:**

   ```bash
   # Get download link
   curl -X POST "https://boxvault.example.com/api/organization/myorg/box/debian12/version/1.0.0/provider/virtualbox/architecture/amd64/file/get-download-link" \
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
          "architecture": "amd64",
          "default_architecture": true
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

## Downloads

A download product owns releases, a release owns patches, and a patch owns files. Visibility: a public, published product is accessible to anyone; a published, private product to anyone in the same organization; an unpublished product to no one but the user who uploaded it, not even people in their organization. Any organization member can create a product; the product's owner, or an admin or owner of the organization, adds releases, patches and files and updates or deletes them. A guest of the organization sees and downloads what a member sees and writes nothing.

### Create Product

```bash
curl -X POST https://boxvault.example.com/api/organization/myorg/download \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "domino-server",
    "description": "HCL Domino server installers and fix packs",
    "family": "HCL Domino",
    "vendor": "HCL",
    "is_public": false
  }'
```

A new product is unpublished until you publish it.

### Create Release

```bash
curl -X POST https://boxvault.example.com/api/organization/myorg/download/domino-server/release \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "version_number": "14.5.1",
    "description": "Domino 14.5.1"
  }'
```

### Create Patch

The release itself is the patch named `release`; fix packs, interim fixes and hotfixes are patches beside it.

```bash
curl -X POST https://boxvault.example.com/api/organization/myorg/download/domino-server/release/14.5.1/patch \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "FP1",
    "kind": "fixpack",
    "released_at": "2026-07-16"
  }'
```

### Create File

```bash
curl -X POST https://boxvault.example.com/api/organization/myorg/download/domino-server/release/14.5.1/patch/FP1/file \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "linux-x64",
    "file_name": "Domino_1451FP1_Linux_English.tar",
    "kind": "fixpack",
    "platform": "linux",
    "architecture": "x64",
    "language": "en",
    "checksum_type": "SHA256",
    "checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  }'
```

### Upload File in Chunks

The web interface uploads in 5 MB chunks; the same route takes them from curl. Split the file, send one request per chunk with its index, and poll the file info until `file_size` is set:

```bash
split -b 5m -d -a 4 Domino_1451FP1_Linux_English.tar chunk-

TOTAL=$(ls chunk-* | wc -l)
INDEX=0
for CHUNK in chunk-*; do
  curl -X POST "https://boxvault.example.com/api/organization/myorg/download/domino-server/release/14.5.1/patch/FP1/file/linux-x64/upload" \
    -H "x-access-token: YOUR_JWT_TOKEN" \
    -H "Content-Type: application/octet-stream" \
    -H "X-File-Name: Domino_1451FP1_Linux_English.tar" \
    -H "X-Checksum: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" \
    -H "X-Checksum-Type: sha256" \
    -H "X-Chunk-Index: $INDEX" \
    -H "X-Total-Chunks: $TOTAL" \
    --upload-file "$CHUNK"
  INDEX=$((INDEX + 1))
done

curl "https://boxvault.example.com/api/organization/myorg/download/domino-server/release/14.5.1/patch/FP1/file/linux-x64/info" \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

### Upload File in One Call

One request with the whole file creates the product, the release, the patch and the file row when they are absent, with the defaults: the product unpublished and owned by you, the patch `release` with kind `release`, the file kind `other`, platform `any`, architecture `any`, language `any`, the key from the URL and the file name from `X-File-Name`. Meant for CI with a service account:

```bash
curl --progress-bar \
  --max-time 0 \
  --connect-timeout 0 \
  --retry 5 \
  --retry-delay 10 \
  --retry-max-time 0 \
  -o upload_response.txt \
  -X POST "https://boxvault.example.com/api/organization/myorg/download/domino-server/release/14.5.1/patch/FP1/file/linux-x64/upload" \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/octet-stream" \
  -H "X-File-Name: Domino_1451FP1_Linux_English.tar" \
  -H "X-Checksum: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" \
  -H "X-Checksum-Type: sha256" \
  --upload-file Domino_1451FP1_Linux_English.tar
```

A product name that is not a slug, or a release or patch that is not an identifier, is refused with `422` and the pointer of the failing part.

### Upload File in Two Steps

A person's upload lands the bytes first and names the levels after. The pending route takes the same chunks (or the whole file) into the organization's pending store and validates nothing but the upload headers and the file name; every chunk answers `details.is_complete` and `details.status` beside `{ id, file_name, size, guess }`, the guess read from the file name and empty where the name gives nothing:

```bash
curl -X POST "https://boxvault.example.com/api/organization/myorg/download/pending/upload" \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/octet-stream" \
  -H "X-File-Name: Domino_14.5.1_Linux_English.tar" \
  --upload-file Domino_14.5.1_Linux_English.tar
```

**Response:**

```json
{
  "message": "File upload completed",
  "details": {
    "is_complete": true,
    "status": "complete",
    "file_size": 1508591037,
    "id": "3f9c2a7e0b6d4e1f8a2c5d7b9e0f1a2b",
    "file_name": "Domino_14.5.1_Linux_English.tar",
    "size": 1508591037,
    "guess": {
      "product": "domino",
      "release": "14.5.1",
      "patch": "release",
      "key": "Domino_14.5.1_Linux_English.tar",
      "kind": "other",
      "platform": "linux",
      "architecture": "any",
      "language": "en"
    }
  }
}
```

`GET …/download/pending/{id}/info` answers the assembled size for a chunked upload's poll. Placing names the levels and the file's members, validated as the level routes validate them; the absent product, release and patch are created, the bytes move to the product path and the answer is the file's address:

```bash
curl -X POST "https://boxvault.example.com/api/organization/myorg/download/pending/3f9c2a7e0b6d4e1f8a2c5d7b9e0f1a2b/place" \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "product": "domino-server",
    "release": "14.5.1",
    "patch": "release",
    "key": "linux-x64",
    "kind": "installer",
    "platform": "linux",
    "architecture": "x64",
    "language": "en"
  }'
```

**Response:**

```json
{
  "product": "domino-server",
  "release": "14.5.1",
  "patch": "release",
  "key": "linux-x64"
}
```

A blank release answers `422` with the pointer `/version_number`. `DELETE …/download/pending/{id}` discards a pending upload; the member who uploaded it, or an admin or owner of the organization, may place or discard it, and the server drops a pending upload nobody placed after a day.

### Set the Patch Kind

```bash
curl -X PUT https://boxvault.example.com/api/organization/myorg/download/domino-server/release/14.5.1/patch/FP1 \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "kind": "fixpack", "released_at": "2026-07-16" }'
```

### Publish Product

```bash
curl -X PUT https://boxvault.example.com/api/organization/myorg/download/domino-server \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "published": true }'
```

### Get Download Link

```bash
curl -X POST "https://boxvault.example.com/api/organization/myorg/download/domino-server/release/14.5.1/patch/FP1/file/linux-x64/get-download-link" \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**

```json
{
  "download_url": "https://boxvault.example.com/api/organization/myorg/download/domino-server/release/14.5.1/patch/FP1/file/linux-x64/download?token=..."
}
```

### Download File

A public, published product needs no credential; a private one takes a service-account key as Basic or Bearer auth, or the tokened link above:

```bash
curl -O -J "https://boxvault.example.com/api/organization/myorg/download/domino-server/release/14.5.1/patch/FP1/file/linux-x64/download"

curl -O -J "https://boxvault.example.com/api/organization/myorg/download/domino-server/release/14.5.1/patch/FP1/file/linux-x64/download" \
  -H "Authorization: Bearer RAW_SERVICE_ACCOUNT_TOKEN"
```

The file name is accepted in place of the key, so a fetch saves the file under its own name:

```bash
curl -O -J "https://boxvault.example.com/api/organization/myorg/download/domino-server/release/14.5.1/patch/FP1/file/Domino_1451FP1_Linux_English.tar/download"
```

### One Address for the Page and the Bytes

The browser address of a file answers the patch page to a browser (an `Accept` naming `text/html`) and the bytes to anything else, with `Content-Disposition: attachment` and the file name:

```bash
curl -O -J "https://boxvault.example.com/myorg/downloads/domino-server/14.5.1/FP1/Domino_1451FP1_Linux_English.tar"
```

The product, release and patch addresses answer their JSON the same way. On a hostname whose `sites.<host>.collections` starts with `downloads`, the `downloads` segment is dropped: `https://downloads.example.com/myorg/domino-server/14.5.1/FP1/Domino_1451FP1_Linux_English.tar`.

---

## Service Account Management

### Create Service Account

Any member of the organization may create one; `expiration_days` is capped by `auth.jwt.service_account_max_expiry_days`.

```bash
curl -X POST https://boxvault.example.com/api/service-accounts \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "CI/CD Service Account",
    "expiration_days": 365,
    "organization_id": 1
  }'
```

**Response:**

```json
{
  "id": 1,
  "username": "mark-7fb6603d",
  "description": "CI/CD Service Account",
  "role": "member",
  "expires_at": "2025-12-28T10:51:02.000Z",
  "organization_id": 1,
  "created_at": "2024-12-28T10:51:02.000Z",
  "token": "319b8554ee85c3df139dbbb98169b64a4b50f338968bdc145fd851eb68eff0f0"
}
```

### Authenticate Service Account

```bash
curl -X POST https://boxvault.example.com/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "username": "mark-7fb6603d",
    "password": "319b8554ee85c3df139dbbb98169b64a4b50f338968bdc145fd851eb68eff0f0",
    "stay_logged_in": true
  }'
```

---

## System Configuration

### Check Setup Status

```bash
curl -X GET https://boxvault.example.com/api/setup/status
```

**Response:**

```json
{
  "setup_complete": false
}
```

### Read and Write a Configuration File

`GET` answers the raw file; `PUT` is a JSON Merge Patch over it, `null` removing a key. Admin only.

```bash
curl https://boxvault.example.com/api/config/app \
  -H "x-access-token: YOUR_ADMIN_JWT_TOKEN"

curl -X PUT https://boxvault.example.com/api/config/app \
  -H "x-access-token: YOUR_ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "boxvault": { "api_listen_port_encrypted": 8443 } }'
```

**Response:**

```json
{
  "message": "Configuration saved.",
  "requires_restart": [
    {
      "pointer": "/boxvault/api_listen_port_encrypted",
      "title": "HTTPS port",
      "reason": "the HTTPS listener is bound at boot"
    }
  ]
}
```

`GET /api/config/restart-status` answers the pending union until `POST /api/config/restart` answers `202 { "message": "Restarting." }` and the process exits for its process manager.

### Upload SSL Certificate

The certificate and the private key are uploaded one file per request through the one upload route, under the admin session or the setup token. The `pointer` part names the property whose value is the path the file is written to.

```bash
curl -X POST https://boxvault.example.com/api/config/app/upload \
  -H "Authorization: Bearer YOUR_SETUP_TOKEN" \
  -F "pointer=/ssl/cert_path" \
  -F "file=@/path/to/fullchain.pem"
```

**Response:**

```json
{
  "path": "/etc/boxvault/ssl/public.crt"
}
```

### Test SMTP Configuration

The body is the mail section's form values under their keys, unsaved and laid over the file, so a test exercises what the administrator is about to save; the message goes to the signed-in administrator's own address. Admin only.

```bash
curl -X POST https://boxvault.example.com/api/mail/test-smtp \
  -H "x-access-token: YOUR_ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "smtp_connect": { "host": "smtp.example.com", "port": 587, "secure": true } }'
```

---

## Error Handling

### Common Error Responses

Every refused request answers RFC 9457 problem details as `application/problem+json`: `type` is a URI under `https://auth.startcloud.com/probs/`, `title` its human summary, `status` the HTTP status, and `errors[]` one entry per failing value with a JSON Pointer into the body as sent. `detail` is for logs; the UI translates from `rule` and `params`.

**Role-Based Access Errors:**

```json
{
  "type": "https://auth.startcloud.com/probs/forbidden",
  "title": "You may not do this.",
  "status": 403,
  "errors": []
}
```

**Authentication Errors:**

```json
{
  "type": "https://auth.startcloud.com/probs/authentication",
  "title": "Sign in to continue.",
  "status": 401,
  "errors": []
}
```

**Upload Errors:**

```json
{
  "type": "https://auth.startcloud.com/probs/payload-too-large",
  "title": "The upload is larger than this server accepts.",
  "status": 413,
  "errors": []
}
```

**Validation Errors:**

```json
{
  "type": "https://auth.startcloud.com/probs/validation",
  "title": "The request did not pass validation.",
  "status": 422,
  "errors": [
    {
      "pointer": "/name",
      "rule": "pattern",
      "params": { "pattern": "slug" },
      "detail": "name must match slug"
    },
    {
      "pointer": "/version_number",
      "rule": "pattern",
      "params": { "pattern": "identifier" },
      "detail": "version_number must match identifier"
    }
  ]
}
```

A taken value answers `409` with type `conflict` and one `unique` entry whose `params.scope` names the scope it collided in; a body that could not be read answers `400` with type `bad-request`; a rate-limited request answers `429` with type `throttled` and a `Retry-After` header.

### HTTP Status Codes

- `200 OK` - Request succeeded
- `201 Created` - Resource created successfully
- `400 Bad Request` - The body could not be read
- `401 Unauthorized` - Missing or invalid authentication
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - A value is already taken in its scope
- `413 Payload Too Large` - Upload larger than `box_max_file_size`
- `422 Unprocessable Content` - A value breaks a rule
- `429 Too Many Requests` - Rate limited, retry after `Retry-After`
- `500 Internal Server Error` - Server error

---

## Complete API Reference

For the complete API reference with all endpoints, parameters, and responses, visit:

- **[Interactive API Documentation](/api/docs/)** - Swagger UI with live testing
- **[API Overview](../../api/)** - High-level API information
- **[Authentication Guide](../authentication/)** - Detailed authentication setup
