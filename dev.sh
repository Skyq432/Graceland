#!/usr/bin/env bash
# Start the local preview server with live reload.
# Usage: ./dev.sh [port]
cd "$(dirname "$0")" && node dev-server.js "${1:-5500}"
