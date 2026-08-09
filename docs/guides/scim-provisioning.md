---
title: SCIM Provisioning
layout: default
parent: Guides
nav_order: 6
permalink: /guides/scim-provisioning/
---

## SCIM Provisioning

{: .no_toc }

How an identity provider provisions users and organizations into BoxVault.

## Table of contents

{: .no_toc .text-delta }

1. TOC
   {:toc}

---

## Overview

BoxVault exposes a SCIM 2.0 receiver at `/scim/v2` so an identity provider can
push its users and organizations in. It is a **receiver only** — BoxVault never
calls out to the provider's SCIM API.

Two things follow from that, and they explain most of the behaviour below:

- **BoxVault assigns the resource ids.** A SCIM resource id is the BoxVault user
  or group row id, serialized as a string. The provider's own identity travels
  exclusively in `externalId`.
- **Every resource is scoped to the issuer that pushed it.** Credentials are
  keyed on `(issuer, subject)`, so two providers can use the same subject value
  without colliding.

SCIM is optional. Providers that do not speak it are not second-class: the same
facts reach every OIDC client through claims at login. SCIM only makes those
facts arrive sooner and without the user having to log in again.

## Authentication

Every request carries a short-lived RS256 bearer JWT minted by the provider and
validated against that provider's published JWKS.

```yaml
auth:
  scim:
    enabled: true
    audience: boxvault
```

The audience is mandatory. If it is unset BoxVault refuses every request with
`403` rather than skipping the check, because an unchecked `aud` would accept
any token the issuer minted for any client.

Failures are deliberate and distinct:

| condition | status |
| --- | --- |
| SCIM disabled, or `audience` unset | `403` |
| missing, malformed, or invalid token | `401` |
| token issuer matches no enabled OIDC provider | `401` |
| provider metadata not discovered yet | `503` |

The `503` matters: it means "ask again later", so the provider's retry machinery
keeps the event instead of dead-lettering it while BoxVault is still starting.

## Users

### What BoxVault reads

| SCIM attribute | Stored as | Notes |
| --- | --- | --- |
| `externalId` | credential `subject` | The provider's user UUID. Required on POST. |
| `userName` | `username` | |
| `emails[]` | `email` | First entry with a `value`, preferring `primary: true`. Falls back to `userName` **only when it contains `@`**. |
| `displayName`, else `name.formatted` | `name` | Optional. Absent means null, and the username is the render fallback. |
| `preferredLanguage` | `preferredLanguage` | BCP 47. Drives outbound mail and notification language. |
| `locale` | `locale` | BCP 47, formatting only. Fallback for `preferredLanguage`. |
| `timezone` | `timezone` | Olson name. |
| `active` | `suspended` (inverted) | |
| `photos[]` | `avatar_url` | Entry typed `photo`, else the first with a value. `http(s)` only. |
| `entitlements[]` | `entitlements` | `value` required per entry; `type`/`display` kept when present. |
| `urn:startcloud:…:User` `emailVerified` | `verified` | Also gates email-linking, below. |
| `urn:startcloud:…:User` `primaryOrgUuid` | `primary_organization_id` | Applied only once that org is mirrored locally. |

Every push is **full desired state**. An attribute absent from the payload is
applied as "no value" — it clears the stored one. That is intentional and is why
partial updates must not be sent as PUT.

### Provisioning and email linking

On first contact BoxVault either creates a user or links the `externalId` to an
existing account matched by email. Linking to an **existing** account requires
`emailVerified: true` from the provider — an unverified email match is refused
with `409 uniqueness` rather than silently handing over an account. Creating a
brand-new user is unaffected.

### externalId adoption

An account that logged into BoxVault over OIDC before it was ever SCIM-pushed is
stored under whatever subject the login carried, which is not necessarily the
UUID the provisioner later sends. Both identify the same person at the same
issuer.

When a PUT arrives whose `externalId` differs from the stored credential
subject, BoxVault **adopts the pushed value** as canonical — provided the pushed
email matches the stored user's, or the provider vouched for the mailbox with
`emailVerified: true`. The swap is logged. Anything else is still rejected as a
`mutability` violation.

This is what keeps a provider's migration from email-shaped subjects to UUIDs
from stranding the accounts that used both doors.

## Groups

Groups carry organization membership. Each group is one org **and** one role,
identified by an `externalId` of the form `<org-uuid>:<owner|admin|member>`.

Memberships are recomputed from **all** stored groups for that org, not from the
single group in the request:

- the highest role wins when a user appears in more than one group
  (`owner` > `admin` > `member`)
- a user absent from every group loses their membership
- member UUIDs matching no known BoxVault user are ignored as ghosts

The org profile — email, description, URL, telephone, locale, timezone,
address, access mode, default role — rides on the group extension and is applied
as full desired state, same as users.

## Queries and filters

Exactly one filter is supported, by contract:

```
externalId eq "<value>"
```

Anything else is `400 invalidFilter`. There is no pagination: every list
response is complete, and by contract holds zero or one resource.

## Error responses

Errors follow RFC 7644 §3.12 — the Error schema, `status` as a string, and a
`scimType` keyword where one applies. **Every 4xx is also logged** with its
method, path, status, `scimType` and `detail`, because the sending side
typically records only the HTTP status and the reason would otherwise exist
nowhere once the response is discarded.

The complete set of `400`s:

| resource | `scimType` | cause |
| --- | --- | --- |
| User, Group | `invalidSyntax` | body is not an object |
| User | `invalidValue` | `externalId` missing on POST |
| User | `invalidValue` | no email derivable from `emails[]` or `userName` |
| User, Group | `mutability` | `body.id` does not match the URL id on PUT |
| User | `mutability` | `externalId` conflicts with the stored subject and adoption did not apply |
| Group | `invalidValue` | `externalId` is not `<org-uuid>:<role>` |
| Group | `mutability` | identity mismatch on PUT |
| User, Group | `invalidFilter` | any filter other than the one above |

Other statuses: `404` for an unknown resource id (PUT never creates), `409
uniqueness` for a duplicate `externalId` or an unverified email conflict, and
`204` for a successful DELETE.

## Deletion

Deleting a user destroys the BoxVault row; memberships and credentials cascade
with it. The sole-owner guard that protects self-service account deletion does
**not** apply here — the provider is authoritative for its own users.

Deleting the last group of an org removes the mirrored organization and its
storage directory.
