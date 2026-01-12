/**
 * NativeModuleHelper Tests
 */

// Mock modules before imports
const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockExistsSync = jest.fn();
const mockExecFileAsync = jest.fn();
const mockIsValidElectronVersion = jest.fn();

jest.mock('fs', () => ({
  promises: {
    readFile: (...args: unknown[]) => mockReadFile(...args),
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
  },
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
}));

jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

jest.mock('util', () => ({
  promisify: () => mockExecFileAsync,
}));

jest.mock('../SecurityUtils', () => ({
  isValidElectronVersion: (...args: unknown[]) => mockIsValidElectronVersion(...args),
}));

import { NativeModuleHelper } from '../NativeModuleHelper';

describe('NativeModuleHelper', () => {
  const mockElectronVersion = '25.0.0';
  const mockNodeModuleVersion = '116';
  const mockExtensionPath = '/path/to/extension';

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mocks
    Object.defineProperty(process.versions, 'electron', {
      value: mockElectronVersion,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(process.versions, 'modules', {
      value: mockNodeModuleVersion,
      writable: true,
      configurable: true,
    });

    mockIsValidElectronVersion.mockReturnValue(true);
    mockExistsSync.mockReturnValue(true);
    mockExecFileAsync.mockResolvedValue({ stdout: 'success', stderr: '' });
  });

  describe('ensureNativeModule', () => {
    it('should throw error if not running in Electron', async () => {
      Object.defineProperty(process.versions, 'electron', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      await expect(NativeModuleHelper.ensureNativeModule(mockExtensionPath))
        .rejects.toThrow('Not running in Electron environment');
    });

    it('should throw error for invalid Electron version', async () => {
      mockIsValidElectronVersion.mockReturnValue(false);

      await expect(NativeModuleHelper.ensureNativeModule(mockExtensionPath))
        .rejects.toThrow('Invalid Electron version format');
    });

    it('should skip rebuild if cache is valid', async () => {
      const validCache = JSON.stringify({
        electronVersion: mockElectronVersion,
        nodeModuleVersion: mockNodeModuleVersion,
        rebuiltAt: Date.now(),
      });
      mockReadFile.mockResolvedValue(validCache);

      await NativeModuleHelper.ensureNativeModule(mockExtensionPath);

      expect(mockReadFile).toHaveBeenCalled();
      expect(mockExecFileAsync).not.toHaveBeenCalled();
    });

    it('should rebuild if module exists but cannot be loaded', async () => {
      mockReadFile.mockRejectedValue(new Error('No cache'));
      mockExistsSync.mockReturnValue(true);
      // Module file exists but require() will fail (no actual module in test)

      await NativeModuleHelper.ensureNativeModule(mockExtensionPath);

      expect(mockWriteFile).toHaveBeenCalled();
      expect(mockExecFileAsync).toHaveBeenCalled(); // Falls back to rebuild
    });

    it('should rebuild module if cache invalid and module cannot load', async () => {
      mockReadFile.mockRejectedValue(new Error('No cache'));
      mockExistsSync.mockReturnValue(false);

      await NativeModuleHelper.ensureNativeModule(mockExtensionPath);

      expect(mockExecFileAsync).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('should throw error if rebuild fails', async () => {
      mockReadFile.mockRejectedValue(new Error('No cache'));
      mockExistsSync.mockReturnValue(false);
      mockExecFileAsync.mockRejectedValue(new Error('Rebuild failed'));

      await expect(NativeModuleHelper.ensureNativeModule(mockExtensionPath))
        .rejects.toThrow('Failed to rebuild better-sqlite3');
    });
  });

  describe('Cache validation', () => {
    it('should skip rebuild for valid cache', async () => {
      const validCache = JSON.stringify({
        electronVersion: mockElectronVersion,
        nodeModuleVersion: mockNodeModuleVersion,
        rebuiltAt: Date.now(),
      });
      mockReadFile.mockResolvedValue(validCache);

      await NativeModuleHelper.ensureNativeModule(mockExtensionPath);

      expect(mockExecFileAsync).not.toHaveBeenCalled();
    });

    it('should rebuild if cache file does not exist', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      mockExistsSync.mockReturnValue(false);

      await NativeModuleHelper.ensureNativeModule(mockExtensionPath);

      expect(mockExecFileAsync).toHaveBeenCalled();
    });

    it('should rebuild if Electron version mismatches', async () => {
      const cache = JSON.stringify({
        electronVersion: '24.0.0',
        nodeModuleVersion: mockNodeModuleVersion,
        rebuiltAt: Date.now(),
      });
      mockReadFile.mockResolvedValue(cache);
      mockExistsSync.mockReturnValue(false);

      await NativeModuleHelper.ensureNativeModule(mockExtensionPath);

      expect(mockExecFileAsync).toHaveBeenCalled();
    });

    it('should rebuild if node module version mismatches', async () => {
      const cache = JSON.stringify({
        electronVersion: mockElectronVersion,
        nodeModuleVersion: '115',
        rebuiltAt: Date.now(),
      });
      mockReadFile.mockResolvedValue(cache);
      mockExistsSync.mockReturnValue(false);

      await NativeModuleHelper.ensureNativeModule(mockExtensionPath);

      expect(mockExecFileAsync).toHaveBeenCalled();
    });

    it('should handle invalid JSON in cache', async () => {
      mockReadFile.mockResolvedValue('invalid json{');
      mockExistsSync.mockReturnValue(false);

      await NativeModuleHelper.ensureNativeModule(mockExtensionPath);

      expect(mockExecFileAsync).toHaveBeenCalled();
    });
  });

  describe('Cache writing', () => {
    it('should write cache file when rebuilding', async () => {
      mockReadFile.mockRejectedValue(new Error('No cache'));
      mockExistsSync.mockReturnValue(false);

      await NativeModuleHelper.ensureNativeModule(mockExtensionPath);

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('.native-module-cache.json'),
        expect.stringContaining(mockElectronVersion)
      );
    });

    it('should include all required fields in cache', async () => {
      mockReadFile.mockRejectedValue(new Error('No cache'));
      mockExistsSync.mockReturnValue(false);

      await NativeModuleHelper.ensureNativeModule(mockExtensionPath);

      const cacheData = mockWriteFile.mock.calls[0][1];
      const cache = JSON.parse(cacheData as string);

      expect(cache).toHaveProperty('electronVersion', mockElectronVersion);
      expect(cache).toHaveProperty('nodeModuleVersion', mockNodeModuleVersion);
      expect(cache).toHaveProperty('rebuiltAt');
      expect(typeof cache.rebuiltAt).toBe('number');
    });
  });

  describe('Module loading', () => {
    it('should rebuild if module file does not exist', async () => {
      mockReadFile.mockRejectedValue(new Error('No cache'));
      mockExistsSync.mockReturnValue(false);

      await NativeModuleHelper.ensureNativeModule(mockExtensionPath);

      expect(mockExecFileAsync).toHaveBeenCalled();
    });

    it('should check if module file exists before loading', async () => {
      mockReadFile.mockRejectedValue(new Error('No cache'));
      mockExistsSync.mockReturnValue(false);

      await NativeModuleHelper.ensureNativeModule(mockExtensionPath);

      expect(mockExistsSync).toHaveBeenCalled();
    });
  });

  describe('Module rebuilding', () => {
    it('should call electron-rebuild with correct arguments', async () => {
      mockReadFile.mockRejectedValue(new Error('No cache'));
      mockExistsSync.mockReturnValue(false);

      await NativeModuleHelper.ensureNativeModule(mockExtensionPath);

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining([
          'electron-rebuild',
          '-f',
          '-w',
          'better-sqlite3',
          '-v',
          mockElectronVersion,
        ]),
        expect.objectContaining({
          cwd: mockExtensionPath,
          timeout: 120000,
        })
      );
    });

    it('should set correct environment variables', async () => {
      mockReadFile.mockRejectedValue(new Error('No cache'));
      mockExistsSync.mockReturnValue(false);

      await NativeModuleHelper.ensureNativeModule(mockExtensionPath);

      const envArg = mockExecFileAsync.mock.calls[0][2].env;
      expect(envArg).toHaveProperty('npm_config_runtime', 'electron');
      expect(envArg).toHaveProperty('npm_config_target', mockElectronVersion);
      expect(envArg).toHaveProperty('npm_config_disturl', 'https://electronjs.org/headers');
      expect(envArg).toHaveProperty('npm_config_build_from_source', 'true');
    });

    it('should handle rebuild errors gracefully', async () => {
      mockReadFile.mockRejectedValue(new Error('No cache'));
      mockExistsSync.mockReturnValue(false);
      mockExecFileAsync.mockRejectedValue(new Error('Command failed'));

      await expect(NativeModuleHelper.ensureNativeModule(mockExtensionPath))
        .rejects.toThrow('Failed to rebuild better-sqlite3');
    });
  });

  describe('getRuntimeInfo', () => {
    it('should return runtime information', () => {
      const info = NativeModuleHelper.getRuntimeInfo();

      expect(info).toHaveProperty('electronVersion');
      expect(info).toHaveProperty('nodeVersion');
      expect(info).toHaveProperty('nodeModuleVersion');
      expect(info).toHaveProperty('platform');
      expect(info).toHaveProperty('arch');
    });

    it('should return correct Electron version', () => {
      const info = NativeModuleHelper.getRuntimeInfo();
      expect(info.electronVersion).toBe(mockElectronVersion);
    });

    it('should return unknown if Electron version not available', () => {
      Object.defineProperty(process.versions, 'electron', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const info = NativeModuleHelper.getRuntimeInfo();
      expect(info.electronVersion).toBe('unknown');
    });

    it('should return correct node module version', () => {
      const info = NativeModuleHelper.getRuntimeInfo();
      expect(info.nodeModuleVersion).toBe(mockNodeModuleVersion);
    });

    it('should return unknown if node module version not available', () => {
      Object.defineProperty(process.versions, 'modules', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const info = NativeModuleHelper.getRuntimeInfo();
      expect(info.nodeModuleVersion).toBe('unknown');
    });

    it('should return platform and arch', () => {
      const info = NativeModuleHelper.getRuntimeInfo();
      expect(info.platform).toBe(process.platform);
      expect(info.arch).toBe(process.arch);
    });

    it('should return node version', () => {
      const info = NativeModuleHelper.getRuntimeInfo();
      expect(info.nodeVersion).toBe(process.version);
    });
  });

  describe('Security validation', () => {
    it('should validate Electron version before rebuild', async () => {
      mockReadFile.mockRejectedValue(new Error('No cache'));
      mockExistsSync.mockReturnValue(false);
      mockIsValidElectronVersion.mockReturnValue(false);

      await expect(NativeModuleHelper.ensureNativeModule(mockExtensionPath))
        .rejects.toThrow('Invalid Electron version format');
    });

    it('should call security validation function', async () => {
      mockReadFile.mockRejectedValue(new Error('No cache'));
      mockExistsSync.mockReturnValue(false);

      await NativeModuleHelper.ensureNativeModule(mockExtensionPath);

      expect(mockIsValidElectronVersion).toHaveBeenCalledWith(mockElectronVersion);
    });
  });
});
