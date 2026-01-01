---
title: API Reference
layout: default
nav_order: 2
has_children: false
permalink: /docs/api/
---

## API Reference

{: .no_toc }

The BoxVault API provides comprehensive RESTful endpoints for user management, organization control, and box repository management. This API handles authentication, authorization, and box management for the BoxVault web interface.

## Table of contents

{: .no_toc .text-delta }

1. TOC
   {:toc}

---

## Authentication

All API endpoints require authentication using JWT tokens in the x-access-token header format:

```http
x-access-token: <jwt_token>
```

See the [Authentication Guide](../guides/authentication/) for detailed setup instructions.

## Base URL

The API is served from your BoxVault server:

- **HTTPS (Recommended)**: `https://your-server:5001`
- **HTTP**: `http://your-server:5000`

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
- Multi-tenant organization support
- User-organization relationships
- Invitation management

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

The API currently does not implement rate limiting, but this may be added in future versions for production deployments.

## Error Handling

The API uses standard HTTP status codes and returns JSON error responses:

```json
{
  "success": false,
  "message": "Error description"
}
```

Common status codes:

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized (Invalid or expired JWT token)
- `403` - Forbidden (Insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

## Response Format

Successful responses follow this format:

```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    // Response data here
  }
}
```

## Related APIs

- **[BoxVault Backend](https://your-boxvault-instance.com/)** - Box repository management and file storage
- **[BoxVault API Reference](https://your-boxvault-instance.com/api-docs/)** - Backend API documentation
