# Building BoxVault OmniOS IPS Packages

Production-ready OmniOS IPS package build process for BoxVault.

## Build Methods

There are two approaches for building BoxVault OmniOS packages:

### Method 1: OmniOS Build Framework (Recommended)

If you're using the OmniOS build framework (omniosorg/omnios-build), place the BoxVault source in the build tree and use the provided `build.sh` script.

### Method 2: Manual Build Process

Traditional manual building using direct IPS commands.

## Prerequisites

On your OmniOS build system:

```bash
pfexec pkg install ooce/runtime/node-22 database/sqlite-3
```

## Package Information

- **Package Name:** `application/management/boxvault`
- **Publisher:** `Makr91`
- **Service FMRI:** `svc:/application/management/boxvault:default`
- **Install Path:** `/opt/boxvault/`
- **Config Path:** `/etc/boxvault/app.config.yaml`, `auth.config.yaml`, `db.config.yaml`, `mail.config.yaml`
- **User/Group:** `boxvault`

## Method 1: OmniOS Build Framework

If you're using the OmniOS build framework, follow these steps:

### Setup in Build Tree

```bash
# Place BoxVault in your build tree (example path)
cd /path/to/omnios-build/build
mkdir boxvault
cd boxvault

# Copy BoxVault source
cp -r /path/to/boxvault-source/* .

# The build.sh script expects these files:
# - build.sh (provided)
# - boxvault-smf.xml (SMF manifest)
# - startup.sh, shutdown.sh (method scripts)
# - All source files (controllers, models, etc.)
```

### Build with Framework

```bash
# From the boxvault directory in build tree
./build.sh

# This will:
# 1. Download/prepare source (if needed)
# 2. Fetch the pinned STARTcloud UI and install dependencies
# 3. Create package structure in $DESTDIR
# 4. Generate and publish IPS package
```

### Integration Notes

- The `build.sh` script follows OmniOS build framework conventions
- Version is automatically extracted from `package.json`
- Dependencies are handled via `BUILD_DEPENDS_IPS` and `RUN_DEPENDS_IPS`
- SMF manifest and method scripts are automatically installed
- Package name: `application/management/boxvault`
- Output: `boxvault-<version>.p5p` beside the source

## Method 2: Manual Build Commands

### 1. Build Application (On OmniOS)

```bash
cd /local/builds/boxvault

# Fetch the pinned STARTcloud UI first
export PATH="/opt/ooce/bin:/opt/ooce/node-22/bin:$PATH"
npm run sync-versions
MAKE=gmake npm ci
UI_VERSION=$(node -p "require('./backend/package.json').startcloudUiVersion")
mkdir -p backend/ui
curl -fsSL "https://github.com/STARTcloud/startcloud-ui/releases/download/v${UI_VERSION}/startcloud-ui-${UI_VERSION}.tar.gz" | tar -xz -C backend/ui

# Install production Node.js dependencies (this removes dev dependencies)
cd backend && MAKE=gmake npm ci --omit=dev && cd ..

export VERSION=$(node -p "require('./package.json').version")
```

### 2. Build IPS Package

```bash
# Set version in manifest
sed -i "s/@VERSION@/${VERSION}/g" packaging/omnios/boxvault.p5m

# Generate package manifest from current directory
pkgsend generate . | pkgfmt > boxvault.p5m.generated

# Apply transforms and create final manifest
pkgmogrify -DVERSION=${VERSION} packaging/omnios/boxvault.p5m boxvault.p5m.generated > boxvault.p5m.final

# Create a local repository for testing (if needed)
mkdir -p /tmp/local-repo
pkgrepo create /tmp/local-repo
pkgrepo set -s /tmp/local-repo publisher/prefix=Makr91

# Publish to local repository
pkgsend publish -d . -s /tmp/local-repo boxvault.p5m.final
```

### 3. Install & Test Package

```bash
# Add your local repository
pfexec pkg set-publisher -g file:///tmp/local-repo Makr91

# Install the package
pfexec pkg install application/management/boxvault

# Start the service
pfexec svcadm disable application/management/boxvault

pfexec svcadm enable application/management/boxvault

# Check status
svcs -l application/management/boxvault

# Check logs
tail -f /var/svc/log/application-management-boxvault:default.log

# Test web interface
curl -k https://localhost
```

## Package Structure

The IPS package will create:

```file
/opt/boxvault/                      # Application files
├── server.js                       # Main Node.js application
├── package.json                    # Package metadata
├── app/                            # Backend application
│   ├── controllers/                # API controllers
│   ├── models/                     # Data models
│   ├── routes/                     # Route definitions
│   ├── middleware/                 # Express middleware
│   ├── config/                     # Configuration files
│   └── utils/                      # Utility functions
├── scripts/
├── ui/                             # STARTcloud UI artifact
├── node_modules/                   # Production dependencies
├── startup.sh                      # SMF start method
└── shutdown.sh                     # SMF stop method

/etc/boxvault/                      # Configuration
├── app.config.yaml                 # Application configuration
├── auth.config.yaml                # Authentication configuration
├── db.config.yaml                  # Database configuration
└── mail.config.yaml                # Mail configuration

/var/lib/boxvault/                  # Data directory
└── database/                       # SQLite database directory

/var/log/boxvault/                  # Log directory

/lib/svc/manifest/application/      # SMF manifest
└── boxvault.xml
```

## Dependencies

The package depends on:

- `ooce/runtime/node-22` (Node.js runtime)
- `database/sqlite-3` (SQLite database)
- Standard OmniOS system packages

## User & Service Management

The package automatically:

- Creates `boxvault` user and group (uid and gid 303)
- Installs SMF service manifest
- Sets up proper file permissions
- Configures service dependencies

## Troubleshooting

### Build Errors

1. **Node.js not found:**

   ```bash
   export PATH="/opt/ooce/bin:/opt/ooce/node-22/bin:$PATH"
   ```

2. **npm install fails:**

   ```bash
   # Ensure you have the latest npm
   npm install -g npm@latest
   ```

3. **Package validation errors:**

   ```bash
   # Check manifest syntax
   pkglint boxvault.p5m.final
   ```

### Service Issues

```bash
# Check service status
svcs -xv application/management/boxvault

# View detailed logs
tail -f /var/svc/log/application-management-boxvault:default.log
tail -f /var/log/boxvault/boxvault.log

# Debug startup issues
/opt/boxvault/startup.sh

# Test Node.js directly
su - boxvault -c "cd /opt/boxvault && CONFIG_DIR=/etc/boxvault node server.js"
```

### Network Issues

```bash
# Check if ports 80 and 443 are available
netstat -an | grep -E ':(80|443) '

# Test with different ports
# Edit api_listen_port_unencrypted and api_listen_port_encrypted in /etc/boxvault/app.config.yaml

# Restart service
svcadm restart application/management/boxvault
```

### Permission Issues

```bash
# Fix ownership
chown -R boxvault:boxvault /opt/boxvault
chown -R boxvault:boxvault /var/lib/boxvault
chown -R boxvault:boxvault /var/log/boxvault

# Fix permissions
chmod 755 /opt/boxvault/startup.sh
chmod 755 /opt/boxvault/shutdown.sh
```

## Service Management

```bash
# Start service
svcadm enable application/management/boxvault

# Stop service
svcadm disable application/management/boxvault

# Restart service
svcadm restart application/management/boxvault

# View service status
svcs -l application/management/boxvault

# Clear maintenance state
svcadm clear application/management/boxvault
```

## Uninstall

```bash
# Stop and disable service
svcadm disable application/management/boxvault

# Remove package
pkg uninstall application/management/boxvault

# Clean up any remaining files (optional)
rm -rf /var/lib/boxvault
rm -rf /var/log/boxvault
```

## Version Management

The package version is automatically synchronized with the main `package.json` via the build process. The SMF service will show the current version in its description.

## Default Access

After installation, BoxVault will be available at:

- **HTTP:** `http://localhost` (port 80, redirecting to HTTPS once a certificate exists)
- **HTTPS:** `https://localhost` (port 443)
- **Configuration:** `/etc/boxvault/app.config.yaml`

The first start of the service generates `/etc/boxvault/setup.token` and broadcasts it with `wall`; its first-run message names port 80, the schema default, when it cannot read `api_listen_port_unencrypted` from the configuration. The default configuration can be customized before starting the service.
