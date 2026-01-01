# Building BoxVault Debian Packages

Production-ready Debian package build process with automated CI/CD via Release Please.

## Prerequisites

```bash
sudo apt update
sudo apt install nodejs npm dpkg-dev gdebi-core
```

## Quick Build Commands

### 1. Prepare Application

```bash
# Install backend dependencies
cd backend
npm ci
cd ..

# Install frontend dependencies
cd frontend
npm ci
cd ..

# Build frontend
cd frontend && npm run build && cd ..

# Install production dependencies only (backend)
cd backend
npm ci --omit=dev
cd ..
```

### 2. Create Package Structure

```bash
# Extract version from package.json
export VERSION=$(node -p "require('./package.json').version")
export PACKAGE_NAME="boxvault"
export ARCH="amd64"

# Create directory structure
mkdir -p "${PACKAGE_NAME}_${VERSION}_${ARCH}"/{opt/boxvault,etc/boxvault,etc/systemd/system,var/lib/boxvault,var/log/boxvault,DEBIAN}
```

### 3. Copy Application Files

```bash
# Backend application files to /opt/boxvault
cp -r backend/app backend/server.js backend/package.json "${PACKAGE_NAME}_${VERSION}_${ARCH}/opt/boxvault/"
cp -r backend/node_modules "${PACKAGE_NAME}_${VERSION}_${ARCH}/opt/boxvault/"

# Frontend built files
cp -r frontend/dist "${PACKAGE_NAME}_${VERSION}_${ARCH}/opt/boxvault/frontend/"

# Configuration files
cp packaging/config/app.config.yaml "${PACKAGE_NAME}_${VERSION}_${ARCH}/etc/boxvault/"
cp packaging/config/auth.config.yaml "${PACKAGE_NAME}_${VERSION}_${ARCH}/etc/boxvault/"
cp packaging/config/db.config.yaml "${PACKAGE_NAME}_${VERSION}_${ARCH}/etc/boxvault/"
cp packaging/config/mail.config.yaml "${PACKAGE_NAME}_${VERSION}_${ARCH}/etc/boxvault/"

# Systemd service
cp packaging/DEBIAN/systemd/boxvault.service "${PACKAGE_NAME}_${VERSION}_${ARCH}/etc/systemd/system/"

# DEBIAN control files
cp packaging/DEBIAN/postinst packaging/DEBIAN/prerm packaging/DEBIAN/postrm "${PACKAGE_NAME}_${VERSION}_${ARCH}/DEBIAN/"
```

### 4. Generate Control File

```bash
# Create control file with dynamic version
cat > "${PACKAGE_NAME}_${VERSION}_${ARCH}/DEBIAN/control" << EOF
Package: boxvault
Version: ${VERSION}
Section: web
Priority: optional
Architecture: ${ARCH}
Maintainer: BoxVault Team <support@boxvault.io>
Depends: nodejs (>= 18.0.0), sqlite3, openssl
Description: BoxVault - Vagrant Box Repository Management System
 Comprehensive Vagrant box repository management system that provides
 a web interface for managing, organizing, and distributing Vagrant
 boxes across teams and organizations with multi-organization support,
 role-based access control, and RESTful API for automation.
Homepage: https://github.com/Makr91/BoxVault
EOF
```

### 5. Set Permissions

```bash
# Set proper permissions
find "${PACKAGE_NAME}_${VERSION}_${ARCH}" -type d -exec chmod 755 {} \;
find "${PACKAGE_NAME}_${VERSION}_${ARCH}" -type f -exec chmod 644 {} \;
chmod 755 "${PACKAGE_NAME}_${VERSION}_${ARCH}/DEBIAN"/{postinst,prerm,postrm}
```

### 6. Build & Install Package

```bash
# Build .deb package
dpkg-deb --build "${PACKAGE_NAME}_${VERSION}_${ARCH}" "${PACKAGE_NAME}_${VERSION}_${ARCH}.deb"

# Install package
sudo gdebi -n "${PACKAGE_NAME}_${VERSION}_${ARCH}.deb"

# Configure database connection (edit as needed)
sudo nano /etc/boxvault/db.config.yaml

# Start service
sudo systemctl enable --now boxvault

# Check status
sudo systemctl status boxvault
```

## Critical Build Notes

### ⚠️ Required Directories

**Must include these directories in the copy command or the package will fail:**

- `backend/app/` - Contains all backend application code
- `backend/node_modules/` - Backend dependencies
- `frontend/dist/` - Must build frontend first with `npm run build`

### 🔧 Systemd Service

The service includes:

- **Environment variables** (`NODE_ENV=production`, `CONFIG_DIR=/etc/boxvault`)
- **Security restrictions** (NoNewPrivileges, ProtectSystem, etc.)
- **MySQL dependency** (starts after mysql.service)

### 📁 Configuration Files

BoxVault uses multiple configuration files:

- `app.config.yaml` - Main application settings
- `auth.config.yaml` - JWT and authentication settings
- `db.config.yaml` - Database connection settings
- `mail.config.yaml` - SMTP mail configuration

## Database Setup

**Important:** BoxVault requires a MySQL/MariaDB database. Install before using:

```bash
# Install MySQL/MariaDB
sudo apt install mysql-server
# OR
sudo apt install mariadb-server

# Create database and user
sudo mysql -e "CREATE DATABASE boxvault;"
sudo mysql -e "CREATE USER 'boxvault'@'localhost' IDENTIFIED BY 'your_password';"
sudo mysql -e "GRANT ALL PRIVILEGES ON boxvault.* TO 'boxvault'@'localhost';"
sudo mysql -e "FLUSH PRIVILEGES;"

# Update database config
sudo nano /etc/boxvault/db.config.yaml
```

## Automated CI/CD

### Release Please Integration

Every push to main triggers Release Please:

1. **Creates release PR** with version bumps and changelog
2. **Merges PR** → triggers package build
3. **Creates GitHub release** with `.deb` package attached
4. **Uses semantic versioning** based on conventional commits

### Manual Release Trigger

```bash
gh workflow run release-please.yml
```

## Package Information

- **Service User**: `boxvault` (created during installation)
- **Configuration**: `/etc/boxvault/*.config.yaml`
- **Data Directory**: `/var/lib/boxvault/`
- **Upload Directory**: `/var/lib/boxvault/uploads/`
- **Log Directory**: `/var/log/boxvault/`
- **Service**: `systemctl {start|stop|status|restart} boxvault`
- **Default Access**: `http://localhost:3000`

## Troubleshooting

### Common Build Errors

1. **Cannot find module '/opt/boxvault/app/...'**
   - ❌ Missing `backend/app` in copy command
   - ✅ Fix: Ensure `backend/app` is copied to package

2. **Cannot stat 'frontend/dist'**
   - ❌ Frontend not built
   - ✅ Fix: Run `cd frontend && npm run build` before packaging

3. **Database connection errors**
   - ❌ MySQL/MariaDB not installed or configured
   - ✅ Fix: Install database and update `/etc/boxvault/db.config.yaml`

### Service Issues

```bash
# Check logs
sudo journalctl -fu boxvault

# Check configs
sudo ls -la /etc/boxvault/
sudo cat /etc/boxvault/app.config.yaml

# Restart service
sudo systemctl restart boxvault
```

### Uninstall

```bash
sudo systemctl stop boxvault
sudo apt remove boxvault
sudo apt autoremove

# Purge all data and configs
sudo apt purge boxvault
```
