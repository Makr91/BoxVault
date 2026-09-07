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
# Fetch the pinned STARTcloud UI artifact into backend/ui
UI_VERSION=$(node -p "require('./backend/package.json').startcloudUiVersion")
mkdir -p backend/ui
curl -fsSL "https://github.com/STARTcloud/startcloud-ui/releases/download/v${UI_VERSION}/startcloud-ui-${UI_VERSION}.tar.gz" | tar -xz -C backend/ui

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
mkdir -p "${PACKAGE_NAME}_${VERSION}_${ARCH}"/{opt/boxvault/config-templates,opt/boxvault/scripts,etc/systemd/system,var/lib/boxvault,var/log/boxvault,DEBIAN}
```

### 3. Copy Application Files

```bash
# Backend application files and the fetched UI to /opt/boxvault
cp -r backend/app backend/scripts backend/server.js backend/package.json backend/ui "${PACKAGE_NAME}_${VERSION}_${ARCH}/opt/boxvault/"
cp -r backend/node_modules "${PACKAGE_NAME}_${VERSION}_${ARCH}/opt/boxvault/"

# Configuration files
cp packaging/config/*.yaml "${PACKAGE_NAME}_${VERSION}_${ARCH}/opt/boxvault/config-templates/"
cp packaging/scripts/certbot-deploy-hook.sh "${PACKAGE_NAME}_${VERSION}_${ARCH}/opt/boxvault/scripts/"

# Systemd service
cp packaging/DEBIAN/systemd/boxvault.service "${PACKAGE_NAME}_${VERSION}_${ARCH}/etc/systemd/system/"

# DEBIAN control files
cp packaging/DEBIAN/{preinst,postinst,prerm,postrm} "${PACKAGE_NAME}_${VERSION}_${ARCH}/DEBIAN/"
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
Maintainer: Makr91 <makr91@users.noreply.github.com>
Depends: nodejs (>= 22.0.0), sqlite3, openssl
Description: BoxVault - Vagrant Box Repository Management System
 Comprehensive Vagrant box repository management system for managing,
 organizing, and distributing Vagrant boxes.
Homepage: https://github.com/Makr91/BoxVault
EOF
```

### 5. Set Permissions

```bash
# Set proper permissions
find "${PACKAGE_NAME}_${VERSION}_${ARCH}" -type d -exec chmod 755 {} \;
find "${PACKAGE_NAME}_${VERSION}_${ARCH}" -type f -exec chmod 644 {} \;
chmod 755 "${PACKAGE_NAME}_${VERSION}_${ARCH}/DEBIAN"/{preinst,postinst,prerm,postrm}
chmod 755 "${PACKAGE_NAME}_${VERSION}_${ARCH}/opt/boxvault/scripts"/*
```

### 6. Build & Install Package

```bash
# Build .deb package
dpkg-deb --build "${PACKAGE_NAME}_${VERSION}_${ARCH}" "${PACKAGE_NAME}_${VERSION}_${ARCH}.deb"

# Install package
sudo gdebi -n "${PACKAGE_NAME}_${VERSION}_${ARCH}.deb"

# Start service
sudo systemctl enable --now boxvault

# Check status
sudo systemctl status boxvault
```

`postinst` prints the setup token at the end of a fresh install; open `https://localhost` and complete first-run setup with it.

## Critical Build Notes

### ⚠️ Required Directories

**Must include these directories in the copy command or the package will fail:**

- `backend/app/` - Contains all backend application code
- `backend/scripts/` - The config migration `postinst` runs on every upgrade
- `backend/node_modules/` - Backend dependencies
- `backend/ui/` - The STARTcloud UI artifact pinned by `startcloudUiVersion` in `backend/package.json`
- `packaging/config/*.yaml` into `opt/boxvault/config-templates/` - `postinst` installs `/etc/boxvault/*.config.yaml` from them on a fresh install
- `packaging/DEBIAN/preinst` beside `postinst`, `prerm` and `postrm`

### 🔧 Systemd Service

The service includes:

- **Environment variable** (`CONFIG_DIR=/etc/boxvault`)
- **Security restrictions** (NoNewPrivileges, ProtectSystem, etc.)
- **MySQL ordering** (starts after mysql.service)

### 📁 Configuration Files

BoxVault uses multiple configuration files:

- `app.config.yaml` - Main application settings
- `auth.config.yaml` - JWT and authentication settings
- `db.config.yaml` - Database connection settings
- `mail.config.yaml` - SMTP mail configuration

## Database Setup

**SQLite is the packaged default** (`database_type: sqlite`, `/var/lib/boxvault/database/boxvault.db`), so no database server is needed. MySQL is optional: install it, then pick `mysql` and the connection on the setup page or in `/etc/boxvault/db.config.yaml`.

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

`release-please.yml` runs on every push to `main` and has no manual trigger. The package build can be re-run for an existing release tag:

```bash
gh workflow run prod-build.yml -f version=0.79.0 -f tag_name=v0.79.0
```

## Package Information

- **Service User**: `boxvault` (created during installation)
- **Configuration**: `/etc/boxvault/*.config.yaml`
- **Setup Token**: `/etc/boxvault/setup.token`
- **Data Directory**: `/var/lib/boxvault/`
- **Upload Directory**: `/var/lib/boxvault/uploads/`
- **Log Directory**: `/var/log/boxvault/`
- **Service**: `systemctl {start|stop|status|restart} boxvault`
- **Default Access**: `http://localhost` and `https://localhost` (ports 80 and 443 from `app.config.yaml`)

## Troubleshooting

### Common Build Errors

1. **Cannot find module '/opt/boxvault/app/...'**
   - ❌ Missing `backend/app` in copy command
   - ✅ Fix: Ensure `backend/app` is copied to package

2. **Cannot stat 'backend/ui'**
   - ❌ UI artifact not fetched
   - ✅ Fix: Run the fetch step in "Prepare Application" before packaging

3. **Database connection errors**
   - ❌ `database_type: mysql` chosen but MySQL/MariaDB not installed or configured
   - ✅ Fix: Install the database and update `/etc/boxvault/db.config.yaml`, or keep SQLite

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
