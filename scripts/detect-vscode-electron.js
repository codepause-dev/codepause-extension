#!/usr/bin/env node
/**
 * Detect VS Code's Electron version by checking the actual VS Code installation
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function getVSCodeElectronVersion() {
  const platform = os.platform();
  let vscodePath;
  
  try {
    if (platform === 'darwin') {
      // macOS: Check common locations
      const locations = [
        '/Applications/Visual Studio Code.app/Contents/Resources/app/package.json',
        path.join(os.homedir(), 'Applications/Visual Studio Code.app/Contents/Resources/app/package.json'),
      ];
      
      for (const loc of locations) {
        if (fs.existsSync(loc)) {
          const pkg = JSON.parse(fs.readFileSync(loc, 'utf8'));
          return pkg.dependencies?.electron || pkg.devDependencies?.electron;
        }
      }
      
      // Try to get from code command
      try {
        const result = execSync('code --version', { encoding: 'utf8', stdio: 'pipe' });
        const version = result.trim().split('\n')[0];
        console.log('VS Code version:', version);
      } catch (e) {
        // Ignore
      }
    } else if (platform === 'win32') {
      // Windows: Check Program Files
      const locations = [
        'C:\\Program Files\\Microsoft VS Code\\resources\\app\\package.json',
        'C:\\Program Files (x86)\\Microsoft VS Code\\resources\\app\\package.json',
      ];
      
      for (const loc of locations) {
        if (fs.existsSync(loc)) {
          const pkg = JSON.parse(fs.readFileSync(loc, 'utf8'));
          return pkg.dependencies?.electron || pkg.devDependencies?.electron;
        }
      }
    } else {
      // Linux
      const locations = [
        '/usr/share/code/resources/app/package.json',
        path.join(os.homedir(), '.vscode/resources/app/package.json'),
      ];
      
      for (const loc of locations) {
        if (fs.existsSync(loc)) {
          const pkg = JSON.parse(fs.readFileSync(loc, 'utf8'));
          return pkg.dependencies?.electron || pkg.devDependencies?.electron;
        }
      }
    }
  } catch (error) {
    console.error('Error detecting VS Code Electron version:', error.message);
  }
  
  return null;
}

// VS Code 1.85.0 uses Electron that requires NODE_MODULE_VERSION 136
// This corresponds to Node.js 24.x
// Electron 33.x uses Node.js 24.x
const detected = getVSCodeElectronVersion();
if (detected) {
  console.log('Detected VS Code Electron version:', detected);
  console.log('Use this version for electron-rebuild: --version=' + detected);
} else {
  console.log('Could not auto-detect VS Code Electron version.');
  console.log('VS Code 1.85.0 likely uses Electron 33.x (Node.js 24.x, MODULE_VERSION 136)');
  console.log('Trying Electron 33.0.0...');
}

