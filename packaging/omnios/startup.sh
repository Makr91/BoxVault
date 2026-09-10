#!/bin/bash
#
# BoxVault startup script for SMF
#

set -e

export PATH="/opt/ooce/bin:/opt/ooce/node-22/bin:/usr/gnu/bin:/usr/bin:/usr/sbin:/sbin"
export CONFIG_DIR="${CONFIG_DIR:-/etc/boxvault}"
export HOME="${HOME:-/var/lib/boxvault}"

cd /opt/boxvault

mkdir -p /var/lib/boxvault/database
mkdir -p /var/log/boxvault

if ! command -v node >/dev/null 2>&1; then
    echo "Error: Node.js not found in PATH" >&2
    exit 1
fi

if [ ! -f "/opt/boxvault/server.js" ]; then
    echo "Error: BoxVault application not found at /opt/boxvault/server.js" >&2
    exit 1
fi

if [ ! -d "$CONFIG_DIR" ]; then
    echo "Error: Configuration directory not found at $CONFIG_DIR" >&2
    exit 1
fi

for config_file in app.config.yaml auth.config.yaml db.config.yaml mail.config.yaml; do
    if [ ! -f "$CONFIG_DIR/$config_file" ]; then
        echo "Error: $config_file not found in $CONFIG_DIR" >&2
        exit 1
    fi
done

node scripts/migrate-config.js

echo "Starting BoxVault Vagrant Box Repository Management System..."
echo "Node.js version: $(node --version)"
echo "Configuration: $CONFIG_DIR"

exec node server.js
