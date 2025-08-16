#!/bin/bash
#
# BoxVault shutdown script for SMF
#

set -e

# Environment
export PATH="/opt/ooce/bin:/opt/ooce/node-22/bin:/usr/gnu/bin:/usr/bin:/usr/sbin:/sbin"

# PID file location (in user's home directory since we run as boxvault user)
PIDFILE="/var/lib/boxvault/boxvault.pid"

echo "Stopping BoxVault Vagrant Box Repository Management System..."

# Check if PID file exists
if [ ! -f "$PIDFILE" ]; then
    echo "PID file $PIDFILE not found. BoxVault may not be running."
    # Check for any running boxvault processes
    PIDS=$(pgrep -f "node.*server.js" 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        echo "Found BoxVault processes: $PIDS"
        echo "Attempting to stop them..."
        for pid in $PIDS; do
            kill $pid 2>/dev/null || true
        done
        sleep 2
        # Force kill if still running
        for pid in $PIDS; do
            if kill -0 $pid 2>/dev/null; then
                echo "Force killing process $pid"
                kill -9 $pid 2>/dev/null || true
            fi
        done
    fi
    exit 0
fi

# Read PID from file
PID=$(cat "$PIDFILE")

# Check if process is actually running
if ! kill -0 "$PID" 2>/dev/null; then
    echo "Process with PID $PID is not running. Removing stale PID file."
    rm -f "$PIDFILE"
    exit 0
fi

echo "Sending TERM signal to BoxVault (PID: $PID)..."
kill -TERM "$PID"

# Wait for graceful shutdown (up to 15 seconds)
TIMEOUT=15
COUNT=0
while kill -0 "$PID" 2>/dev/null && [ $COUNT -lt $TIMEOUT ]; do
    sleep 1
    COUNT=$((COUNT + 1))
    if [ $((COUNT % 5)) -eq 0 ]; then
        echo "Waiting for graceful shutdown... ($COUNT/$TIMEOUT seconds)"
    fi
done

# Check if process is still running
if kill -0 "$PID" 2>/dev/null; then
    echo "Process did not terminate gracefully. Sending KILL signal..."
    kill -KILL "$PID" 2>/dev/null || true
    sleep 1
    
    # Final check
    if kill -0 "$PID" 2>/dev/null; then
        echo "Error: Unable to stop BoxVault process (PID: $PID)" >&2
        exit 1
    fi
fi

# Remove PID file
rm -f "$PIDFILE"

echo "BoxVault stopped successfully."
exit 0
