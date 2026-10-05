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

A refused request whose `Accept` names `text/html` and prefers it to JSON is a browser navigation, such as a download link opened in a tab: it is answered the UI's page with the fault's own status code, never `200`, and `Cache-Control: no-store`, carrying `data-error-status` (the status), `data-error-reference` (sixteen lowercase hex characters, random, written to the server log with the status, path and problem type) and `data-error-path` (the request path, percent-encoded, without the query) on `<html>`, from which the UI draws its error page. Nothing redirects. Every other request, one naming `application/json`, `*/*` or no `Accept` at all as `vagrant`, `curl` and the UI's own API calls do, keeps the problem body.

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

Successful responses are flat: the record or list itself, with no envelope. A creation answers `201` with the created record, a sign-in answers the account fields and `access_token` at the top level, and a message-only answer is `{ "message": "…" }`. Every member of every answer is `snake_case`, the same case every request body and query uses.

```json
{
  "id": 1,
  "name": "debian12",
  "description": "Debian 12 Server",
  "published": false,
  "is_public": false,
  "guest_access": false,
  "organization_id": 1,
  "user_id": 1
}
```

## Search

`GET /api/search` searches organizations, boxes, ISOs and downloads with their versions, releases, providers, patches, architectures, files and artifacts, and users, answering a caller only what that caller could already list. It answers anonymous callers and reads the same credentials as every other route.

### Request

```http
GET /api/search?q=&kinds=&scope=&limit=&after=
```

- `q`: the text to look for, trimmed, 2 to 200 characters. Every word matches case-insensitively as a substring of some field of the hit. A shorter or longer query answers `422` with one `errors[]` entry carrying pointer `/q` and rule `minLength` (`{ "minLength": 2 }`) or `maxLength` (`{ "maxLength": 200 }`).
- `kinds`: a comma list of `organization`, `item`, `version`, `provider`, `architecture`, `artifact` and `user`. Unknown kinds are dropped; none means all seven.
- `scope`: `org:<name>` keeps the results whose `org` is that organization, compared case-insensitively; `collection:<key>` keeps the results whose `collection` is that key. Any other value is no scope.
- `limit`: results per kind, 1 to 50, 5 by default.
- `after`: the `next` cursor of a previous answer, honoured only while `kinds` names exactly one kind. A cursor that does not decode, or was minted for another query, kind or scope, answers the first page.

Every answer carries `Cache-Control: no-store`.

### Answer

```json
{
  "query": "debian",
  "kinds": ["item"],
  "scope": "",
  "counts": { "item": { "value": 12, "relation": "eq" } },
  "results": [
    {
      "kind": "item",
      "id": "boxes/STARTcloud/debian12",
      "collection": "boxes",
      "org": "STARTcloud",
      "name": "debian12",
      "version": "",
      "provider": "",
      "architecture": "",
      "anchor": "",
      "source": null,
      "score": 2,
      "title": "debian12",
      "subtitle": "STARTcloud · boxes",
      "matched": "name",
      "highlight": { "name": { "text": "debian12", "spans": [[0, 6]] } },
      "facets": { "collection": "boxes" }
    }
  ],
  "next": "eyJxIjoiZGViaWFuIiwia2luZCI6Iml0ZW0iLCJzY29wZSI6IiIsIm9mZnNldCI6NX0"
}
```

- `query` is the trimmed term, `kinds` the kinds searched in canonical order, `scope` the scope applied or `""`.
- `counts` holds one entry per kind searched: `value` is every result of that kind after scope and visibility, `relation` is always `eq`.
- `results` is the page. With several kinds it is the first `limit` results of each kind sorted together; with one kind it is the `limit` results the cursor starts at.
- `next` is a cursor only while `kinds` names one kind and more results remain, `null` otherwise.

Every result carries every member. Every member is a string, never `null`, except `collection`, `source`, `score`, `highlight` and `facets`:

| Member | Meaning |
| --- | --- |
| `kind` | One of the seven kinds |
| `id` | A natural key unique within the kind, its locator members joined with `/` (see below) |
| `collection` | `boxes`, `isos` or `downloads`, `null` for an organization or a user |
| `org`, `name`, `version`, `provider`, `architecture` | The locator members, filled as deep as the hit goes, else `""`; `name` is the username of a user |
| `anchor` | The file name of an artifact or a downloads file, else `""` |
| `source` | Always `null` |
| `score` | 3, 2, 1 or 0 (see below) |
| `title` | The display text of the hit |
| `subtitle` | The `org · collection · version` chain above the hit as plain text |
| `matched` | The field that matched: `name`, `fileName`, `checksum`, `family`, a chain field such as `box` or `version`, or `metadata.<key>` |
| `highlight` | Keyed by the matched field: its `text` and the `[start, end]` offsets of each query word's first occurrence in it, sorted by start, words it does not hold left out |
| `facets` | `{ "collection": <collection> }` for a row of a collection, else `{}` |

The `id` of each kind:

| Kind | `id` |
| --- | --- |
| `organization` | `<org>` |
| `item` | `<collection>/<org>/<name>` |
| `version` | `<collection>/<org>/<name>/<version>` |
| `provider` | `<collection>/<org>/<name>/<version>/<provider>` |
| `architecture` | `<collection>/<org>/<name>/<version>/<provider>/<architecture>` |
| `artifact` | `<collection>/<org>/<name>/<version>/<provider>/<architecture>/<file name>`, the provider empty for an ISO |
| `user` | `<org>/<username>` |

A downloads patch answers as a `provider` and a downloads file as an `architecture`, its key as `architecture` and its file name as `anchor`.

Box and ISO metadata is matched on its whitelisted keys only, never on the password key, so a highlight only ever carries a value the caller could list.

### Scoring and order

With the query's words lower-cased and joined by one space as the phrase, and the lower-cased `title` as the name, a result scores 3 when the name equals the phrase, 2 when it starts with the phrase, 1 when every word lies inside the name, and 0 otherwise (a hit on another field). Results sort by score descending, then the smallest position of any query word in the lower-cased title (a title holding none last), then `title`, then `id`.

### Cursor

`next` is opaque to the caller: send it back as `after` with the same `q`, `kinds` and `scope` to fetch the following page. Pages never overlap, and the last page answers `next: null`.

### OpenSearch description

`GET /opensearch.xml` answers an OpenSearch 1.1 description of the host the request names, `application/opensearchdescription+xml` with `Cache-Control: no-cache`, so a browser can add the site as a search engine:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>BoxVault</ShortName>
  <Description>Search BoxVault</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Image>https://boxvault.example.com/brand/boxvault/mark.svg</Image>
  <Url type="text/html" template="https://boxvault.example.com/search?q={searchTerms}"/>
</OpenSearchDescription>
```

`ShortName` is the `brand.name` of the hostname's `sites` entry, `BoxVault` otherwise; `Description` is `Search` and the `ShortName`; `Image` is the `brand.logo_url` of the entry, `/brand/boxvault/mark.svg` otherwise, on the hostname's origin; the template opens the search page on that origin. The origin is the `sites` entry's `origin`, `boxvault.origin` otherwise.

## Related APIs

- **[BoxVault Backend](/)** - Box repository management and file storage
- **[BoxVault API Reference](/api/docs/)** - Backend API documentation
