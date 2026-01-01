---
title: Getting Started
layout: default
parent: Guides
nav_order: 1
permalink: /docs/guides/getting-started/
---

## Getting Started with BoxVault

{: .no_toc }

Complete guide to setting up and using BoxVault for the first time.

## Table of contents

{: .no_toc .text-delta }

1. TOC
   {:toc}

---

## What is BoxVault?

BoxVault is a comprehensive Vagrant box repository management system that allows you to:

- **Host Vagrant boxes** - Store and distribute Vagrant boxes for your team
- **Manage versions** - Track different versions of your boxes
- **Control access** - Organization-based access control and user management
- **API integration** - RESTful API for automation and CI/CD integration

## Prerequisites

Before installing BoxVault, ensure you have:

- **Node.js** 16.x or higher
- **npm** or **yarn** package manager
- **Database** (SQLite, PostgreSQL, MySQL, or MariaDB)
- **Storage space** for Vagrant box files

## Quick Installation

### Using npm

```bash
# Install BoxVault globally
npm install -g boxvault

# Start BoxVault
boxvault start
```

### Using Docker

```bash
# Run BoxVault with Docker
docker run -d \
  --name boxvault \
  -p 3000:3000 \
  -v boxvault-data:/app/data \
  boxvault/boxvault:latest
```

## Initial Setup

### 1. First Run

When you first start BoxVault, you'll be prompted to create an initial configuration:

```bash
boxvault setup
```

This will guide you through:

- Database configuration
- Admin user creation
- Basic settings

### 2. Access the Web Interface

Open your browser and navigate to:

```
http://localhost:3000
```

### 3. Create Your First Organization

1. Log in with your admin credentials
2. Click "Create Organization"
3. Enter organization details:
   - **Name**: Your organization name
   - **Description**: Brief description
   - **Visibility**: Public or Private

### 4. Upload Your First Box

1. Navigate to your organization
2. Click "Create Box"
3. Fill in box details:
   - **Name**: Box name (e.g., "ubuntu-20.04")
   - **Description**: Box description
   - **Visibility**: Public or Private
4. Create a version (e.g., "1.0.0")
5. Add a provider (e.g., "virtualbox")
6. Add an architecture (e.g., "amd64")
7. Upload your `.box` file

## Using BoxVault

### Web Interface

The web interface provides:

- **Dashboard** - Overview of your boxes and organizations
- **Box Management** - Create, edit, and delete boxes
- **User Management** - Manage organization members
- **Settings** - Configure your account and organizations

### API Access

BoxVault provides a comprehensive REST API:

```bash
# Get authentication token
curl -X POST http://localhost:3000/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'

# List boxes in an organization
curl -H "x-access-token: YOUR_TOKEN" \
  http://localhost:3000/api/organization/myorg/box
```

### Vagrant Integration

Use your BoxVault boxes in Vagrant:

```ruby
# Vagrantfile
Vagrant.configure("2") do |config|
  config.vm.box = "myorg/ubuntu-20.04"
  config.vm.box_url = "http://localhost:3000/api/organization/myorg/box/ubuntu-20.04"
end
```

## Configuration

### Basic Configuration

BoxVault uses YAML configuration files. Create `config/default.yaml`:

```yaml
database:
  dialect: "sqlite"
  storage: "./data/boxvault.db"

server:
  port: 3000
  host: "0.0.0.0"

storage:
  boxStorageDirectory: "./storage/boxes"

auth:
  jwt:
    secret: "your-secret-key"
    expiresIn: "24h"
```

### Environment Variables

Override configuration with environment variables:

```bash
export BOXVAULT_SERVER_PORT=8080
export BOXVAULT_DATABASE_DIALECT=postgresql
export BOXVAULT_DATABASE_HOST=localhost
```

## User Management

### Creating Users

As an admin, you can create users:

1. Go to "Admin" → "Users"
2. Click "Create User"
3. Fill in user details
4. Assign to organizations

### Organization Management

Manage organization membership:

1. Go to your organization settings
2. Click "Members"
3. Add or remove users
4. Assign roles (Admin, Member)

## Best Practices

### Box Naming

Use consistent naming conventions:

- `organization/box-name` (e.g., `mycompany/ubuntu-20.04`)
- Include OS and version in the name
- Use semantic versioning for box versions

### Version Management

- Use semantic versioning (e.g., 1.0.0, 1.1.0, 2.0.0)
- Document changes in version descriptions
- Test boxes before publishing

### Security

- Use strong passwords
- Regularly rotate JWT secrets
- Keep BoxVault updated
- Use HTTPS in production

## Next Steps

Now that you have BoxVault running:

1. **[Configure](../configuration/)** - Set up production configuration
2. **[Install](installation/)** - Deploy to production
3. **[API Reference](../api/)** - Explore the API
4. **[Authentication](authentication/)** - Set up API access
5. **[Backend Integration](backend-integration/)** - Integrate with CI/CD

## Getting Help

Need help? Check out:

- **[Troubleshooting](troubleshooting/)** - Common issues
- **[GitHub Issues](https://github.com/Makr91/BoxVault/issues)** - Bug reports
- **[GitHub Discussions](https://github.com/Makr91/BoxVault/discussions)** - Community help
- **[Support](../support/)** - Support resources
