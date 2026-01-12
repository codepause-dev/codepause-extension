#!/usr/bin/env node
/**
 * Diagnostic script to check VS Code's actual requirements
 * Run this INSIDE VS Code's Developer Console to see what it needs
 */

console.log(`
╔══════════════════════════════════════════════════════════════╗
║  VS Code Native Module Diagnostic                            ║
╚══════════════════════════════════════════════════════════════╝

To find out what VS Code actually needs:

1. Open VS Code
2. Press Cmd+Shift+P → "Developer: Toggle Developer Tools"
3. Go to the "Console" tab
4. Copy and paste this code:

   console.log('VS Code Runtime Info:');
   console.log('Node.js:', process.version);
   console.log('NODE_MODULE_VERSION:', process.versions.modules);
   console.log('Electron:', process.versions.electron);
   console.log('Platform:', process.platform);
   console.log('Arch:', process.arch);

5. Copy the output and use it to rebuild:

   For example, if it shows NODE_MODULE_VERSION: 136, you need Electron 34.x
   If it shows NODE_MODULE_VERSION: 132, you need Electron 33.x

Current system Node.js: ${process.version}
Current system NODE_MODULE_VERSION: ${process.versions.modules}
`);


