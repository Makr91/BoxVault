# BoxVault API Documentation

BoxVault provides a comprehensive REST API for managing boxes, versions, providers, architectures, users, organizations, and more. This document outlines all available endpoints and their usage.

## Table of Contents

- [Authentication](#authentication)
  - [Sign In](#sign-in)
  - [Sign Up](#sign-up)
  - [Refresh Token](#refresh-token)
  - [Verify Email](#verify-email)
  - [Resend Verification Email](#resend-verification-email)
- [Organizations](#organizations)
  - [List Organizations](#list-organizations)
  - [Create Organization](#create-organization)
  - [Get Organization](#get-organization)
  - [Update Organization](#update-organization)
  - [Delete Organization](#delete-organization)
  - [Get Organization Users](#get-organization-users)
  - [Send Invitation](#send-invitation)
  - [List Active Invitations](#list-active-invitations)
  - [Validate Invitation Token](#validate-invitation-token)
  - [Delete Invitation](#delete-invitation)
- [Box Discovery](#box-discovery)
  - [List Public Boxes](#list-public-boxes)
  - [Search Public Boxes](#search-public-boxes)
  - [Get Box Metadata](#get-box-metadata)
  - [Download Box File](#download-box-file)
- [Box Management](#box-management-user-access)
  - [List Organization Boxes](#list-organization-boxes-user)
  - [Create Box](#create-box-user)
  - [Create Box Version](#create-box-version-user)
  - [Update Box](#update-box)
  - [Delete Box](#delete-box)
  - [Delete All Boxes](#delete-all-boxes)
  - [Update Version](#update-version)
  - [List Box Versions](#list-box-versions)
  - [Delete Version](#delete-version)
  - [Delete All Versions](#delete-all-versions)
  - [Create Provider](#create-provider-user)
  - [Update Provider](#update-provider)
  - [List Version Providers](#list-version-providers)
  - [Get Provider](#get-provider)
  - [Delete Provider](#delete-provider)
  - [Delete All Providers](#delete-all-providers)
  - [Create Architecture](#create-architecture-user)
  - [Update Architecture](#update-architecture)
  - [List Provider Architectures](#list-provider-architectures)
  - [Get Architecture](#get-architecture)
  - [Delete Architecture](#delete-architecture)
  - [Delete All Architectures](#delete-all-architectures)
- [File Operations](#file-operations-userservice-account)
  - [Upload Box File](#upload-box-file-chunked-upload)
  - [Download Box File](#download-box-file-multiple-methods)
  - [Get Box Metadata](#get-box-metadata-1)
  - [Get File Info](#get-file-info)
  - [Delete File](#delete-file)
- [Service Account Management](#service-account-management-user)
  - [Create Service Account](#create-service-account-user)
  - [List Service Accounts](#list-service-accounts)
  - [Delete Service Account](#delete-service-account)
- [User & Role Management](#user--role-management-admin)
  - [List All Users](#list-all-users-admin)
  - [Get Role-Specific Boards](#get-role-specific-boards)
  - [Get User Profile](#get-user-profile)
  - [Get User Roles](#get-user-roles)
  - [Get User Organizations](#get-user-organizations)
  - [Check If Only User In Organization](#check-if-only-user-in-organization)
  - [Get Organization User](#get-organization-user)
  - [Update Organization User](#update-organization-user)
  - [Delete User](#delete-user)
  - [Delete Organization User](#delete-organization-user)
  - [Change Password](#change-password)
  - [Change Email](#change-email)
  - [Promote User to Moderator](#promote-user-to-moderator)
  - [Demote Moderator to User](#demote-moderator-to-user)
  - [Suspend User](#suspend-user)
  - [Resume User](#resume-user)
- [Organization Management](#organization-management-admin)
  - [Suspend Organization](#suspend-organization-admin)
  - [Resume Organization](#resume-organization)
- [System Configuration](#system-configuration-admin)
  - [Check Setup Status](#check-setup-status-public)
  - [Verify Setup Token](#verify-setup-token)
  - [Get Setup Configuration](#get-setup-configuration)
  - [Update Setup Configuration](#update-setup-configuration)
  - [Upload SSL Certificate](#upload-ssl-certificate)
  - [Get Gravatar Configuration](#get-gravatar-configuration)
  - [Get Configuration](#get-configuration)
  - [Update Configuration](#update-configuration)
  - [Test SMTP](#test-smtp)
- [Error Responses](#error-responses)
  - [Role-Based Access Errors](#role-based-access-errors)
  - [Authentication Errors](#authentication-errors)
  - [Upload Errors](#upload-errors)
  - [Validation Errors](#validation-errors)
  - [Resource Errors](#resource-errors)
- [HTTP Status Codes](#http-status-codes)

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

### Verify Email
```bash
curl -X GET https://boxvault.example.com/api/auth/verify-mail/VERIFICATION_TOKEN
```

### Resend Verification Email
```bash
curl -X POST https://boxvault.example.com/api/auth/resend-verification \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

## Organizations

### List Organizations
```bash
curl -X GET https://boxvault.example.com/api/organization \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

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

### Get Organization
```bash
curl -X GET https://boxvault.example.com/api/organization/myorg \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "id": 1,
  "name": "myorg",
  "description": "My Organization",
  "email": "org@example.com",
  "suspended": false,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### Update Organization
```bash
curl -X PUT https://boxvault.example.com/api/organization/myorg \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "myorg",
    "description": "Updated Organization Description",
    "email": "org@example.com"
  }'
```

**Response:**
```json
{
  "id": 1,
  "name": "myorg",
  "description": "Updated Organization Description",
  "email": "org@example.com",
  "suspended": false,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### Delete Organization
```bash
curl -X DELETE https://boxvault.example.com/api/organization/myorg \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "message": "Organization deleted successfully!"
}
```

### Get Organization Users
```bash
curl -X GET https://boxvault.example.com/api/organization/myorg/users \
  -H "x-access-token: YOUR_JWT_TOKEN"
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

### List Active Invitations
```bash
curl -X GET https://boxvault.example.com/api/invitations/active/myorg \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
[
  {
    "id": 13,
    "email": "test@example.com",
    "token": "761ae0028a11ee75a02f16f702b9aa63312acfe0",
    "expires": "2024-12-29T10:25:34.000Z",
    "accepted": false,
    "expired": false,
    "createdAt": "2024-12-28T10:25:34.000Z"
  }
]
```

### Validate Invitation Token
```bash
curl -X GET https://boxvault.example.com/api/auth/validate-invitation/INVITATION_TOKEN
```

**Response:**
```json
{
  "valid": true,
  "organizationName": "myorg",
  "email": "newuser@example.com"
}
```

### Delete Invitation
```bash
curl -X DELETE https://boxvault.example.com/api/invitations/INVITATION_ID \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "message": "Invitation deleted successfully"
}
```

## Box Discovery

### List Public Boxes
```bash
# No authentication required
curl https://boxvault.example.com/api/discover
```

### Search Public Boxes
```bash
# No authentication required
curl https://boxvault.example.com/api/discover/debian
```

### Get Box Metadata
```bash
# No authentication required
curl https://boxvault.example.com/api/organization/myorg/box/debian12/metadata
```

### Download Box File
```bash
# No authentication required for public boxes
curl -O "https://boxvault.example.com/myorg/boxes/debian12/versions/1.0.0/providers/virtualbox/amd64/vagrant.box"

# Or using Vagrant CLI
vagrant box add "boxvault.example.com/myorg/debian12"

# For private boxes, get download URL first
curl -X POST "https://boxvault.example.com/api/organization/myorg/box/debian12/version/1.0.0/provider/virtualbox/architecture/amd64/file/get-download-link" \
  -H "x-access-token: YOUR_JWT_TOKEN"
```


## Box Management (User Access)

### List Organization Boxes (User)
```bash
curl -X GET https://boxvault.example.com/api/organization/myorg/box \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

### Create Box (User)
```bash
curl -X POST https://boxvault.example.com/api/organization/myorg/box \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "debian12",
    "description": "Debian 12 Server",
    "isPrivate": false
  }'
```

**Response:**
```json
{
  "id": 7,
  "name": "debian12",
  "description": "Debian 12 Server",
  "published": false,
  "isPublic": false,
  "userId": 1,
  "createdAt": "2024-12-28T10:21:13.924Z",
  "updatedAt": "2024-12-28T10:21:13.924Z"
}
```

### Create Box Version (User)
```bash
curl -X POST https://boxvault.example.com/api/organization/myorg/box/debian12/version \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "versionNumber": "1.0.0",
    "description": "Initial release"
  }'
```

**Response:**
```json
{
  "id": 1,
  "versionNumber": "1.0.0",
  "description": "Initial release",
  "boxId": 1,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### Update Box
```bash
curl -X PUT https://boxvault.example.com/api/organization/myorg/box/debian12 \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "debian12",
    "description": "Updated description",
    "isPrivate": false
  }'
```

**Response:**
```json
{
  "id": 7,
  "name": "debian12",
  "description": "Updated description",
  "published": false,
  "isPublic": false,
  "userId": 1,
  "createdAt": "2024-12-28T10:21:13.000Z",
  "updatedAt": "2024-12-28T10:22:08.301Z"
}
```

### Delete Box
```bash
curl -X DELETE https://boxvault.example.com/api/organization/myorg/box/debian12 \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "message": "Box deleted successfully!"
}
```

### Delete All Boxes
```bash
curl -X DELETE https://boxvault.example.com/api/organization/myorg/box \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "message": "All boxes deleted successfully!"
}
```

### Update Version
```bash
curl -X PUT https://boxvault.example.com/api/organization/myorg/box/debian12/version/1.0.0 \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "versionNumber": "1.0.0",
    "description": "Updated release notes"
  }'
```

**Response:**
```json
{
  "id": 1,
  "versionNumber": "1.0.0",
  "description": "Updated release notes",
  "boxId": 1,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### List Box Versions
```bash
curl -X GET https://boxvault.example.com/api/organization/myorg/box/debian12/version \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
[
  {
    "id": 1,
    "versionNumber": "1.0.0",
    "description": "Initial release",
    "boxId": 1,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

### Delete Version
```bash
curl -X DELETE https://boxvault.example.com/api/organization/myorg/box/debian12/version/1.0.0 \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "message": "Version deleted successfully!"
}
```

### Delete All Versions
```bash
curl -X DELETE https://boxvault.example.com/api/organization/myorg/box/debian12/version \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "message": "All versions deleted successfully!"
}
```

### Create Provider (User)
```bash
curl -X POST https://boxvault.example.com/api/organization/myorg/box/debian12/version/1.0.0/provider \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "virtualbox",
    "description": "VirtualBox provider"
  }'
```

**Response:**
```json
{
  "id": 25,
  "name": "virtualbox",
  "description": "VirtualBox provider",
  "versionId": 8,
  "createdAt": "2024-12-28T10:21:34.233Z",
  "updatedAt": "2024-12-28T10:21:34.233Z"
}
```

### Update Provider
```bash
curl -X PUT https://boxvault.example.com/api/organization/myorg/box/debian12/version/1.0.0/provider/virtualbox \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "virtualbox",
    "description": "Updated VirtualBox provider description"
  }'
```

**Response:**
```json
{
  "id": 25,
  "name": "virtualbox",
  "description": "Updated VirtualBox provider description",
  "versionId": 8,
  "createdAt": "2024-12-28T10:21:34.000Z",
  "updatedAt": "2024-12-28T10:22:32.000Z"
}
```

### List Version Providers
```bash
curl -X GET https://boxvault.example.com/api/organization/myorg/box/debian12/version/1.0.0/provider \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
[
  {
    "id": 25,
    "name": "virtualbox",
    "description": "VirtualBox provider",
    "versionId": 8,
    "createdAt": "2024-12-28T10:21:34.233Z",
    "updatedAt": "2024-12-28T10:21:34.233Z"
  }
]
```

### Get Provider
```bash
curl -X GET https://boxvault.example.com/api/organization/myorg/box/debian12/version/1.0.0/provider/virtualbox \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "id": 25,
  "name": "virtualbox",
  "description": "VirtualBox provider",
  "versionId": 8,
  "createdAt": "2024-12-28T10:21:34.233Z",
  "updatedAt": "2024-12-28T10:21:34.233Z"
}
```

### Delete Provider
```bash
curl -X DELETE https://boxvault.example.com/api/organization/myorg/box/debian12/version/1.0.0/provider/virtualbox \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "message": "Provider deleted successfully!"
}
```

### Delete All Providers
```bash
curl -X DELETE https://boxvault.example.com/api/organization/myorg/box/debian12/version/1.0.0/provider \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "message": "All providers deleted successfully!"
}
```

### Create Architecture (User)
```bash
curl -X POST https://boxvault.example.com/api/organization/myorg/box/debian12/version/1.0.0/provider/virtualbox/architecture \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "amd64",
    "defaultBox": true
  }'
```

**Response:**
```json
{
  "id": 48,
  "name": "amd64",
  "defaultBox": true,
  "providerId": 25,
  "createdAt": "2024-12-28T10:21:43.344Z",
  "updatedAt": "2024-12-28T10:21:43.344Z"
}
```

### Update Architecture
```bash
curl -X PUT https://boxvault.example.com/api/organization/myorg/box/debian12/version/1.0.0/provider/virtualbox/architecture/amd64 \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "amd64",
    "defaultBox": false
  }'
```

**Response:**
```json
{
  "id": 48,
  "name": "amd64",
  "defaultBox": false,
  "providerId": 25,
  "createdAt": "2024-12-28T10:21:43.000Z",
  "updatedAt": "2024-12-28T10:22:40.000Z"
}
```

### List Provider Architectures
```bash
curl -X GET https://boxvault.example.com/api/organization/myorg/box/debian12/version/1.0.0/provider/virtualbox/architecture \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
[
  {
    "id": 48,
    "name": "amd64",
    "defaultBox": true,
    "providerId": 25,
    "createdAt": "2024-12-28T10:21:43.344Z",
    "updatedAt": "2024-12-28T10:21:43.344Z"
  }
]
```

### Get Architecture
```bash
curl -X GET https://boxvault.example.com/api/organization/myorg/box/debian12/version/1.0.0/provider/virtualbox/architecture/amd64 \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "id": 48,
  "name": "amd64",
  "defaultBox": true,
  "providerId": 25,
  "createdAt": "2024-12-28T10:21:43.344Z",
  "updatedAt": "2024-12-28T10:21:43.344Z"
}
```

### Delete Architecture
```bash
curl -X DELETE https://boxvault.example.com/api/organization/myorg/box/debian12/version/1.0.0/provider/virtualbox/architecture/amd64 \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "message": "Architecture deleted successfully!"
}
```

### Delete All Architectures
```bash
curl -X DELETE https://boxvault.example.com/api/organization/myorg/box/debian12/version/1.0.0/provider/virtualbox/architecture \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "message": "All architectures deleted successfully!"
}
```

## File Operations (User/Service Account)

### Upload Box File (Direct Upload)

Files are uploaded directly to the server using a single request. To show upload progress, use curl's progress bar with response redirection:

```bash
# Upload with progress bar
curl --progress-bar -o upload_response.txt \
  -X POST "https://boxvault.example.com/api/organization/myorg/box/debian12/version/1.0.0/provider/virtualbox/architecture/amd64/file/upload" \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/octet-stream" \
  -H "X-File-Name: vagrant.box" \
  --upload-file box-file.box
```

The `-o upload_response.txt` option redirects the server response to a file, allowing the progress bar to be displayed during upload. The response will contain:

```json
{
  "message": "File upload completed",
  "details": {
    "isComplete": true,
    "status": "complete",
    "fileSize": 1508591037
  }
}
```

**Note:** The progress bar shows real-time upload progress as a percentage. The server response is saved to the specified output file (`upload_response.txt` in this example).

### Download Box File (Multiple Methods)

BoxVault provides three ways to download box files:

1. Direct browser download:
```bash
curl -O "https://boxvault.example.com/myorg/boxes/debian12/versions/1.0.0/providers/virtualbox/amd64/vagrant.box"
```

2. Using Vagrant CLI:
```bash
vagrant box add "boxvault.example.com/myorg/debian12"
```

3. Using download link:
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
  "versions": [{
    "version": "1.0.0",
    "providers": [{
      "name": "virtualbox",
      "url": "https://boxvault.example.com/myorg/boxes/debian12/versions/1.0.0/providers/virtualbox/amd64/vagrant.box",
      "checksum_type": "sha256",
      "checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "fileSize": "1508591037"  // Size in bytes, convert to GB using fileSize/(1024^3)
    }]
  }]
}
```

### Get File Info
```bash
curl -X GET "https://boxvault.example.com/api/organization/myorg/box/debian12/version/1.0.0/provider/virtualbox/architecture/amd64/file/info" \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "fileName": "vagrant.box",
  "downloadUrl": "https://boxvault.example.com/api/organization/myorg/box/debian12/version/1.0.0/provider/virtualbox/architecture/amd64/file/download?token=...",
  "downloadCount": 5,
  "checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "checksumType": "SHA256",
  "fileSize": "1508591037"  // Size in bytes, convert to GB using fileSize/(1024^3)
}
```

### Delete File
```bash
curl -X DELETE "https://boxvault.example.com/api/organization/myorg/box/debian12/version/1.0.0/provider/virtualbox/architecture/amd64/file/delete" \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "message": "File deleted successfully!"
}
```

```json
{
  "name": "debian12",
  "description": "Debian 12 Server",
  "versions": [{
    "version": "1.0.0",
    "providers": [{
      "name": "virtualbox",
      "url": "https://boxvault.example.com/myorg/boxes/debian12/versions/1.0.0/providers/virtualbox/amd64/vagrant.box",
      "checksum_type": "sha256",
      "checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "fileSize": "1508591037"  // Size in bytes, convert to GB using fileSize/(1024^3)
    }]
  }]
}
```

**Note:** File sizes are returned in bytes. To convert to GB, divide by 1024^3 (1073741824 bytes = 1 GB). For example:
```javascript
const bytesToGB = (bytes) => (bytes / 1024 / 1024 / 1024).toFixed(2);
console.log(bytesToGB(1508591037)); // Outputs: "1.40"
```

## Service Account Management (User)

### Create Service Account (Admin)
```bash
curl -X POST https://boxvault.example.com/api/service-accounts \
  -H "x-access-token: YOUR_ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "CI/CD Service Account",
    "expirationDays": 365  # Number of days until expiration
  }'
```

**Response:**
```json
{
  "id": 1,
  "username": "mark-7fb6603d",  # Auto-generated username
  "token": "319b8554ee85c3df139dbbb98169b64a4b50f338968bdc145fd851eb68eff0f0",  # Use this for authentication
  "expiresAt": "2025-12-28T10:51:02.000Z",
  "description": "CI/CD Service Account",
  "createdAt": "2024-12-28T10:51:02.000Z",
  "updatedAt": "2024-12-28T10:51:02.000Z",
  "userId": 1
}
```

### Authenticate Service Account
To use a service account, you must first authenticate to get a JWT token:

```bash
curl -X POST https://boxvault.example.com/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "username": "mark-7fb6603d",  # Service account username
    "password": "319b8554ee85c3df139dbbb98169b64a4b50f338968bdc145fd851eb68eff0f0",  # Service account token
    "stayLoggedIn": true
  }'
```

**Response:**
```json
{
  "id": 1,
  "username": "mark-7fb6603d",
  "roles": ["ROLE_SERVICE_ACCOUNT"],
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",  # Use this JWT token for API operations
  "isServiceAccount": true
}
```

After authentication, use the returned JWT token in the `x-access-token` header for all API operations:

```bash
# Example: Creating a box using service account
curl -X POST https://boxvault.example.com/api/organization/myorg/box \
  -H "x-access-token: eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-box",
    "description": "Test Box",
    "isPrivate": true
  }'
```

### List Service Accounts
```bash
curl -X GET https://boxvault.example.com/api/service-accounts \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

### Delete Service Account
```bash
curl -X DELETE https://boxvault.example.com/api/service-accounts/ACCOUNT_ID \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "message": "Service account deleted successfully!"
}
```

## User & Role Management (Admin)

### List All Users (Admin)
```bash
curl -X GET https://boxvault.example.com/api/organizations-with-users \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

### Get Role-Specific Boards
```bash
# Public board
curl -X GET https://boxvault.example.com/api/users/all

# User board
curl -X GET https://boxvault.example.com/api/users/user \
  -H "x-access-token: YOUR_JWT_TOKEN"

# Admin board
curl -X GET https://boxvault.example.com/api/users/admin \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

### Get User Profile
```bash
curl -X GET https://boxvault.example.com/api/user \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

### Get User Roles
```bash
curl -X GET https://boxvault.example.com/api/users/roles \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "roles": ["user", "admin", "moderator"]
}
```

### Get User Organizations
```bash
curl -X GET https://boxvault.example.com/api/organizations \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

### Check If Only User In Organization
```bash
curl -X GET https://boxvault.example.com/api/organizations/myorg/only-user \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "isOnlyUser": true
}
```

### Get Organization User
```bash
curl -X GET https://boxvault.example.com/api/organization/myorg/users/username \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

### Update Organization User
```bash
curl -X PUT https://boxvault.example.com/api/organization/myorg/users/username \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newemail@example.com",
    "roles": ["user", "moderator"]
  }'
```

### Delete User
```bash
curl -X DELETE https://boxvault.example.com/api/users/USER_ID \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "message": "User deleted successfully!"
}
```

### Delete Organization User
```bash
curl -X DELETE https://boxvault.example.com/api/organization/myorg/users/username \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "message": "User removed from organization successfully!"
}
```

### Change Password
```bash
curl -X PUT https://boxvault.example.com/api/users/USER_ID/change-password \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "old-password",
    "newPassword": "new-password"
  }'
```

### Change Email
```bash
curl -X PUT https://boxvault.example.com/api/users/USER_ID/change-email \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newemail@example.com"
  }'
```

**Response:**
```json
{
  "message": "Email changed successfully!"
}
```

### Promote User to Moderator
```bash
curl -X PUT https://boxvault.example.com/api/users/USER_ID/promote \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "message": "Promoted to moderator successfully!"
}
```

### Demote Moderator to User
```bash
curl -X PUT https://boxvault.example.com/api/users/USER_ID/demote \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "message": "Demoted to user successfully!"
}
```

### Suspend User
```bash
curl -X PUT https://boxvault.example.com/api/users/USER_ID/suspend \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "message": "User suspended successfully."
}
```

### Resume User
```bash
curl -X PUT https://boxvault.example.com/api/users/USER_ID/resume \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "message": "User resumed successfully!"
}
```

## Organization Management (Admin)

### Suspend Organization (Admin)
```bash
curl -X PUT https://boxvault.example.com/api/organization/myorg/suspend \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "message": "Organization suspended successfully!"
}
```

### Resume Organization
```bash
curl -X PUT https://boxvault.example.com/api/organization/myorg/resume \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "message": "Organization resumed successfully!"
}
```

## System Configuration (Admin)

### Check Setup Status (Public)
```bash
curl -X GET https://boxvault.example.com/api/setup/status
```

**Response:**
```json
{
  "setupComplete": true
}
```

### Verify Setup Token
```bash
curl -X POST https://boxvault.example.com/api/setup/verify-token \
  -H "Content-Type: application/json" \
  -d '{
    "token": "setup-token"
  }'
```

### Get Setup Configuration
```bash
curl -X GET https://boxvault.example.com/api/setup
```

### Update Setup Configuration
```bash
curl -X PUT https://boxvault.example.com/api/setup \
  -H "Content-Type: application/json" \
  -d '{
    "boxvault": {
      "origin": {
        "value": "https://boxvault.example.com"
      }
    }
  }'
```

### Upload SSL Certificate
```bash
curl -X POST https://boxvault.example.com/api/setup/upload-ssl \
  -H "Content-Type: multipart/form-data" \
  -F "cert=@/path/to/cert.pem" \
  -F "key=@/path/to/key.pem"
```

**Response:**
```json
{
  "message": "SSL certificates uploaded successfully"
}
```

### Get Gravatar Configuration
```bash
curl -X GET https://boxvault.example.com/api/config/gravatar
```

**Response:**
```json
{
  "enabled": true,
  "default": "mp",
  "rating": "g"
}
```

### Get Configuration
```bash
curl -X GET https://boxvault.example.com/api/config/app \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "boxvault": {
    "origin": {
      "type": "url",
      "value": "https://boxvault.example.com",
      "description": "The origin URL for BoxVault",
      "required": true
    },
    "api_url": {
      "type": "url",
      "value": "https://boxvault.example.com/api",
      "description": "The API URL for BoxVault",
      "required": true
    },
    "api_listen_port_unencrypted": {
      "type": "integer",
      "value": 5000,
      "description": "The Port that BoxVault API listens on for HTTP (may not be the proxied port)",
      "required": true
    },
    "api_listen_port_encrypted": {
      "type": "integer",
      "value": 443,
      "description": "The Port that BoxVault API listens on for HTTPS (may not be the proxied port)",
      "required": true
    },
    "box_storage_directory": {
      "type": "string",
      "value": "/local/boxvault/data/",
      "description": "The Directory on the OS in which the boxes are stored.",
      "required": true
    },
    "box_max_file_size": {
      "type": "integer",
      "value": "100",
      "description": "The file size in GBs as to how large a upload box can be.",
      "required": true
    }
  },
  "ssl": {
    "cert_path": {
      "type": "string",
      "value": "boxvault.example.com.pem",
      "description": "Path to the SSL certificate file",
      "required": false,
      "upload": true
    },
    "key_path": {
      "type": "string",
      "value": "boxvault.example.com.key",
      "description": "Path to the SSL private key file",
      "required": false,
      "upload": true
    }
  }
}
```

### Update Configuration
```bash
curl -X PUT https://boxvault.example.com/api/config/app \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "boxvault": {
      "box_storage_directory": {
        "value": "/local/boxvault/data"
      },
      "box_max_file_size": {
        "value": 100
      }
    }
  }'
```

### Test SMTP
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

**Error Response:**
```json
{
  "message": "Error sending test email",
  "error": "No recipients defined",
  "stack": "Error: No recipients defined..."
}
```

## Error Responses

All endpoints may return the following error responses:

### Role-Based Access Errors
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

```json
{
  "error": "ORGANIZATION_ACCESS_DENIED",
  "message": "User does not belong to organization",
  "details": {
    "organization": "myorg",
    "userOrganization": "otherorg"
  }
}
```

### Authentication Errors
```json
{
  "error": "TOKEN_EXPIRED",
  "message": "JWT token has expired",
  "details": {
    "expiredAt": "2024-01-01T00:00:00Z"
  }
}
```

### Upload Errors
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

```json
{
  "error": "UPLOAD_SEQUENCE_ERROR",
  "message": "Invalid chunk sequence",
  "details": {
    "expectedChunk": 5,
    "receivedChunk": 7,
    "totalChunks": 10
  }
}
```

```json
{
  "error": "ASSEMBLY_FAILED",
  "message": "Failed to assemble file chunks",
  "details": {
    "missingChunks": [3, 7],
    "corruptedChunks": [5],
    "totalChunks": 10
  }
}
```

### Validation Errors
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

### Resource Errors
```json
{
  "error": "RESOURCE_NOT_FOUND",
  "message": "Box not found",
  "details": {
    "organization": "myorg",
    "box": "debian12"
  }
}
```

## HTTP Status Codes

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
