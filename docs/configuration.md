---
title: Configuration
layout: default
nav_order: 4
permalink: /docs/configuration/
---

# Configuration
{: .no_toc }

BoxVault configuration options and settings.

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Overview

BoxVault uses configuration files to manage database connections, authentication settings, file storage, and other application parameters. Configuration can be managed through environment variables or configuration files.

## Configuration Files

BoxVault supports multiple configuration formats:

- **YAML** - Primary configuration format
- **JSON** - Alternative configuration format
- **Environment Variables** - Override any configuration setting

### Default Configuration Locations

BoxVault looks for configuration files in the following order:

1. `./config/` (relative to application root)
2. `/etc/boxvault/`
3. `~/.boxvault/`

## Database Configuration

Configure your database connection:

```yaml
database:
  dialect: "sqlite" # or "mysql", "postgresql", "mariadb"
  host: "localhost"
  port: 3306
  database: "boxvault"
  username: "boxvault"
  password: "your-password"
  storage: "./data/boxvault.db" # SQLite only
  logging: false
```

## Authentication Configuration

JWT and authentication settings:

```yaml
auth:
  jwt:
    secret: "your-jwt-secret-key"
    expiresIn: "24h"
  bcrypt:
    rounds: 12
```

## File Storage Configuration

Configure where Vagrant boxes are stored:

```yaml
storage:
  boxStorageDirectory: "./storage/boxes"
  maxFileSize: "2GB"
  allowedExtensions: [".box"]
  tempDirectory: "./storage/temp"
```

## Server Configuration

HTTP server settings:

```yaml
server:
  port: 3000
  host: "0.0.0.0"
  cors:
    enabled: true
    origin: "*"
  ssl:
    enabled: false
    cert: "./ssl/cert.pem"
    key: "./ssl/key.pem"
```

## Email Configuration

SMTP settings for notifications:

```yaml
email:
  enabled: false
  smtp:
    host: "smtp.example.com"
    port: 587
    secure: false
    auth:
      user: "noreply@example.com"
      pass: "your-password"
  from: "BoxVault <noreply@example.com>"
```

## Logging Configuration

Application logging settings:

```yaml
logging:
  level: "info" # debug, info, warn, error
  file: "./logs/boxvault.log"
  maxSize: "10MB"
  maxFiles: 5
  console: true
```

## Environment Variables

Override any configuration using environment variables with the `BOXVAULT_` prefix:

```bash
# Database
export BOXVAULT_DATABASE_HOST=localhost
export BOXVAULT_DATABASE_PORT=5432
export BOXVAULT_DATABASE_DATABASE=boxvault

# Authentication
export BOXVAULT_AUTH_JWT_SECRET=your-secret-key

# Storage
export BOXVAULT_STORAGE_BOXSTORAGEDIRECTORY=/var/lib/boxvault/boxes

# Server
export BOXVAULT_SERVER_PORT=8080
```

## Production Configuration

Recommended settings for production:

```yaml
database:
  dialect: "postgresql"
  host: "db.example.com"
  port: 5432
  database: "boxvault_prod"
  username: "boxvault"
  password: "${DB_PASSWORD}"
  logging: false

auth:
  jwt:
    secret: "${JWT_SECRET}"
    expiresIn: "1h"
  bcrypt:
    rounds: 14

storage:
  boxStorageDirectory: "/var/lib/boxvault/boxes"
  maxFileSize: "5GB"
  tempDirectory: "/tmp/boxvault"

server:
  port: 3000
  host: "127.0.0.1"
  cors:
    enabled: true
    origin: ["https://boxvault.example.com"]
  ssl:
    enabled: true
    cert: "/etc/ssl/certs/boxvault.pem"
    key: "/etc/ssl/private/boxvault.key"

logging:
  level: "warn"
  file: "/var/log/boxvault/boxvault.log"
  console: false
```

## Configuration Validation

BoxVault validates configuration on startup and will report any errors or missing required settings. Use the `--validate-config` flag to check configuration without starting the server:

```bash
npm start -- --validate-config
