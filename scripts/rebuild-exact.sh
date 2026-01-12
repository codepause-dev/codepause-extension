#!/bin/bash
# Rebuild for exact Electron version - use this after running diagnose-vscode.js

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <electron-version>"
    echo ""
    echo "Example: $0 34.0.0"
    echo ""
    echo "To find your VS Code's Electron version:"
    echo "1. Open VS Code"
    echo "2. Cmd+Shift+P → 'Developer: Toggle Developer Tools'"
    echo "3. Console tab → Run: console.log(process.versions.electron)"
    echo ""
    echo "Or check NODE_MODULE_VERSION:"
    echo "Console → Run: console.log(process.versions.modules)"
    echo "Then map it:"
    echo "  136 = Electron 34.x (Node.js 24.x)"
    echo "  132 = Electron 33.x (Node.js 22.x)"
    echo "  130 = Electron 33.x (Node.js 22.x)"
    echo "  128 = Electron 32.x"
    exit 1
fi

ELECTRON_VERSION=$1
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "🔧 Rebuilding for Electron $ELECTRON_VERSION"
echo "=============================================="
echo ""

# Clean everything
echo "1. Cleaning all caches..."
rm -rf node_modules/better-sqlite3/build
rm -rf node_modules/.cache
rm -rf .node-gyp
rm -rf ~/.node-gyp
rm -rf ~/.electron
rm -rf ~/Library/Caches/node-gyp/$ELECTRON_VERSION
rm -rf ~/Library/Caches/electron
echo "   ✓ Cleaned"

# Rebuild with exact version
echo ""
echo "2. Rebuilding better-sqlite3 for Electron $ELECTRON_VERSION..."
echo "   (This may take a few minutes)"
echo ""

cd node_modules/better-sqlite3
rm -rf build

# Use @electron/rebuild (newer, recommended)
cd "$PROJECT_ROOT"
npx @electron/rebuild@latest -f -w better-sqlite3 --version=$ELECTRON_VERSION

echo ""
echo "3. Verifying..."
cd "$PROJECT_ROOT"

if [ -f "node_modules/better-sqlite3/build/Release/better_sqlite3.node" ]; then
    FILE_SIZE=$(ls -lh node_modules/better-sqlite3/build/Release/better_sqlite3.node | awk '{print $5}')
    FILE_DATE=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" node_modules/better-sqlite3/build/Release/better_sqlite3.node 2>/dev/null || ls -lT node_modules/better-sqlite3/build/Release/better_sqlite3.node | awk '{print $6, $7, $8, $9}')
    echo "   ✓ Module built successfully"
    echo "   Size: $FILE_SIZE"
    echo "   Date: $FILE_DATE"
    echo ""
    echo "✅ Build complete!"
    echo ""
    echo "📋 Next steps:"
    echo "   1. Reload VS Code: Cmd+Shift+P → 'Developer: Reload Window'"
    echo "   2. Check if extension activates without errors"
else
    echo "   ✗ Build failed - module not found"
    exit 1
fi


