/**
 * ModuleVersionHelper Tests
 */

import {
  getNodeVersionFromModuleVersion,
  getVersionExplanation,
  checkSystemNodeVersion
} from '../ModuleVersionHelper';

describe('ModuleVersionHelper', () => {
  describe('getNodeVersionFromModuleVersion', () => {
    it('should map known module versions to Node.js versions', () => {
      expect(getNodeVersionFromModuleVersion('108')).toBe('18.x');
      expect(getNodeVersionFromModuleVersion('115')).toBe('20.x');
      expect(getNodeVersionFromModuleVersion('127')).toBe('21.x');
      expect(getNodeVersionFromModuleVersion('132')).toBe('22.x');
      expect(getNodeVersionFromModuleVersion('136')).toBe('24.x');
      expect(getNodeVersionFromModuleVersion('140')).toBe('26.x');
    });

    it('should return formatted string for unknown module versions', () => {
      expect(getNodeVersionFromModuleVersion('999')).toBe('(MODULE_VERSION 999)');
      expect(getNodeVersionFromModuleVersion('123')).toBe('(MODULE_VERSION 123)');
    });

    it('should handle empty string', () => {
      expect(getNodeVersionFromModuleVersion('')).toBe('(MODULE_VERSION )');
    });
  });

  describe('getVersionExplanation', () => {
    it('should return formatted explanation with all version info', () => {
      const runtimeInfo = {
        electronVersion: '25.0.0',
        nodeVersion: 'v20.5.0',
        nodeModuleVersion: '115'
      };

      const explanation = getVersionExplanation(runtimeInfo);

      expect(explanation).toContain('Electron 25.0.0');
      expect(explanation).toContain('Node.js 20.x');
      expect(explanation).toContain('MODULE_VERSION 115');
      expect(explanation).toContain('better-sqlite3');
      expect(explanation).toContain('v20.5.0');
    });

    it('should include system Node.js version in explanation', () => {
      const runtimeInfo = {
        electronVersion: '28.0.0',
        nodeVersion: 'v22.1.0',
        nodeModuleVersion: '132'
      };

      const explanation = getVersionExplanation(runtimeInfo);

      expect(explanation).toContain('v22.1.0');
      expect(explanation).toContain('doesn\'t affect the extension runtime');
    });

    it('should handle unknown module versions', () => {
      const runtimeInfo = {
        electronVersion: '30.0.0',
        nodeVersion: 'v25.0.0',
        nodeModuleVersion: '999'
      };

      const explanation = getVersionExplanation(runtimeInfo);

      expect(explanation).toContain('(MODULE_VERSION 999)');
      expect(explanation).toContain('Electron 30.0.0');
    });
  });

  describe('checkSystemNodeVersion', () => {
    const originalModules = process.versions.modules;
    const originalVersion = process.version;

    afterEach(() => {
      // Restore original values
      Object.defineProperty(process.versions, 'modules', {
        value: originalModules,
        writable: true,
        configurable: true
      });
      Object.defineProperty(process, 'version', {
        value: originalVersion,
        writable: true,
        configurable: true
      });
    });

    it('should return match when system version matches required', () => {
      Object.defineProperty(process.versions, 'modules', {
        value: '115',
        writable: true,
        configurable: true
      });
      Object.defineProperty(process, 'version', {
        value: 'v20.5.0',
        writable: true,
        configurable: true
      });

      const result = checkSystemNodeVersion('115');

      expect(result.matches).toBe(true);
      expect(result.systemVersion).toBe('v20.5.0');
      expect(result.systemModuleVersion).toBe('115');
      expect(result.requiredVersion).toBe('20.x');
      expect(result.message).toContain('✅');
      expect(result.message).toContain('matches');
    });

    it('should return no match when system version differs', () => {
      Object.defineProperty(process.versions, 'modules', {
        value: '108',
        writable: true,
        configurable: true
      });
      Object.defineProperty(process, 'version', {
        value: 'v18.12.0',
        writable: true,
        configurable: true
      });

      const result = checkSystemNodeVersion('115');

      expect(result.matches).toBe(false);
      expect(result.systemVersion).toBe('v18.12.0');
      expect(result.systemModuleVersion).toBe('108');
      expect(result.requiredVersion).toBe('20.x');
      expect(result.message).toContain('⚠️');
      expect(result.message).toContain('doesn\'t match');
      expect(result.message).toContain('This is OK!');
    });

    it('should include helpful context in mismatch message', () => {
      Object.defineProperty(process.versions, 'modules', {
        value: '132',
        writable: true,
        configurable: true
      });
      Object.defineProperty(process, 'version', {
        value: 'v22.1.0',
        writable: true,
        configurable: true
      });

      const result = checkSystemNodeVersion('115');

      expect(result.message).toContain('extension runs in Electron');
      expect(result.message).toContain('not system Node.js');
    });

    it('should handle unknown required version', () => {
      Object.defineProperty(process.versions, 'modules', {
        value: '115',
        writable: true,
        configurable: true
      });

      const result = checkSystemNodeVersion('999');

      expect(result.matches).toBe(false);
      expect(result.requiredVersion).toBe('(MODULE_VERSION 999)');
      expect(result.message).toContain('MODULE_VERSION 999');
    });

    it('should return all required fields', () => {
      const result = checkSystemNodeVersion('115');

      expect(result).toHaveProperty('matches');
      expect(result).toHaveProperty('systemVersion');
      expect(result).toHaveProperty('systemModuleVersion');
      expect(result).toHaveProperty('requiredVersion');
      expect(result).toHaveProperty('message');
    });
  });
});
