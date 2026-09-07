---
title: API Reference
layout: default
nav_order: 2
has_children: false
permalink: /api/
---

## API Reference

{: .no_toc }

The BoxVault API provides RESTful endpoints for user management, organization control, and box repository management. This API handles authentication, authorization, and box management for the STARTcloud UI that BoxVault serves.

## Table of contents

{: .no_toc .text-delta }

1. TOC
   {:toc}

---

## Authentication

A BoxVault session JWT travels in the `x-access-token` header:

```http
x-access-token: <jwt_token>
```

A raw service-account key or, while `auth.resource_server.enabled` is on, an access token of a configured identity provider travels in the `Authorization` header instead (`Bearer`, or `DPoP` with a proof for a key-bound token). The credentials of a request are resolved in that order: session JWT, identity-provider token, raw service-account key.

Public routes answer without a token: `GET /api/status`, `GET /api/rules`, `GET /api/health`, `GET /api/discover`, and every read route guarded by `sessionAuth` (the organization, box, metadata, artwork and file-info routes), which answers public items to an anonymous caller and private ones to a member.

See the [Authentication Guide](../guides/authentication/) for detailed setup instructions.

## Base URL

The API is served from your BoxVault server on `boxvault.api_listen_port_encrypted` and `boxvault.api_listen_port_unencrypted` of `app.config.yaml`, 443 and 80 in the package:

- **HTTPS (Recommended)**: `https://your-server`
- **HTTP**: `http://your-server`, redirecting to HTTPS while a certificate is configured

## OpenAPI Specification

The BoxVault API is fully documented using OpenAPI 3.0 specification.

### Interactive Documentation

- **[Live API Reference](swagger-ui.html)** - Complete interactive API documentation with examples and testing capabilities
- **[Download OpenAPI Spec](openapi.json)** - Raw OpenAPI specification for tools and integrations

### API Categories

The BoxVault API is organized into the following categories:

#### Authentication & Authorization

- User registration and login
- JWT token management
- Session management
- Password reset and recovery

#### User Management

- User profile management
- User preferences and settings
- Account administration
- Role-based access control

#### Organization Management

- Organization creation and configuration
- Multi-tenant organization support (users can belong to multiple organizations)
- User-organization relationships with role-based permissions
- Invitation management
- Box creation in any organization where user is a member

#### Box Management

- Vagrant box creation and management
- Box versioning and provider support
- Architecture-specific builds
- Box metadata and descriptions

#### File Operations

- Secure file upload and download
- Range request support for large files
- File integrity verification
- Storage management

---

## Rate Limiting

Every request passes a global limiter of `rate_limiting.max_requests` per `rate_limiting.window_minutes` (1000 per 15 minutes by the schema default, 100 in the packaged template). File operations, downloads, download links and architecture operations carry their own ceilings (`file_operations_max_requests`, `download_max_requests`, `download_link_max_requests`, `architecture_operations_max_requests`) on the same window. A refused request answers `429` as `application/problem+json` with `RateLimit-*` and `Retry-After` headers:

```json
{
  "type": "https://auth.startcloud.com/probs/throttled",
  "title": "Too many requests; try again later.",
  "status": 429,
  "errors": []
}
```

## Error Handling

A refused write answers RFC 9457 problem details as `application/problem+json`: `422` for a rule failure, `409` when the one failing rule is `unique`, and `400` for a body that could not be read, with one `errors[]` entry per failing value:

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
    }
  ]
}
```

An unhandled failure answers `500` in the same shape with type `https://auth.startcloud.com/probs/internal` and no `errors` entries. A refused gate answers the same shape with no `errors` entries: `401` with type `https://auth.startcloud.com/probs/authentication` for no token or an expired one, `403` with type `https://auth.startcloud.com/probs/forbidden` for a missing role or membership, and `404` with type `https://auth.startcloud.com/probs/not-found` for a parent that does not exist.

Common status codes:

- `200` - Success
- `201` - Created
- `400` - Bad Request (the body could not be read)
- `401` - Unauthorized (Invalid or expired token)
- `403` - Forbidden (Insufficient permissions)
- `404` - Not Found
- `409` - Conflict (a value is already taken in its scope)
- `422` - Unprocessable Content (a value breaks a rule)
- `429` - Too Many Requests
- `500` - Internal Server Error

## Response Format

Successful responses are flat: the record or list itself, with no envelope. A creation answers `201` with the created record, a sign-in answers the account fields and `accessToken` at the top level, and a message-only answer is `{ "message": "…" }`.

```json
{
  "id": 1,
  "name": "debian12",
  "description": "Debian 12 Server",
  "published": false,
  "isPublic": false,
  "organizationId": 1,
  "userId": 1
}
```

## Related APIs

- **[BoxVault Backend](/)** - Box repository management and file storage
- **[BoxVault API Reference](/api/docs/)** - Backend API documentation
