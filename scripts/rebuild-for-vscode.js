#!/usr/bin/env node
/**
 * Rebuild better-sqlite3 for VS Code's Electron version
 * This script detects VS Code's Electron version and rebuilds the native module
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// VS Code 1.85.0 uses Electron that requires NODE_MODULE_VERSION 136 (Node.js 24.x)
// NODE_MODULE_VERSION 130 = Node.js 22.x / Electron 33.x
// NODE_MODULE_VERSION 136 = Node.js 24.x / Electron 34.x
// VS Code 1.84.x uses Electron 32.x which requires NODE_MODULE_VERSION 128
const VS_CODE_ELECTRON_VERSIONS = {
  '1.85': '34.0.0',  // Uses Node.js 24.x (MODULE_VERSION 136) - VS Code 1.85 needs this!
  '1.84': '32.3.0',  // Uses older Node.js (MODULE_VERSION 128)
  '1.83': '32.2.0',
  '1.82': '32.1.0',
  '1.81': '31.0.0',
};

function getVSCodeVersion() {
  try {
    // Try to get VS Code version from package.json engines
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const vscodeVersion = pkg.engines?.vscode?.replace('^', '') || '1.85.0';
    return vscodeVersion;
  } catch (error) {
    console.warn('Could not detect VS Code version, using default 1.85.0');
    return '1.85.0';
  }
}

function getElectronVersion(vscodeVersion) {
  const majorMinor = vscodeVersion.split('.').slice(0, 2).join('.');
  return VS_CODE_ELECTRON_VERSIONS[majorMinor] || VS_CODE_ELECTRON_VERSIONS['1.85'];
}

function rebuild() {
  const vscodeVersion = getVSCodeVersion();
  const electronVersion = getElectronVersion(vscodeVersion);
  const projectRoot = path.join(__dirname, '..');
  
  console.log(`Detected VS Code version: ${vscodeVersion}`);
  console.log(`Rebuilding better-sqlite3 for Electron ${electronVersion}...`);
  console.log('(This may take a few minutes, especially if Electron needs to be downloaded)\n');
  
  // Clean build directory first
  const buildDir = path.join(projectRoot, 'node_modules', 'better-sqlite3', 'build');
  if (fs.existsSync(buildDir)) {
    console.log('Cleaning previous build...');
    fs.rmSync(buildDir, { recursive: true, force: true });
  }
  
  // Set environment variables to help with proxy/network issues
  const env = {
    ...process.env,
    ELECTRON_SKIP_BINARY_DOWNLOAD: '0', // Force download
    ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://github.com/electron/electron/releases/download/',
    npm_config_cache: process.env.npm_config_cache || path.join(os.homedir(), '.npm'),
  };
  
  // Remove proxy if it's causing issues (user can set it manually if needed)
  if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
    console.log('⚠️  Proxy detected. If download fails, try:');
    console.log('   unset HTTP_PROXY HTTPS_PROXY && npm run rebuild:vscode\n');
  }
  
  try {
    console.log(`Running: electron-rebuild -f -w better-sqlite3 --version=${electronVersion}`);
    execSync(
      `npx electron-rebuild -f -w better-sqlite3 --version=${electronVersion}`,
      { 
        stdio: 'inherit', 
        cwd: projectRoot,
        env: env,
        timeout: 300000 // 5 minutes timeout
      }
    );
    
    // Verify the build actually happened
    const modulePath = path.join(projectRoot, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
    if (!fs.existsSync(modulePath)) {
      throw new Error('Build completed but better_sqlite3.node not found!');
    }
    
    const stats = fs.statSync(modulePath);
    const now = new Date();
    const buildTime = stats.mtime;
    const timeDiff = Math.abs(now - buildTime) / 1000; // seconds
    
    if (timeDiff > 60) {
      console.warn('\n⚠️  Warning: Build file timestamp is old. The rebuild may have used cached files.');
      console.warn('   Try: rm -rf node_modules/better-sqlite3/build && npm run rebuild:vscode');
    }
    
    console.log('\n✓ Rebuild complete!');
    console.log(`  Module: ${modulePath}`);
    console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Built: ${buildTime.toISOString()}`);
    console.log('\n📋 Next steps:');
    console.log('   1. Reload VS Code: Cmd+Shift+P → "Developer: Reload Window"');
    console.log('   2. Check if extension activates without errors');
    
  } catch (error) {
    console.error('\n✗ Rebuild failed:', error.message);
    
    if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED') || error.message.includes('network')) {
      console.error('\n🔧 Network/Proxy Issue Detected!');
      console.error('\nTry these solutions:');
      console.error('1. Check your internet connection');
      console.error('2. If behind a proxy, configure it:');
      console.error('   export HTTP_PROXY=http://your-proxy:port');
      console.error('   export HTTPS_PROXY=http://your-proxy:port');
      console.error('3. Or bypass proxy for GitHub:');
      console.error('   export NO_PROXY=github.com,*.github.com');
      console.error('4. Try using a different Electron mirror:');
      console.error('   export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/');
      console.error('\n5. Manual rebuild (if electron-rebuild keeps failing):');
      console.error('   cd node_modules/better-sqlite3');
      console.error('   npm run build-release');
    }
    
    console.log('\n🔄 Trying fallback: Electron 33.0.0...');
    try {
      execSync(
        `npx electron-rebuild -f -w better-sqlite3 --version=33.0.0`,
        { 
          stdio: 'inherit', 
          cwd: projectRoot,
          env: env,
          timeout: 300000
        }
      );
      console.log('✓ Fallback rebuild complete!');
    } catch (error2) {
      console.error('\n✗ All electron-rebuild attempts failed');
      console.error('\n💡 Trying direct node-gyp build (bypasses electron-rebuild)...');
      try {
        const betterSqlite3Path = path.join(projectRoot, 'node_modules', 'better-sqlite3');
        const buildEnv = {
          ...env,
          npm_config_target: electronVersion,
          npm_config_runtime: 'electron',
          npm_config_disturl: 'https://electronjs.org/headers',
          npm_config_build_from_source: 'true',
          npm_config_arch: process.arch, // Ensure correct architecture (x64 for Intel Mac)
        };
        
        execSync(
          'npm run build-release',
          { 
            stdio: 'inherit', 
            cwd: betterSqlite3Path,
            env: buildEnv,
            timeout: 300000
          }
        );
        
        const modulePath = path.join(betterSqlite3Path, 'build', 'Release', 'better_sqlite3.node');
        if (fs.existsSync(modulePath)) {
          console.log('\n✓ Direct build successful!');
          console.log(`  Module: ${modulePath}`);
          return;
        }
      } catch (directError) {
        console.error('\n✗ Direct build also failed:', directError.message);
        console.error('\n💡 Last resort: Run npm run rebuild:manual');
        process.exit(1);
      }
    }
  }
}

rebuild();

