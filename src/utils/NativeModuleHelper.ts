/**
 * NativeModuleHelper
 * Ensures better-sqlite3 is built for the correct Electron version
 * Works for both VS Code and Cursor
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { isValidElectronVersion } from './SecurityUtils';

const execFileAsync = promisify(execFile);

interface RebuildInfo {
  electronVersion: string;
  nodeModuleVersion: string;
  rebuiltAt: number;
}

export class NativeModuleHelper {
  private static readonly CACHE_FILE = '.native-module-cache.json';
  private static readonly MODULE_NAME = 'better-sqlite3';

  static async ensureNativeModule(extensionPath: string): Promise<void> {
    const electronVersion = process.versions.electron;
    const nodeModuleVersion = process.versions.modules;

    if (!electronVersion) {
      throw new Error('Not running in Electron environment');
    }

    // Security: Validate electron version format to prevent command injection
    if (!isValidElectronVersion(electronVersion)) {
      throw new Error(`Invalid Electron version format: ${electronVersion}`);
    }

    // Check cache to see if we already rebuilt for this version
    const cacheFile = path.join(extensionPath, this.CACHE_FILE);
    if (await this.isCacheValid(cacheFile, electronVersion, nodeModuleVersion)) {
      return;
    }

    // Try to load the module first
    if (await this.canLoadModule(extensionPath)) {
      await this.updateCache(cacheFile, electronVersion, nodeModuleVersion);
      return;
    }

    try {
      await this.rebuildModule(extensionPath, electronVersion);
      await this.updateCache(cacheFile, electronVersion, nodeModuleVersion);
    } catch (error) {
      throw new Error(`Failed to rebuild ${this.MODULE_NAME}: ${error}`);
    }
  }

  private static async isCacheValid(
    cacheFile: string,
    electronVersion: string,
    nodeModuleVersion: string
  ): Promise<boolean> {
    try {
      const cacheData = await fs.promises.readFile(cacheFile, 'utf-8');

      // Security: Safe JSON parsing with error handling
      let cache: RebuildInfo;
      try {
        cache = JSON.parse(cacheData);
      } catch (parseError) {
        console.error('[NativeModuleHelper] Failed to parse cache file:', parseError);
        return false;
      }

      // Cache is valid if both Electron version and ABI version match
      return cache.electronVersion === electronVersion &&
             cache.nodeModuleVersion === nodeModuleVersion;
    } catch {
      return false;
    }
  }

  private static async updateCache(
    cacheFile: string,
    electronVersion: string,
    nodeModuleVersion: string
  ): Promise<void> {
    const cache: RebuildInfo = {
      electronVersion,
      nodeModuleVersion,
      rebuiltAt: Date.now()
    };

    await fs.promises.writeFile(cacheFile, JSON.stringify(cache, null, 2));
  }

  private static async canLoadModule(extensionPath: string): Promise<boolean> {
    try {
      const modulePath = path.join(
        extensionPath,
        'node_modules',
        this.MODULE_NAME,
        'build',
        'Release',
        'better_sqlite3.node'
      );

      if (!fs.existsSync(modulePath)) {
        return false;
      }

      // Try to require it
      require(modulePath);
      return true;
    } catch {
      return false;
    }
  }

  private static async rebuildModule(extensionPath: string, electronVersion: string): Promise<void> {
    // Security: Validate inputs before execution
    if (!isValidElectronVersion(electronVersion)) {
      throw new Error('Invalid Electron version format');
    }

    // Use execFile (safer than exec) with separate arguments to prevent injection
    const command = 'npx';
    const args = [
      'electron-rebuild',
      '-f',
      '-w',
      this.MODULE_NAME,
      '-v',
      electronVersion
    ];

    try {
      await execFileAsync(command, args, {
        cwd: extensionPath,
        env: {
          ...process.env,
          npm_config_runtime: 'electron',
          npm_config_target: electronVersion,
          npm_config_disturl: 'https://electronjs.org/headers',
          npm_config_build_from_source: 'true'
        },
        timeout: 120000, // 2 minute timeout
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer limit
      });
    } catch (error: any) {
      console.error('[NativeModuleHelper] Rebuild failed:', error);
      throw error;
    }
  }

  static getRuntimeInfo(): {
    electronVersion: string;
    nodeVersion: string;
    nodeModuleVersion: string;
    platform: string;
    arch: string;
  } {
    return {
      electronVersion: process.versions.electron || 'unknown',
      nodeVersion: process.version,
      nodeModuleVersion: process.versions.modules || 'unknown',
      platform: process.platform,
      arch: process.arch
    };
  }
}
