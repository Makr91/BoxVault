#!/bin/bash
#
# BoxVault startup script for SMF
#

set -e

# Environment is set by SMF, but ensure we have the basics
export PATH="/opt/ooce/bin:/opt/ooce/node-22/bin:/usr/gnu/bin:/usr/bin:/usr/sbin:/sbin"
export NODE_ENV="${NODE_ENV:-production}"
export CONFIG_DIR="${CONFIG_DIR:-/etc/boxvault}"
export CONFIG_PATH="${CONFIG_DIR}"
export HOME="${HOME:-/var/lib/boxvault}"

cd /opt/boxvault

PIDFILE="/var/lib/boxvault/boxvault.pid"

# Create runtime directories following IPS best practices
# These are unpackaged content - preserved across package operations
mkdir -p /var/lib/boxvault/database
mkdir -p /etc/boxvault/ssl
mkdir -p /var/log/boxvault

# Set proper ownership for runtime directories
chown -R boxvault:boxvault /var/lib/boxvault
chown -R boxvault:boxvault /etc/boxvault/ssl
chown -R boxvault:boxvault /var/log/boxvault

# Set proper permissions for SSL directory (more restrictive)
chmod 700 /etc/boxvault/ssl

# Check if JWT secret exists (SSL certificates will be handled by Node.js if needed)
if [ ! -f "/etc/boxvault/.jwt-secret" ]; then
    echo "Warning: JWT secret not found. Node.js may generate default secrets." >&2
fi

# Check if Node.js is available
if ! command -v node >/dev/null 2>&1; then
    echo "Error: Node.js not found in PATH" >&2
    exit 1
fi

# Check if main application file exists
if [ ! -f "/opt/boxvault/server.js" ]; then
    echo "Error: BoxVault application not found at /opt/boxvault/server.js" >&2
    exit 1
fi

# Check if configuration directory exists
if [ ! -d "$CONFIG_PATH" ]; then
    echo "Error: Configuration directory not found at $CONFIG_PATH" >&2
    exit 1
fi

# Check if essential configuration files exist
if [ ! -f "$CONFIG_PATH/db.config.yaml" ]; then
    echo "Error: Database configuration not found at $CONFIG_PATH/db.config.yaml" >&2
    exit 1
fi

if [ ! -f "$CONFIG_PATH/app.config.yaml" ]; then
    echo "Error: Application configuration not found at $CONFIG_PATH/app.config.yaml" >&2
    exit 1
fi

if [ ! -f "$CONFIG_PATH/auth.config.yaml" ]; then
    echo "Error: Authentication configuration not found at $CONFIG_PATH/auth.config.yaml" >&2
    exit 1
fi

# Remove stale PID file if it exists
if [ -f "$PIDFILE" ]; then
    if ! kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
        echo "Removing stale PID file $PIDFILE"
        rm -f "$PIDFILE"
    else
        echo "Error: BoxVault appears to be already running (PID $(cat "$PIDFILE"))" >&2
        exit 1
    fi
fi

echo "Starting BoxVault Vagrant Box Repository Management System..."
echo "Node.js version: $(node --version)"
echo "Configuration: $CONFIG_PATH"
echo "Environment: $NODE_ENV"

# Start the Node.js application in the background
# Output goes to log file so we can see SSL generation messages
nohup node server.js </dev/null >>/var/log/boxvault/boxvault.log 2>&1 &
NODE_PID=$!

# Save the PID
echo $NODE_PID > "$PIDFILE"

# Give it a moment to start and check if it's still running
sleep 2
if ! kill -0 $NODE_PID 2>/dev/null; then
    echo "Error: BoxVault failed to start" >&2
    rm -f "$PIDFILE"
    exit 1
fi

echo "BoxVault started successfully with PID $NODE_PID"
echo "Log output will be available via SMF logging"
echo "Access the web interface at https://localhost:3000"

exit 0
