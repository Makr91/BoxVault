#!/bin/bash
# BoxVault Certbot Deploy Hook
# Automatically copies renewed Let's Encrypt certificates to BoxVault SSL directory
# This script is called by Certbot after successful certificate renewal

set -e

LOG_TAG="boxvault-certbot-hook"

# Logging functions
log_info() {
    logger -t "$LOG_TAG" "INFO: $1"
    echo "INFO: $1"
}

log_error() {
    logger -t "$LOG_TAG" "ERROR: $1"
    echo "ERROR: $1" >&2
}

log_info "BoxVault Certbot deploy hook starting"

# Step 1: Find BoxVault configuration directory
# Use the same logic as BoxVault service to find CONFIG_DIR
CONFIG_DIR=$(systemctl show boxvault -p Environment 2>/dev/null | grep -o 'CONFIG_DIR=[^[:space:]]*' | cut -d= -f2)

# Fallback to default if not found
if [ -z "$CONFIG_DIR" ]; then
    CONFIG_DIR="/etc/boxvault"
fi

CONFIG_FILE="$CONFIG_DIR/app.config.yaml"

log_info "Using BoxVault config directory: $CONFIG_DIR"

# Step 2: Verify BoxVault configuration file exists
if [ ! -f "$CONFIG_FILE" ]; then
    log_error "BoxVault configuration file not found: $CONFIG_FILE"
    exit 1
fi

if [ ! -r "$CONFIG_FILE" ]; then
    log_error "Cannot read BoxVault configuration file: $CONFIG_FILE"
    exit 1
fi

# Step 3: Extract domain from BoxVault configuration
log_info "Extracting domain from BoxVault configuration"

DOMAIN=$(python3 -c "
import yaml
import urllib.parse
import sys

try:
    with open('$CONFIG_FILE', 'r') as f:
        config = yaml.safe_load(f)
    
    # Get origin URL from BoxVault config
    origin_url = config['boxvault']['origin']
    
    # Extract domain (e.g., 'https://boxvault.example.com' -> 'boxvault.example.com')
    parsed_url = urllib.parse.urlparse(origin_url)
    domain = parsed_url.netloc
    
    if not domain:
        print('No domain found in origin URL', file=sys.stderr)
        sys.exit(1)
    
    print(domain)
    
except KeyError as e:
    print(f'Configuration key not found: {e}', file=sys.stderr)
    sys.exit(1)
except yaml.YAMLError as e:
    print(f'YAML parsing error: {e}', file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f'Unexpected error: {e}', file=sys.stderr)
    sys.exit(1)
")

if [ $? -ne 0 ] || [ -z "$DOMAIN" ]; then
    log_error "Failed to extract domain from BoxVault configuration"
    exit 1
fi

log_info "BoxVault domain detected: $DOMAIN"

SSL_PATHS=$(python3 -c "
import yaml
import sys

try:
    with open('$CONFIG_FILE', 'r') as f:
        config = yaml.safe_load(f)
    print(config['ssl']['cert_path'])
    print(config['ssl']['key_path'])
except KeyError as e:
    print(f'Configuration key not found: {e}', file=sys.stderr)
    sys.exit(1)
except yaml.YAMLError as e:
    print(f'YAML parsing error: {e}', file=sys.stderr)
    sys.exit(1)
")

CERT_PATH=$(echo "$SSL_PATHS" | sed -n 1p)
KEY_PATH=$(echo "$SSL_PATHS" | sed -n 2p)

if [ -z "$CERT_PATH" ] || [ -z "$KEY_PATH" ]; then
    log_error "Failed to read ssl.cert_path and ssl.key_path from BoxVault configuration"
    exit 1
fi

log_info "BoxVault certificate path: $CERT_PATH"
log_info "BoxVault key path: $KEY_PATH"

# Step 4: Check if Let's Encrypt certificates exist for this domain
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"

if [ ! -d "$CERT_DIR" ]; then
    log_info "No Let's Encrypt certificate directory found for domain $DOMAIN, skipping"
    exit 0
fi

if [ ! -f "$CERT_DIR/fullchain.pem" ] || [ ! -f "$CERT_DIR/privkey.pem" ]; then
    log_info "Certificate files not found for domain $DOMAIN, skipping"
    exit 0
fi

log_info "Found Let's Encrypt certificates for domain $DOMAIN"

# Step 5: Create BoxVault SSL directory if it doesn't exist
for SSL_DIR in "$(dirname "$CERT_PATH")" "$(dirname "$KEY_PATH")"; do
    if [ ! -d "$SSL_DIR" ]; then
        log_info "Creating BoxVault SSL directory: $SSL_DIR"
        mkdir -p "$SSL_DIR"
    fi
done

# Step 6: Copy certificates to BoxVault SSL directory
log_info "Copying certificates to BoxVault SSL directory"

cp "$CERT_DIR/fullchain.pem" "$CERT_PATH"
cp "$CERT_DIR/privkey.pem" "$KEY_PATH"

# Step 7: Set proper ownership and permissions
log_info "Setting proper ownership and permissions"

chown boxvault:boxvault "$CERT_PATH" "$KEY_PATH"
chmod 644 "$CERT_PATH"
chmod 600 "$KEY_PATH"

log_info "Certificates copied successfully"

# Step 8: Restart BoxVault service to reload certificates
if systemctl is-active --quiet boxvault; then
    log_info "Restarting BoxVault service to reload certificates"
    systemctl restart boxvault
    
    # Wait a moment and check if service started successfully
    sleep 2
    if systemctl is-active --quiet boxvault; then
        log_info "BoxVault service restarted successfully"
    else
        log_error "BoxVault service failed to restart"
        exit 1
    fi
else
    log_info "BoxVault service is not running, skipping restart"
fi

log_info "Certificate deployment completed successfully for domain: $DOMAIN"
