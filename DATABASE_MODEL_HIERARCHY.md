# BoxVault Database Model Hierarchy Tree View

## Complete Database Schema Relationships

Based on analysis of all model files in `backend/app/models/`, here is the complete hierarchical relationship tree:

```
BoxVault Database Schema
│
├── organizations (Root Level)
│   ├── id (PK, AUTO_INCREMENT)
│   ├── name (UNIQUE)
│   ├── email, emailHash, description
│   └── suspended (BOOLEAN)
│   │
│   ├── users (1:Many via organizationId FK)
│   │   ├── id (PK, AUTO_INCREMENT)
│   │   ├── username, email, password, emailHash
│   │   ├── verified, verificationToken, verificationTokenExpires
│   │   ├── suspended (BOOLEAN)
│   │   └── organizationId (FK → organizations.id)
│   │   │
│   │   ├── boxes (1:Many via userId FK)
│   │   │   ├── id (PK, AUTO_INCREMENT)
│   │   │   ├── name, description
│   │   │   ├── published, isPublic (BOOLEAN)
│   │   │   └── userId (FK → users.id)
│   │   │   │
│   │   │   └── versions (1:Many via boxId FK)
│   │   │       ├── id (PK, AUTO_INCREMENT)
│   │   │       ├── versionNumber (STRING, NOT NULL)
│   │   │       ├── description
│   │   │       └── boxId (FK → boxes.id)
│   │   │       │
│   │   │       └── providers (1:Many via versionId FK)
│   │   │           ├── id (PK, AUTO_INCREMENT)
│   │   │           ├── name (STRING, NOT NULL)
│   │   │           ├── description
│   │   │           └── versionId (FK → versions.id)
│   │   │           │
│   │   │           └── architectures (1:Many via providerId FK) ⚠️ CRITICAL BUG LOCATION
│   │   │               ├── id (PK, AUTO_INCREMENT)
│   │   │               ├── name (STRING, NOT NULL)
│   │   │               ├── defaultBox (BOOLEAN)
│   │   │               └── providerId (FK → providers.id)
│   │   │               │
│   │   │               └── files (1:Many via architectureId FK)
│   │   │                   ├── id (PK, AUTO_INCREMENT)
│   │   │                   ├── fileName (STRING, NOT NULL)
│   │   │                   ├── checksum, checksumType (ENUM)
│   │   │                   ├── downloadCount (INTEGER, DEFAULT 0)
│   │   │                   ├── fileSize (BIGINT, NOT NULL)
│   │   │                   └── architectureId (FK → architectures.id)
│   │   │
│   │   └── service_accounts (1:Many via userId FK)
│   │       ├── id (PK, AUTO_INCREMENT)
│   │       ├── username (STRING, UNIQUE)
│   │       ├── token (STRING, UNIQUE)
│   │       ├── expiresAt (DATE)
│   │       ├── description
│   │       └── userId (FK → users.id)
│   │
│   └── invitations (1:Many via organizationId FK)
│       ├── id (PK, AUTO_INCREMENT)
│       ├── email (STRING, NOT NULL)
│       ├── token (STRING, NOT NULL, UNIQUE)
│       ├── expires (DATE, NOT NULL)
│       ├── accepted, expired (BOOLEAN)
│       └── organizationId (FK → organizations.id)
│
└── roles (Independent - Many:Many with users)
    ├── id (PK)
    ├── name (STRING)
    └── user_roles (Junction Table)
        ├── userId (FK → users.id)
        └── roleId (FK → roles.id)
```

## Key Relationships Summary

### Primary Hierarchy Chain (Vagrant Box Management)
1. **organizations** → users → boxes → versions → providers → architectures → files
   - This is the main data flow for Vagrant box management
   - Each level represents a logical container for the next level

### Secondary Relationships
2. **organizations** → invitations (Organization invitation system)
3. **users** → service_accounts (API access tokens)
4. **users** ↔ roles (Many-to-many via user_roles junction table)

## Critical Bug Location Identified

**⚠️ CRITICAL BUG in Provider Controller Delete Function:**

The bug is located in the **architectures** level of the hierarchy:

```javascript
// CURRENT BUGGY CODE in provider.controller.js delete function:
Architecture.findAll({ where: { providerId: version.id } })

// SHOULD BE:
Architecture.findAll({ where: { providerId: provider.id } })
```

**Impact Analysis:**
- **Correct Relationship:** `architectures.providerId` → `providers.id`
- **Bug Effect:** Using `version.id` instead of `provider.id` means:
  - Wrong architectures may be deleted (if version.id matches a different provider.id)
  - Correct architectures may be left orphaned
  - Data integrity violation in the providers → architectures relationship

## Database Constraints & Foreign Keys

### Explicit Foreign Key References Found:
- `users.organizationId` → `organizations.id`
- `boxes.userId` → `users.id`
- `versions.boxId` → `boxes.id`
- `providers.versionId` → `versions.id`
- `architectures.providerId` → `providers.id` ⚠️ **BUG AFFECTS THIS RELATIONSHIP**
- `files.architectureId` → `architectures.id`
- `invitations.organizationId` → `organizations.id`
- `service_accounts.userId` → `users.id`

### Junction Table:
- `user_roles` (users ↔ roles many-to-many)

## Data Flow for Vagrant Box Operations

1. **Organization** creates/manages **Users**
2. **User** creates **Boxes** (Vagrant box definitions)
3. **Box** has multiple **Versions** (version releases)
4. **Version** supports multiple **Providers** (virtualbox, vmware, etc.)
5. **Provider** supports multiple **Architectures** (amd64, arm64, etc.)
6. **Architecture** contains multiple **Files** (actual .box files, metadata, etc.)

This hierarchy ensures proper organization and isolation of Vagrant box data while maintaining referential integrity - except for the critical bug in the provider deletion logic.
