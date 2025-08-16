# Building Zoneweaver OmniOS IPS Packages

Production-ready OmniOS IPS package build process for Zoneweaver.

## Build Methods

There are two approaches for building Zoneweaver OmniOS packages:

### Method 1: OmniOS Build Framework (Recommended)
If you're using the OmniOS build framework (omniosorg/omnios-build), place the Zoneweaver source in the build tree and use the provided `build.sh` script.

### Method 2: Manual Build Process
Traditional manual building using direct IPS commands.

## Prerequisites

On your OmniOS build system:

```bash
pfexec pkg install ooce/runtime/node-22 database/sqlite-3
```

## Package Information

- **Package Name:** `system/virtualization/zoneweaver`
- **Publisher:** `Makr91`
- **Service FMRI:** `svc:/system/virtualization/zoneweaver:default`
- **Install Path:** `/opt/zoneweaver/`
- **Config Path:** `/etc/zoneweaver/config.yaml`
- **User/Group:** `zoneweaver`

## Method 1: OmniOS Build Framework

If you're using the OmniOS build framework, follow these steps:

### Setup in Build Tree
```bash
# Place Zoneweaver in your build tree (example path)
cd /path/to/omnios-build/build
mkdir zoneweaver
cd zoneweaver

# Copy Zoneweaver source
cp -r /path/to/zoneweaver-source/* .

# The build.sh script expects these files:
# - build.sh (provided)
# - local.mog (provided)  
# - zoneweaver-smf.xml (SMF manifest)
# - startup.sh, shutdown.sh (method scripts)
# - All source files (controllers, models, etc.)
```

### Build with Framework
```bash
# From the zoneweaver directory in build tree
./build.sh

# This will:
# 1. Download/prepare source (if needed)
# 2. Run npm to build frontend and install dependencies
# 3. Create package structure in $DESTDIR
# 4. Generate and publish IPS package
```

### Integration Notes
- The `build.sh` script follows OmniOS build framework conventions
- Version is automatically extracted from `package.json`
- Dependencies are handled via `BUILD_DEPENDS_IPS` and `RUN_DEPENDS_IPS`
- SMF manifest and method scripts are automatically installed
- Package name: `system/virtualization/zoneweaver`

## Method 2: Manual Build Commands

### 1. Build Application (On OmniOS)
```bash
cd /Array-0/zoneweaver/frontend

# Build the frontend first  
export PATH="/opt/ooce/bin:/opt/ooce/node-22/bin:$PATH"
npm run sync-versions
MAKE=gmake npm ci
cd web && MAKE=gmake npm ci && cd ..
npm run build

# Install production Node.js dependencies (this removes dev dependencies)
MAKE=gmake npm ci --omit=dev

export VERSION=$(node -p "require('./package.json').version")
```

### 2. Build IPS Package
```bash
# Set version in manifest
sed -i "s/@VERSION@/${VERSION}/g" packaging/omnios/zoneweaver.p5m

# Generate package manifest from current directory
pkgsend generate . | pkgfmt > zoneweaver.p5m.generated

# Apply transforms and create final manifest
pkgmogrify -DVERSION=${VERSION} packaging/omnios/zoneweaver.p5m zoneweaver.p5m.generated > zoneweaver.p5m.final

# Create a local repository for testing (if needed)
mkdir -p /tmp/local-repo
pkgrepo create /tmp/local-repo
pkgrepo set -s /tmp/local-repo publisher/prefix=Makr91

# Publish to local repository
pkgsend publish -d . -s /tmp/local-repo zoneweaver.p5m.final
```

### 3. Install & Test Package
```bash
# Add your local repository
pfexec pkg set-publisher -g file:///tmp/local-repo Makr91

# Install the package
pfexec pkg install system/virtualization/zoneweaver

# Start the service
pfexec svcadm disable system/virtualization/zoneweaver

pfexec svcadm enable system/virtualization/zoneweaver

# Check status
svcs -l system/virtualization/zoneweaver

# Check logs
tail -f /var/svc/log/system-virtualization-zoneweaver:default.log

# Test web interface
curl https://localhost:3443
```

## Package Structure

The IPS package will create:

```
/opt/zoneweaver/                    # Application files
├── index.js                        # Main Node.js application  
├── package.json                    # Package metadata
├── controllers/                    # API controllers
├── models/                         # Data models
├── routes/                         # Route definitions
├── middleware/                     # Express middleware
├── config/                         # Configuration files
├── utils/                          # Utility functions
├── scripts/                        # Build/maintenance scripts
├── web/dist/                       # Built frontend files
├── node_modules/                   # Production dependencies
├── startup.sh                      # SMF start method
└── shutdown.sh                     # SMF stop method

/etc/zoneweaver/                    # Configuration
└── config.yaml                     # Production configuration

/var/lib/zoneweaver/                # Data directory
└── database.sqlite                 # SQLite database

/var/log/zoneweaver/                # Log directory

/lib/svc/manifest/system/           # SMF manifest
└── zoneweaver.xml
```

## Dependencies

The package depends on:
- `ooce/runtime/node-22` (Node.js runtime)
- `database/sqlite-3` (SQLite database)
- Standard OmniOS system packages

## User & Service Management

The package automatically:
- Creates `zoneweaver` user and group
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
   pkglint zoneweaver.p5m.final
   ```

### Service Issues

```bash
# Check service status
svcs -xv system/virtualization/zoneweaver

# View detailed logs
tail -f /var/svc/log/system-virtualization-zoneweaver:default.log

# Debug startup issues
/opt/zoneweaver/startup.sh

# Test Node.js directly
su - zoneweaver -c "cd /opt/zoneweaver && NODE_ENV=production CONFIG_PATH=/etc/zoneweaver/config.yaml node index.js"
```

### Network Issues

```bash
# Check if port 3443 is available
netstat -an | grep 3443

# Test with different port
# Edit /etc/zoneweaver/config.yaml

# Restart service
svcadm restart system/virtualization/zoneweaver
```

### Permission Issues

```bash
# Fix ownership
chown -R zoneweaver:zoneweaver /opt/zoneweaver
chown -R zoneweaver:zoneweaver /var/lib/zoneweaver
chown -R zoneweaver:zoneweaver /var/log/zoneweaver

# Fix permissions
chmod 755 /opt/zoneweaver/startup.sh
chmod 755 /opt/zoneweaver/shutdown.sh
```

## Service Management

```bash
# Start service
svcadm enable system/virtualization/zoneweaver

# Stop service  
svcadm disable system/virtualization/zoneweaver

# Restart service
svcadm restart system/virtualization/zoneweaver

# View service status
svcs -l system/virtualization/zoneweaver

# Clear maintenance state
svcadm clear system/virtualization/zoneweaver
```

## Uninstall

```bash
# Stop and disable service
svcadm disable system/virtualization/zoneweaver

# Remove package
pkg uninstall system/virtualization/zoneweaver

# Clean up any remaining files (optional)
rm -rf /var/lib/zoneweaver
rm -rf /var/log/zoneweaver
```

## Version Management

The package version is automatically synchronized with the main `package.json` via the build process. The SMF service will show the current version in its description.

## Default Access

After installation, Zoneweaver will be available at:
- **HTTPS:** `https://localhost:3443` (default)
- **Configuration:** `/etc/zoneweaver/config.yaml`

The default configuration can be customized before starting the service.
