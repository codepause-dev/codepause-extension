#!/bin/bash
# Final rebuild script - forces Electron 34.0.0 build with all caches cleared

set -e

echo "🔧 Final rebuild for VS Code 1.85.0 (Electron 34.0.0, NODE_MODULE_VERSION 136)"
echo "=============================================================================="
echo ""

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Nuclear option: clean everything
echo "1. Cleaning ALL caches and build artifacts..."
rm -rf node_modules/better-sqlite3/build
rm -rf node_modules/.cache
rm -rf .node-gyp
rm -rf ~/.node-gyp
rm -rf ~/.electron
rm -rf ~/Library/Caches/node-gyp/34.0.0
echo "   ✓ Cleaned"

# Ensure we're in the right directory
cd node_modules/better-sqlite3

echo ""
echo "2. Building for Electron 34.0.0 (NODE_MODULE_VERSION 136)..."
echo "   This will download Electron 34.0.0 headers if needed"
echo ""

# Set all environment variables explicitly
export npm_config_target=34.0.0
export npm_config_runtime=electron
export npm_config_disturl=https://electronjs.org/headers
export npm_config_build_from_source=true
export npm_config_arch=x64
export npm_config_force_process_config=true
export ELECTRON_SKIP_BINARY_DOWNLOAD=0

# Build using node-gyp directly with explicit flags
npx --yes node-gyp rebuild \
  --target=34.0.0 \
  --arch=x64 \
  --disturl=https://electronjs.org/headers \
  --runtime=electron \
  --force

echo ""
echo "3. Verifying build..."
cd "$PROJECT_ROOT"

if [ -f "node_modules/better-sqlite3/build/Release/better_sqlite3.node" ]; then
    FILE_SIZE=$(ls -lh node_modules/better-sqlite3/build/Release/better_sqlite3.node | awk '{print $5}')
    FILE_DATE=$(ls -lT node_modules/better-sqlite3/build/Release/better_sqlite3.node | awk '{print $6, $7, $8, $9}')
    echo "   ✓ Module built successfully"
    echo "   Size: $FILE_SIZE"
    echo "   Date: $FILE_DATE"
    echo ""
    echo "✅ Build complete! Now reload VS Code:"
    echo "   Cmd+Shift+P → 'Developer: Reload Window'"
else
    echo "   ✗ Build failed - module not found"
    exit 1
fi

