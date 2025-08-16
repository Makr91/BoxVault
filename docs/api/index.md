---
title: API Reference
layout: default
nav_order: 2
has_children: true
permalink: /docs/api/
---

# API Reference
{: .no_toc }

Complete API documentation for BoxVault's RESTful API endpoints.

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Overview

BoxVault provides a comprehensive RESTful API for managing Vagrant box repositories. The API supports user authentication, organization management, box versioning, and file operations.

### Base URL

```
https://your-boxvault-instance.com/api
```

### Authentication

BoxVault uses JWT (JSON Web Tokens) for API authentication. Include the token in the `x-access-token` header:

```bash
curl -H "x-access-token: YOUR_JWT_TOKEN" \
     https://your-boxvault-instance.com/api/user/profile
```

### Response Format

All API responses are in JSON format. Successful responses include the requested data, while error responses include an error message:

```json
{
  "message": "Error description"
}
```

## API Endpoints

### Authentication
- [Authentication API](authentication/) - User login, registration, and token management

### Users
- [User Management API](users/) - User profile and account management

### Organizations
- [Organization API](organizations/) - Organization management and user assignments

### Boxes
- [Box Management API](boxes/) - Vagrant box creation and management

### Versions
- [Version API](versions/) - Box version management

### Providers
- [Provider API](providers/) - Provider management (VirtualBox, VMware, etc.)

### Architectures
- [Architecture API](architectures/) - Architecture support (x86_64, arm64, etc.)

### Files
- [File Management API](files/) - File upload, download, and management

## Interactive API Documentation

BoxVault includes interactive Swagger/OpenAPI documentation available at:

```
https://your-boxvault-instance.com/api-docs
```

This provides a complete, interactive interface for testing all API endpoints with proper authentication and parameter validation.

## Rate Limiting

API requests are subject to rate limiting to ensure fair usage:

- **Authenticated requests**: 1000 requests per hour
- **Unauthenticated requests**: 100 requests per hour
- **File uploads**: 10 uploads per hour per user

Rate limit headers are included in all responses:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
```

## Error Codes

BoxVault uses standard HTTP status codes:

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 422 | Unprocessable Entity |
| 429 | Too Many Requests |
| 500 | Internal Server Error |
