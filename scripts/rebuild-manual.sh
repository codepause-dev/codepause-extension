#!/bin/bash
# Manual rebuild script for better-sqlite3 when electron-rebuild fails
# This bypasses electron-rebuild and builds directly

set -e

echo "🔧 Manual rebuild of better-sqlite3"
echo "===================================="
echo ""

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Clean build
echo "1. Cleaning previous build..."
rm -rf node_modules/better-sqlite3/build
rm -rf node_modules/.cache

# Option 1: Use node-gyp directly
echo ""
echo "2. Attempting direct build with node-gyp..."
cd node_modules/better-sqlite3

# Set Electron version (VS Code 1.85 uses Electron 34.x with Node.js 24.x, MODULE_VERSION 136)
export npm_config_target=34.0.0
export npm_config_runtime=electron
export npm_config_disturl=https://electronjs.org/headers
export npm_config_build_from_source=true
export npm_config_arch=x64  # Intel Mac uses x64 architecture

# Try to build
if npm run build-release 2>&1; then
    echo ""
    echo "✓ Build successful!"
    cd "$PROJECT_ROOT"
    exit 0
fi

# Option 2: Reinstall and rebuild
echo ""
echo "3. Reinstalling better-sqlite3..."
cd "$PROJECT_ROOT"
npm uninstall better-sqlite3
npm install better-sqlite3

cd node_modules/better-sqlite3
export npm_config_target=34.0.0
export npm_config_runtime=electron
export npm_config_disturl=https://electronjs.org/headers
export npm_config_build_from_source=true

if npm run build-release 2>&1; then
    echo ""
    echo "✓ Build successful after reinstall!"
    cd "$PROJECT_ROOT"
    exit 0
fi

echo ""
echo "✗ Manual build failed"
echo "Try checking:"
echo "  - Internet connection"
echo "  - Proxy settings"
echo "  - Node.js version (should be 24.x)"
cd "$PROJECT_ROOT"
exit 1

