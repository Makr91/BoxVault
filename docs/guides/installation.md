---
title: Installation
layout: default
parent: Guides
nav_order: 2
permalink: /docs/guides/installation/
---

# Installation Guide
{: .no_toc }

Detailed installation instructions for BoxVault.

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## System Requirements

### Minimum Requirements
- **CPU**: 1 core
- **RAM**: 512 MB
- **Storage**: 1 GB (plus space for box files)
- **Node.js**: 16.x or higher

### Recommended Requirements
- **CPU**: 2+ cores
- **RAM**: 2 GB
- **Storage**: 10 GB+ (depending on box storage needs)
- **Database**: PostgreSQL or MySQL for production

## Installation Methods

### npm Installation

```bash
# Install globally
npm install -g boxvault

# Or install locally
npm install boxvault
```

### Docker Installation

```bash
# Pull the image
docker pull boxvault/boxvault:latest

# Run with Docker Compose
curl -o docker-compose.yml https://raw.githubusercontent.com/Makr91/BoxVault/main/docker-compose.yml
docker-compose up -d
```

### Source Installation

```bash
# Clone repository
git clone https://github.com/Makr91/BoxVault.git
cd BoxVault

# Install dependencies
npm install

# Build application
npm run build

# Start application
npm start
```

## Database Setup

### SQLite (Development)

SQLite requires no additional setup:

```yaml
database:
  dialect: "sqlite"
  storage: "./data/boxvault.db"
```

### PostgreSQL (Recommended for Production)

```bash
# Install PostgreSQL
sudo apt-get install postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql
CREATE DATABASE boxvault;
CREATE USER boxvault WITH PASSWORD 'your-password';
GRANT ALL PRIVILEGES ON DATABASE boxvault TO boxvault;
```

Configuration:
```yaml
database:
  dialect: "postgresql"
  host: "localhost"
  port: 5432
  database: "boxvault"
  username: "boxvault"
  password: "your-password"
```

### MySQL/MariaDB

```bash
# Install MySQL
sudo apt-get install mysql-server

# Create database
mysql -u root -p
CREATE DATABASE boxvault;
CREATE USER 'boxvault'@'localhost' IDENTIFIED BY 'your-password';
GRANT ALL PRIVILEGES ON boxvault.* TO 'boxvault'@'localhost';
```

## Production Deployment

### Systemd Service

Create `/etc/systemd/system/boxvault.service`:

```ini
[Unit]
Description=BoxVault Vagrant Box Repository
After=network.target

[Service]
Type=simple
User=boxvault
WorkingDirectory=/opt/boxvault
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable boxvault
sudo systemctl start boxvault
```

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name boxvault.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### SSL/TLS Setup

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d boxvault.example.com
```

## Configuration

Create production configuration file:

```yaml
# /etc/boxvault/config.yaml
database:
  dialect: "postgresql"
  host: "localhost"
  port: 5432
  database: "boxvault_prod"
  username: "boxvault"
  password: "${DB_PASSWORD}"

server:
  port: 3000
  host: "127.0.0.1"

storage:
  boxStorageDirectory: "/var/lib/boxvault/boxes"
  maxFileSize: "5GB"

auth:
  jwt:
    secret: "${JWT_SECRET}"
    expiresIn: "1h"

logging:
  level: "info"
  file: "/var/log/boxvault/boxvault.log"
```

## Security Considerations

### File Permissions

```bash
# Create boxvault user
sudo useradd -r -s /bin/false boxvault

# Set permissions
sudo chown -R boxvault:boxvault /opt/boxvault
sudo chown -R boxvault:boxvault /var/lib/boxvault
sudo chmod 750 /var/lib/boxvault
```

### Firewall

```bash
# Allow HTTP/HTTPS
sudo ufw allow 80
sudo ufw allow 443

# Block direct access to BoxVault port
sudo ufw deny 3000
```

## Monitoring

### Health Checks

BoxVault provides health check endpoints:

```bash
# Health check
curl http://localhost:3000/health

# Detailed status
curl http://localhost:3000/api/status
```

### Logging

Configure log rotation:

```bash
# /etc/logrotate.d/boxvault
/var/log/boxvault/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 boxvault boxvault
    postrotate
        systemctl reload boxvault
    endscript
}
```

## Troubleshooting

### Common Issues

**Port already in use:**
```bash
# Find process using port
sudo lsof -i :3000
# Kill process or change port
```

**Database connection failed:**
- Check database credentials
- Verify database server is running
- Check firewall settings

**File upload fails:**
- Check storage directory permissions
- Verify disk space
- Check file size limits

### Log Analysis

```bash
# View logs
sudo journalctl -u boxvault -f

# Check application logs
tail -f /var/log/boxvault/boxvault.log
```

## Backup and Recovery

### Database Backup

```bash
# PostgreSQL
pg_dump -U boxvault boxvault > backup.sql

# MySQL
mysqldump -u boxvault -p boxvault > backup.sql
```

### File Backup

```bash
# Backup box files
tar -czf boxes-backup.tar.gz /var/lib/boxvault/boxes/
```

## Updates

### npm Updates

```bash
# Update BoxVault
npm update -g boxvault

# Restart service
sudo systemctl restart boxvault
```

### Docker Updates

```bash
# Pull latest image
docker pull boxvault/boxvault:latest

# Restart container
docker-compose down
docker-compose up -d
