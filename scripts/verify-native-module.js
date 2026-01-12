#!/usr/bin/env node
/**
 * Verify that better-sqlite3 is built for the correct Electron version
 */

const fs = require('fs');
const path = require('path');

const modulePath = path.join(__dirname, '..', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');

if (!fs.existsSync(modulePath)) {
  console.error('❌ better_sqlite3.node not found!');
  console.log('Run: npm run rebuild:vscode');
  process.exit(1);
}

const stats = fs.statSync(modulePath);
const size = (stats.size / 1024 / 1024).toFixed(2);
const modified = stats.mtime.toISOString();

console.log('✓ better_sqlite3.node found');
console.log(`  Size: ${size} MB`);
console.log(`  Modified: ${modified}`);
console.log('\n⚠️  To verify it works with VS Code:');
console.log('   1. Reload VS Code (Cmd+Shift+P → "Developer: Reload Window")');
console.log('   2. Check if the extension activates without errors');
console.log('\nIf you still get NODE_MODULE_VERSION errors, try:');
console.log('   npm run rebuild:vscode');

