/**
 * ModuleVersionHelper
 * Provides utilities for understanding NODE_MODULE_VERSION and Node.js version relationships
 */

export interface VersionInfo {
  nodeVersion: string;
  moduleVersion: string;
  electronVersion?: string;
  vscodeVersion?: string;
}

/**
 * Map NODE_MODULE_VERSION to Node.js version
 */
export function getNodeVersionFromModuleVersion(moduleVersion: string): string {
  const versionMap: Record<string, string> = {
    '108': '18.x',
    '115': '20.x',
    '127': '21.x',
    '132': '22.x',
    '136': '24.x',
    '140': '26.x',
  };
  
  return versionMap[moduleVersion] || `(MODULE_VERSION ${moduleVersion})`;
}

/**
 * Get human-readable explanation of version requirements
 */
export function getVersionExplanation(runtimeInfo: {
  electronVersion: string;
  nodeVersion: string;
  nodeModuleVersion: string;
}): string {
  const requiredNode = getNodeVersionFromModuleVersion(runtimeInfo.nodeModuleVersion);
  
  return `Your editor (VS Code/Cursor) uses:
• Electron ${runtimeInfo.electronVersion}
• Node.js ${requiredNode} (MODULE_VERSION ${runtimeInfo.nodeModuleVersion})

Native modules like better-sqlite3 must be compiled for this exact version.
Your system Node.js version (${runtimeInfo.nodeVersion}) doesn't affect the extension runtime.`;
}

/**
 * Check if current system Node.js matches required version
 */
export function checkSystemNodeVersion(requiredModuleVersion: string): {
  matches: boolean;
  systemVersion: string;
  systemModuleVersion: string;
  requiredVersion: string;
  message: string;
} {
  const systemModuleVersion = process.versions.modules;
  const systemVersion = process.version;
  const requiredVersion = getNodeVersionFromModuleVersion(requiredModuleVersion);
  
  const matches = systemModuleVersion === requiredModuleVersion;
  
  const message = matches
    ? `✅ System Node.js ${systemVersion} matches required ${requiredVersion}`
    : `⚠️ System Node.js ${systemVersion} (MODULE_VERSION ${systemModuleVersion}) doesn't match required ${requiredVersion} (MODULE_VERSION ${requiredModuleVersion})\n` +
      `Note: This is OK! The extension runs in Electron, not system Node.js.`;
  
  return {
    matches,
    systemVersion,
    systemModuleVersion,
    requiredVersion,
    message
  };
}

