#!/usr/bin/bash
#
# CDDL HEADER START
#
# The contents of this file are subject to the terms of the
# Common Development and Distribution License, Version 1.0 only
# (the "License").  You may not use this file except in compliance
# with the License.
#
# You can obtain a copy of the license at usr/src/OPENSOLARIS.LICENSE
# or http://www.opensolaris.org/os/licensing.
# See the License for the specific language governing permissions
# and limitations under the License.
#
# When distributing Covered Code, include this CDDL HEADER in each
# file and include the License file at usr/src/OPENSOLARIS.LICENSE.
# If applicable, add the following below this CDDL HEADER, with the
# fields enclosed by brackets "[]" replaced with your own identifying
# information: Portions Copyright [yyyy] [name of copyright owner]
#
# CDDL HEADER END
#
#
# Copyright 2025 Makr91. All rights reserved.
# Use is subject to license terms.
#

set -e

# Simple logging functions
logmsg() { echo "=== $*"; }
logcmd() { echo ">>> $*"; "$@"; }
logerr() { echo "ERROR: $*" >&2; }

# Set up variables
SRCDIR="$(pwd)"
DESTDIR="${SRCDIR}/proto"
PROG=boxvault
VER=$(node -p "require('./package.json').version" 2>/dev/null || echo "1.0.0")
PKG=application/management/boxvault

# Clean and create staging directory
rm -rf "$DESTDIR"
mkdir -p "$DESTDIR"

#### Build Structure
# /opt/boxvault/
#   # Node.js application files
#   server.js
#   package.json
#   app/
#   frontend/dist/
#   node_modules/
#   startup.sh
#   shutdown.sh
# /etc/boxvault/
#   app.config.yaml
#   auth.config.yaml
#   db.config.yaml
#   mail.config.yaml
# /var/lib/boxvault/
# /var/log/boxvault/

build_app() {
    logmsg "Building BoxVault frontend"
    
    # Set up environment for OmniOS/Solaris
    export MAKE=gmake
    export CC=gcc
    export CXX=g++
    
    # Sync versions
    logcmd npm run sync-versions
    
    # Install backend dependencies
    pushd backend >/dev/null
    MAKE=gmake logcmd npm ci
    popd >/dev/null
    
    # Install frontend dependencies
    pushd frontend >/dev/null
    # Remove package-lock.json to ensure clean dependency resolution
    rm -f package-lock.json
    MAKE=gmake logcmd npm install
    popd >/dev/null
    
    # Build frontend
    pushd frontend >/dev/null
    logcmd npm run build
    popd >/dev/null
    
    # Install production dependencies only
    pushd backend >/dev/null
    MAKE=gmake logcmd npm ci --omit=dev
    popd >/dev/null
}

install_app() {
    pushd $DESTDIR >/dev/null

    # Create main application directory
    logcmd mkdir -p opt/boxvault
    pushd opt/boxvault >/dev/null

    # Copy application files
    logmsg "Installing BoxVault application files"
    logcmd cp $SRCDIR/backend/server.js .
    logcmd cp $SRCDIR/backend/package.json .
    logcmd cp $SRCDIR/LICENSE.md .
    
    # Copy backend application directory
    if [ -d "$SRCDIR/backend/app" ]; then
        logcmd cp -r $SRCDIR/backend/app .
    fi
    
    # Copy built frontend
    if [ -d "$SRCDIR/frontend/dist" ]; then
        logcmd mkdir -p frontend
        logcmd cp -r $SRCDIR/frontend/dist frontend/
    fi
    
    # Copy node_modules (production only)
    if [ -d "$SRCDIR/backend/node_modules" ]; then
        logcmd cp -r $SRCDIR/backend/node_modules .
    fi
    
    # Copy SMF method scripts
    logcmd cp $SRCDIR/packaging/omnios/startup.sh .
    logcmd cp $SRCDIR/packaging/omnios/shutdown.sh .
    logcmd chmod 755 startup.sh shutdown.sh
    
    popd >/dev/null # /opt/boxvault

    # Install configuration
    logmsg "Installing configuration files"
    logcmd mkdir -p etc/boxvault
    logcmd cp $SRCDIR/packaging/config/app.config.yaml etc/boxvault/
    logcmd cp $SRCDIR/packaging/config/auth.config.yaml etc/boxvault/
    logcmd cp $SRCDIR/packaging/config/db.config.yaml etc/boxvault/
    logcmd cp $SRCDIR/packaging/config/mail.config.yaml etc/boxvault/

    # Create data and log directories
    logcmd mkdir -p var/lib/boxvault
    logcmd mkdir -p var/log/boxvault

    # Install SMF manifest
    logmsg "Installing SMF manifest"
    logcmd mkdir -p lib/svc/manifest/application
    logcmd cp $SRCDIR/packaging/omnios/boxvault-smf.xml lib/svc/manifest/application/boxvault.xml

    popd >/dev/null # $DESTDIR
}

post_install() {
    logmsg "--- Setting up BoxVault staging directory"
    
    pushd $DESTDIR >/dev/null
    
    # Create SSL directory (certificates will be generated during installation)
    logcmd mkdir -p etc/boxvault/ssl
    
    # Create database directory
    logcmd mkdir -p var/lib/boxvault/database

    popd >/dev/null
    
    logmsg "BoxVault staging setup completed"
}

# Main build process
logmsg "Starting BoxVault build process"
build_app
install_app
post_install

# Create the complete package
logmsg "Creating IPS package"
cd "$SRCDIR"
export VERSION="$VER"
sed "s/@VERSION@/${VERSION}/g" packaging/omnios/boxvault.p5m > boxvault.p5m.tmp
pkgsend generate proto | pkgfmt > boxvault.p5m.generated
pkgmogrify -DVERSION="${VERSION}" boxvault.p5m.tmp boxvault.p5m.generated > boxvault.p5m.final

# Create temporary local repository
TEMP_REPO="${SRCDIR}/temp-repo"
rm -rf "$TEMP_REPO"
pkgrepo create "$TEMP_REPO"
pkgrepo set -s "$TEMP_REPO" publisher/prefix=Makr91

# Publish package to temporary repository
pkgsend -s "file://${TEMP_REPO}" publish -d proto boxvault.p5m.final

# Create .p5p package archive
PACKAGE_FILE="boxvault-${VERSION}.p5p"
pkgrecv -s "file://${TEMP_REPO}" -a -d "${PACKAGE_FILE}" "${PKG}"

# Clean up temporary repository
rm -rf "$TEMP_REPO"

logmsg "Package build completed: ${PACKAGE_FILE}"
logmsg "Complete package ready for upload to GitHub artifacts"

# Vim hints
# vim:ts=4:sw=4:et:
