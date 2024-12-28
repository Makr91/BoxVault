# BoxVault API Documentation

BoxVault provides a comprehensive REST API for managing boxes, versions, providers, architectures, users, organizations, and more. This document outlines all available endpoints and their usage.

## Authentication

All authenticated endpoints require a JWT token in the `x-access-token` header:

```
x-access-token: your-jwt-token
```

## Vagrant Box Download

### Download Box
```http
GET /:organization/boxes/:name/versions/:version/providers/:provider/:architecture/vagrant.box
```
Direct download endpoint for Vagrant boxes. This endpoint is compatible with the Vagrant CLI.

**Example:**
```
GET /STARTcloud/boxes/debian12-server/versions/0.0.9/providers/virtualbox/amd64/vagrant.box
```

### Box Metadata
```http
GET /api/organization/:organization/box/:name/metadata
```
Get Vagrant-compatible metadata for a box. This endpoint is used by the Vagrant CLI to discover box versions and providers.

**Example Response:**
```json
{
  "name": "debian12-server",
  "description": "Debian 12 Server",
  "versions": [{
    "version": "0.0.9",
    "providers": [{
      "name": "virtualbox",
      "url": "https://boxvault.example.com/STARTcloud/boxes/debian12-server/versions/0.0.9/providers/virtualbox/amd64/vagrant.box",
      "checksum_type": "sha256",
      "checksum": "a1b2c3..."
    }]
  }]
}
```

## Authentication & User Management

### Sign Up
```http
POST /api/auth/signup
```
Register a new user.

**Parameters:**
- `username` (string, required) - Username
- `email` (string, required) - Email address
- `password` (string, required) - Password
- `organization` (string, required) - Organization name

### Sign In
```http
POST /api/auth/signin
```
Authenticate and receive JWT token.

**Parameters:**
- `username` (string, required)
- `password` (string, required)

**Response:**
```json
{
  "id": "user_id",
  "username": "username",
  "email": "email",
  "accessToken": "jwt_token",
  "roles": ["user", "admin"]
}
```

### Verify Email
```http
GET /api/auth/verify-mail/:token
```
Verify user's email address.

### Invitation Management
```http
POST /api/auth/invite
```
Send an invitation to join organization.

**Required Role:** Moderator or Admin

```http
GET /api/auth/validate-invitation/:token
```
Validate an invitation token.

```http
GET /api/invitations/active/:organizationName
```
Get active invitations for an organization.

**Required Role:** Moderator

```http
DELETE /api/invitations/:invitationId
```
Delete an invitation.

**Required Role:** Moderator or Admin

## Configuration

### Get Gravatar Config
```http
GET /api/config/gravatar
```
Get Gravatar configuration settings.

**Response:**
```json
{
  "enabled": true,
  "default": "mp",
  "size": 200
}
```

### Get System Config
```http
GET /api/config/:configName
```
Get specific system configuration.

**Required Role:** Admin

**Valid Config Names:**
- `app` - Application settings
- `sql` - Database settings
- `mail` - Mail server settings
- `ssl` - SSL certificate settings

**Example Response:**
```json
{
  "boxvault": {
    "box_storage_directory": {
      "value": "/local/boxvault/data"
    },
    "box_max_file_size": {
      "value": 100
    }
  }
}
```

### Update System Config
```http
PUT /api/config/:configName
```
Update system configuration.

**Required Role:** Admin

**Parameters:**
- Configuration object specific to the config type

## Organizations

### List Organizations
```http
GET /api/organization
```
List all organizations accessible to the authenticated user.

**Required Role:** User

### Get Organization Details
```http
GET /api/organization/:organizationName
```
Get details of a specific organization.

**Required Role:** User

### Create Organization
```http
POST /api/organization
```
Create a new organization.

**Required Role:** User

**Parameters:**
- `name` (string, required) - Organization name
- `description` (string) - Organization description
- `email` (string, required) - Organization email

### Update Organization
```http
PUT /api/organization/:organizationName
```
Update organization details.

**Required Role:** Moderator or Admin

**Parameters:**
- `description` (string) - New description
- `email` (string) - New email

### Organization Management
```http
PUT /api/organization/:organizationName/suspend
```
Suspend an organization.

**Required Role:** Admin

```http
PUT /api/organization/:organizationName/resume
```
Resume a suspended organization.

**Required Role:** Admin

```http
DELETE /api/organization/:organizationName
```
Delete an organization.

**Required Role:** Admin

### Organization Users
```http
GET /api/organization/:organizationName/users
```
List users in an organization.

**Required Role:** User

## Boxes

### List Boxes
```http
GET /api/organization/:organization/box
```
List all boxes in an organization.

### Discover Boxes
```http
GET /api/discover
GET /api/discover/:name
```
List public boxes, optionally filtered by name.

### Get Box Details
```http
GET /api/organization/:organization/box/:name
GET /api/organization/:organization/box/:name/metadata
```
Get box details and metadata.

### Create Box
```http
POST /api/organization/:organization/box
```
Create a new box.

**Required Role:** User or Service Account

**Parameters:**
- `name` (string, required) - Box name
- `description` (string) - Box description
- `isPrivate` (boolean) - Privacy setting

### Update Box
```http
PUT /api/organization/:organization/box/:name
```
Update box details.

**Required Role:** User or Service Account

### Delete Box
```http
DELETE /api/organization/:organization/box/:name
```
Delete a box and all associated versions.

**Required Role:** User or Service Account

## Versions

### List Versions
```http
GET /api/organization/:organization/box/:boxId/version
```
List all versions of a box.

### Get Version
```http
GET /api/organization/:organization/box/:boxId/version/:versionNumber
```
Get version details.

### Create Version
```http
POST /api/organization/:organization/box/:boxId/version
```
Create a new version.

**Required Role:** User or Service Account

**Parameters:**
- `version` (string, required) - Version number
- `description` (string) - Version description

### Update Version
```http
PUT /api/organization/:organization/box/:boxId/version/:versionNumber
```
Update version details.

**Required Role:** User or Service Account

### Delete Version
```http
DELETE /api/organization/:organization/box/:boxId/version/:versionNumber
```
Delete a version.

**Required Role:** User or Service Account

## Providers

### List Providers
```http
GET /api/organization/:organization/box/:boxId/version/:versionNumber/provider
```
List all providers for a version.

### Get Provider
```http
GET /api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName
```
Get provider details.

### Create Provider
```http
POST /api/organization/:organization/box/:boxId/version/:versionNumber/provider
```
Create a new provider.

**Required Role:** User or Service Account

**Parameters:**
- `name` (string, required) - Provider name
- `description` (string) - Provider description

### Update Provider
```http
PUT /api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName
```
Update provider details.

**Required Role:** User or Service Account

### Delete Provider
```http
DELETE /api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName
```
Delete a provider.

**Required Role:** User or Service Account

## Architectures

### List Architectures
```http
GET /api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture
```
List all architectures for a provider.

### Get Architecture
```http
GET /api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName
```
Get architecture details.

### Create Architecture
```http
POST /api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture
```
Create a new architecture.

**Required Role:** User or Service Account

**Parameters:**
- `name` (string, required) - Architecture name
- `description` (string) - Architecture description
- `defaultBox` (boolean) - Whether this is the default architecture

### Update Architecture
```http
PUT /api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName
```
Update architecture details.

**Required Role:** User or Service Account

### Delete Architecture
```http
DELETE /api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName
```
Delete an architecture.

**Required Role:** User or Service Account

## File Operations

### Upload File
```http
POST /api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/upload
```
Upload a box file (supports chunked upload).

**Required Role:** User or Service Account

**Headers:**
- `Content-Range` - Byte range being uploaded
- `x-file-id` - Unique ID for the upload session
- `x-chunk-index` - Current chunk index
- `x-total-chunks` - Total number of chunks

**Form Data:**
- `file` (file, required) - The chunk data
- `fileId` (string, required) - Upload session ID
- `chunkIndex` (number, required) - Current chunk index
- `totalChunks` (number, required) - Total number of chunks
- `checksum` (string) - File checksum
- `checksumType` (string) - Type of checksum

### Update File
```http
PUT /api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/upload
```
Update an existing box file.

**Required Role:** User or Service Account

### Get File Info
```http
GET /api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/info
```
Get information about a box file.

### Download File
```http
GET /api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/download
```
Download a box file.

### Get Download Link
```http
POST /api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/get-download-link
```
Get a download URL for a box file.

### Delete File
```http
DELETE /api/organization/:organization/box/:boxId/version/:versionNumber/provider/:providerName/architecture/:architectureName/file/delete
```
Delete a box file.

**Required Role:** User or Service Account

## Service Accounts

### Create Service Account
```http
POST /api/service-accounts
```
Create a new service account.

**Required Role:** User

### List Service Accounts
```http
GET /api/service-accounts
```
List all service accounts.

**Required Role:** User

### Delete Service Account
```http
DELETE /api/service-accounts/:id
```
Delete a service account.

**Required Role:** User

## User Management

### Get User Profile
```http
GET /api/user
```
Get current user's profile.

**Required Role:** User

### Change Password
```http
PUT /api/users/:userId/change-password
```
Change user's password.

**Required Role:** User

### Change Email
```http
PUT /api/users/:userId/change-email
```
Change user's email address.

**Required Role:** User

### Role Management
```http
PUT /api/users/:userId/promote
```
Promote user to moderator.

**Required Role:** User

```http
PUT /api/users/:userId/demote
```
Demote moderator to user.

**Required Role:** Moderator or Admin

### User Status Management
```http
PUT /api/users/:userId/suspend
```
Suspend a user.

**Required Role:** Admin

```http
PUT /api/users/:userId/resume
```
Resume a suspended user.

**Required Role:** Admin

## Setup & Configuration

### Setup Status
```http
GET /api/setup/status
```
Check if system setup is complete.

### Verify Setup Token
```http
POST /api/setup/verify-token
```
Verify setup token.

### Get Configuration
```http
GET /api/setup
```
Get system configuration.

### Update Configuration
```http
PUT /api/setup
```
Update system configuration.

### Upload SSL Certificate
```http
POST /api/setup/upload-ssl
```
Upload SSL certificate files.

## Mail Configuration

### Test SMTP
```http
POST /api/mail/test-smtp
```
Test SMTP configuration.

**Required Role:** Admin

### Resend Verification
```http
POST /api/auth/resend-verification
```
Resend verification email.

**Required Role:** User

## Response Examples

### Success Response
```json
{
  "message": "Operation completed successfully",
  "data": {
    // Operation-specific data
  }
}
```

### Validation Error
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Validation failed",
  "details": {
    "field": "name",
    "error": "Name must be alphanumeric"
  }
}
```

### Upload Progress Response
```json
{
  "message": "Chunk uploaded successfully",
  "details": {
    "chunkIndex": 1,
    "uploadedChunks": 2,
    "totalChunks": 10,
    "isComplete": false,
    "status": "in_progress",
    "remainingChunks": 8
  }
}
```

### Upload Completion Response
```json
{
  "message": "Upload completed successfully",
  "details": {
    "chunkIndex": 10,
    "uploadedChunks": 10,
    "totalChunks": 10,
    "isComplete": true,
    "status": "complete",
    "fileSize": 1073741824,
    "duration": 1200
  }
}
```

## Error Responses

All endpoints may return the following error responses:

- `400 Bad Request` - Invalid parameters
- `401 Unauthorized` - Missing or invalid authentication
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `408 Request Timeout` - Upload timeout
- `409 Conflict` - Resource already exists
- `413 Payload Too Large` - Upload chunk too large
- `500 Internal Server Error` - Server error
- `507 Insufficient Storage` - Not enough storage space

### Common Error Codes

#### Authentication Errors
- `TOKEN_EXPIRED` - JWT token has expired
- `INVALID_TOKEN` - Invalid JWT token
- `MISSING_TOKEN` - No JWT token provided
- `UNAUTHORIZED` - User not authorized for this operation

#### Resource Errors
- `RESOURCE_NOT_FOUND` - Requested resource does not exist
- `RESOURCE_EXISTS` - Resource already exists
- `RESOURCE_LOCKED` - Resource is locked or in use

#### Upload Errors
- `CHUNK_TOO_LARGE` - Upload chunk exceeds size limit
- `INVALID_CHUNK` - Invalid chunk data or metadata
- `UPLOAD_INCOMPLETE` - Upload did not complete successfully
- `CHECKSUM_MISMATCH` - File checksum verification failed
- `STORAGE_FULL` - Insufficient storage space

#### Validation Errors
- `INVALID_NAME` - Invalid resource name
- `INVALID_VERSION` - Invalid version format
- `INVALID_PROVIDER` - Invalid provider name
- `INVALID_ARCHITECTURE` - Invalid architecture name

Error responses include detailed information:
```json
{
  "error": "ERROR_CODE",
  "message": "Human readable error message",
  "details": {
    "code": "specific_error_code",
    "field": "field_name",
    "constraint": "constraint_violated",
    "provided": "provided_value",
    "expected": "expected_format",
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
