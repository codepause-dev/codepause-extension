#!/usr/bin/env node
/**
 * Check what Electron/Node version VS Code is actually using
 * Run this from within VS Code's extension host
 */

console.log('VS Code Runtime Information:');
console.log('============================');
console.log('Node.js version:', process.version);
console.log('NODE_MODULE_VERSION:', process.versions.modules);
console.log('Electron version:', process.versions.electron || 'Not available (running in Node.js)');
console.log('Platform:', process.platform);
console.log('Architecture:', process.arch);
console.log('');
console.log('To use this script:');
console.log('1. Open VS Code');
console.log('2. Press Cmd+Shift+P → "Developer: Toggle Developer Tools"');
console.log('3. Go to Console tab');
console.log('4. Run: console.log("NODE_MODULE_VERSION:", process.versions.modules)');
console.log('5. This will show what VS Code actually needs');


