/**
 * SettingsProvider Tests
 */

// Mock modules before imports
const mockCreateWebviewPanel = jest.fn();
const mockShowInformationMessage = jest.fn();
const mockShowErrorMessage = jest.fn();
const mockShowWarningMessage = jest.fn();
const mockGetUserConfig = jest.fn();
const mockSaveUserConfig = jest.fn();
const mockSetLevel = jest.fn();

jest.mock('vscode', () => ({
  window: {
    createWebviewPanel: (...args: unknown[]) => mockCreateWebviewPanel(...args),
    showInformationMessage: (...args: unknown[]) => mockShowInformationMessage(...args),
    showErrorMessage: (...args: unknown[]) => mockShowErrorMessage(...args),
    showWarningMessage: (...args: unknown[]) => mockShowWarningMessage(...args),
  },
  ViewColumn: {
    One: 1,
  },
  Uri: {
    file: (path: string) => ({ fsPath: path, scheme: 'file' })
  }
}), { virtual: true });

import { SettingsProvider } from '../SettingsProvider';
import type { ConfigRepository } from '../../storage/ConfigRepository';
import type { ThresholdManager } from '../../core/ThresholdManager';
import type * as vscode from 'vscode';
import { DeveloperLevel, AlertFrequency } from '../../types';

describe('SettingsProvider', () => {
  let provider: SettingsProvider;
  let mockExtensionUri: vscode.Uri;
  let mockConfigRepository: ConfigRepository;
  let mockThresholdManager: ThresholdManager;
  let mockPanel: any;
  let messageHandler: (message: any) => void;
  let disposeHandler: () => void;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock extension URI
    mockExtensionUri = { fsPath: '/test', scheme: 'file' } as vscode.Uri;

    // Mock config repository
    mockConfigRepository = {
      getUserConfig: mockGetUserConfig,
      saveUserConfig: mockSaveUserConfig,
    } as unknown as ConfigRepository;

    // Mock threshold manager
    mockThresholdManager = {
      setLevel: mockSetLevel,
    } as unknown as ThresholdManager;

    // Mock webview panel
    mockPanel = {
      webview: {
        html: '',
        postMessage: jest.fn(),
        onDidReceiveMessage: jest.fn((handler: any) => {
          messageHandler = handler;
        }),
      },
      reveal: jest.fn(),
      onDidDispose: jest.fn((handler: any) => {
        disposeHandler = handler;
      }),
    };

    mockCreateWebviewPanel.mockReturnValue(mockPanel);

    // Setup default user config
    mockGetUserConfig.mockResolvedValue({
      experienceLevel: DeveloperLevel.Mid,
      blindApprovalThreshold: 2000,
      alertFrequency: AlertFrequency.Medium,
      enableGamification: true,
      anonymizePaths: true,
      trackedTools: {
        copilot: true,
        cursor: true,
        claudeCode: true
      },
      onboardingCompleted: true
    });

    provider = new SettingsProvider(
      mockExtensionUri,
      mockConfigRepository,
      mockThresholdManager
    );
  });

  describe('constructor', () => {
    it('should initialize with dependencies', () => {
      expect(provider).toBeInstanceOf(SettingsProvider);
    });
  });

  describe('show', () => {
    it('should create webview panel if not exists', async () => {
      await provider.show();

      expect(mockCreateWebviewPanel).toHaveBeenCalledWith(
        'codePauseSettings',
        'CodePause Settings',
        1,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );
    });

    it('should reveal existing panel instead of creating new one', async () => {
      await provider.show();
      expect(mockCreateWebviewPanel).toHaveBeenCalledTimes(1);

      await provider.show();
      expect(mockCreateWebviewPanel).toHaveBeenCalledTimes(1);
      expect(mockPanel.reveal).toHaveBeenCalled();
    });

    it('should set HTML for webview', async () => {
      await provider.show();

      expect(mockPanel.webview.html).toContain('<!DOCTYPE html>');
      expect(mockPanel.webview.html).toContain('CodePause Settings');
    });

    it('should setup message handler', async () => {
      await provider.show();

      expect(mockPanel.webview.onDidReceiveMessage).toHaveBeenCalled();
    });

    it('should setup dispose handler', async () => {
      await provider.show();

      expect(mockPanel.onDidDispose).toHaveBeenCalled();
    });

    it('should send initial settings', async () => {
      await provider.show();

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'updateSettings',
        data: expect.objectContaining({
          config: expect.any(Object),
          thresholds: expect.any(Object)
        })
      });
    });

    it('should set panel to null when disposed', async () => {
      await provider.show();

      // Trigger dispose
      disposeHandler();

      // Should create new panel on next show
      await provider.show();
      expect(mockCreateWebviewPanel).toHaveBeenCalledTimes(2);
    });
  });

  describe('message handling - saveSettings', () => {
    it('should save user config', async () => {
      await provider.show();

      const newConfig = {
        experienceLevel: DeveloperLevel.Senior,
        blindApprovalThreshold: 1000,
        alertFrequency: AlertFrequency.Low,
        enableGamification: false,
        anonymizePaths: true,
        trackedTools: {
          copilot: true,
          cursor: false,
          claudeCode: true
        },
        onboardingCompleted: true
      };

      await messageHandler({ type: 'saveSettings', data: newConfig });

      expect(mockSaveUserConfig).toHaveBeenCalledWith(newConfig);
    });

    it('should update threshold manager level', async () => {
      await provider.show();

      const newConfig = {
        experienceLevel: DeveloperLevel.Senior,
        blindApprovalThreshold: 1000,
        alertFrequency: AlertFrequency.Low,
        enableGamification: true,
        anonymizePaths: true,
        trackedTools: { copilot: true, cursor: true, claudeCode: true },
        onboardingCompleted: true
      };

      await messageHandler({ type: 'saveSettings', data: newConfig });

      expect(mockSetLevel).toHaveBeenCalledWith(DeveloperLevel.Senior);
    });

    it('should show success message', async () => {
      await provider.show();

      const newConfig = {
        experienceLevel: DeveloperLevel.Mid,
        blindApprovalThreshold: 2000,
        alertFrequency: AlertFrequency.Medium,
        enableGamification: true,
        anonymizePaths: true,
        trackedTools: { copilot: true, cursor: true, claudeCode: true },
        onboardingCompleted: true
      };

      await messageHandler({ type: 'saveSettings', data: newConfig });

      expect(mockShowInformationMessage).toHaveBeenCalledWith('Settings saved successfully');
    });

    it('should refresh settings after save', async () => {
      await provider.show();

      mockPanel.webview.postMessage.mockClear();

      const newConfig = {
        experienceLevel: DeveloperLevel.Mid,
        blindApprovalThreshold: 2000,
        alertFrequency: AlertFrequency.Medium,
        enableGamification: true,
        anonymizePaths: true,
        trackedTools: { copilot: true, cursor: true, claudeCode: true },
        onboardingCompleted: true
      };

      await messageHandler({ type: 'saveSettings', data: newConfig });

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'updateSettings',
        data: expect.any(Object)
      });
    });

    it('should handle save errors', async () => {
      await provider.show();

      mockSaveUserConfig.mockRejectedValue(new Error('Database error'));

      const newConfig = {
        experienceLevel: DeveloperLevel.Mid,
        blindApprovalThreshold: 2000,
        alertFrequency: AlertFrequency.Medium,
        enableGamification: true,
        anonymizePaths: true,
        trackedTools: { copilot: true, cursor: true, claudeCode: true },
        onboardingCompleted: true
      };

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await messageHandler({ type: 'saveSettings', data: newConfig });

      expect(mockShowErrorMessage).toHaveBeenCalledWith('Failed to save settings');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Settings save error:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('message handling - resetToDefaults', () => {
    beforeEach(() => {
      // Reset saveUserConfig mock for this suite since previous test might have set it to reject
      mockSaveUserConfig.mockReset().mockResolvedValue(undefined);
    });

    it('should show confirmation dialog', async () => {
      await provider.show();

      mockShowWarningMessage.mockResolvedValue('Cancel');

      await messageHandler({ type: 'resetToDefaults' });

      expect(mockShowWarningMessage).toHaveBeenCalledWith(
        'Reset all settings to defaults? This cannot be undone.',
        { modal: true },
        'Reset',
        'Cancel'
      );
    });

    it('should reset to defaults when confirmed', async () => {
      await provider.show();

      mockShowWarningMessage.mockResolvedValue('Reset');

      await messageHandler({ type: 'resetToDefaults' });

      expect(mockSaveUserConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          experienceLevel: DeveloperLevel.Mid,
          alertFrequency: AlertFrequency.Medium,
          enableGamification: true,
          anonymizePaths: true,
          trackedTools: {
            copilot: true,
            cursor: true,
            claudeCode: true
          },
          onboardingCompleted: true
        })
      );
    });

    it('should show success message after reset', async () => {
      await provider.show();

      mockShowWarningMessage.mockResolvedValue('Reset');

      await messageHandler({ type: 'resetToDefaults' });

      expect(mockShowInformationMessage).toHaveBeenCalledWith('Settings reset to defaults');
    });

    it('should do nothing when cancelled', async () => {
      await provider.show();

      mockShowWarningMessage.mockResolvedValue('Cancel');
      mockSaveUserConfig.mockClear();

      await messageHandler({ type: 'resetToDefaults' });

      expect(mockSaveUserConfig).not.toHaveBeenCalled();
    });

    it('should refresh settings after reset', async () => {
      await provider.show();

      mockShowWarningMessage.mockResolvedValue('Reset');
      mockPanel.webview.postMessage.mockClear();

      await messageHandler({ type: 'resetToDefaults' });

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'updateSettings',
        data: expect.any(Object)
      });
    });
  });

  describe('message handling - requestData', () => {
    it('should send current settings', async () => {
      await provider.show();

      mockPanel.webview.postMessage.mockClear();

      await messageHandler({ type: 'requestData' });

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'updateSettings',
        data: expect.objectContaining({
          config: expect.any(Object),
          thresholds: expect.any(Object)
        })
      });
    });

    it('should include user config in response', async () => {
      await provider.show();

      mockPanel.webview.postMessage.mockClear();

      await messageHandler({ type: 'requestData' });

      const call = mockPanel.webview.postMessage.mock.calls[0][0];
      expect(call.data.config).toEqual(expect.objectContaining({
        experienceLevel: DeveloperLevel.Mid,
        enableGamification: true,
        anonymizePaths: true
      }));
    });
  });

  describe('sendCurrentSettings', () => {
    it('should not send if panel is null', async () => {
      // Don't call show(), so panel remains null

      // Call sendCurrentSettings directly (accessing private method through 'as any')
      await (provider as any).sendCurrentSettings();

      expect(mockPanel.webview.postMessage).not.toHaveBeenCalled();
    });

    it('should send config and thresholds', async () => {
      await provider.show();

      mockPanel.webview.postMessage.mockClear();

      await (provider as any).sendCurrentSettings();

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'updateSettings',
        data: {
          config: expect.any(Object),
          thresholds: expect.any(Object)
        }
      });
    });
  });

  describe('getHtmlForWebview', () => {
    it('should return HTML string', async () => {
      const html = await (provider as any).getHtmlForWebview();

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('</html>');
    });

    it('should include settings form', async () => {
      const html = await (provider as any).getHtmlForWebview();

      expect(html).toContain('experienceLevel');
      expect(html).toContain('alertFrequency');
      expect(html).toContain('enableGamification');
      expect(html).toContain('anonymizePaths');
    });

    it('should include tracked tools checkboxes', async () => {
      const html = await (provider as any).getHtmlForWebview();

      expect(html).toContain('trackCopilot');
      expect(html).toContain('trackCursor');
      expect(html).toContain('trackClaudeCode');
    });

    it('should include save and reset buttons', async () => {
      const html = await (provider as any).getHtmlForWebview();

      expect(html).toContain('saveSettings()');
      expect(html).toContain('resetToDefaults()');
    });

    it('should include VSCode API initialization', async () => {
      const html = await (provider as any).getHtmlForWebview();

      expect(html).toContain('acquireVsCodeApi()');
    });

    it('should include message handling script', async () => {
      const html = await (provider as any).getHtmlForWebview();

      expect(html).toContain('window.addEventListener(\'message\'');
      expect(html).toContain('updateSettings');
    });
  });

  describe('panel lifecycle', () => {
    it('should handle multiple show/hide cycles', async () => {
      // First show
      await provider.show();
      expect(mockCreateWebviewPanel).toHaveBeenCalledTimes(1);

      // Second show (should reveal)
      await provider.show();
      expect(mockCreateWebviewPanel).toHaveBeenCalledTimes(1);
      expect(mockPanel.reveal).toHaveBeenCalledTimes(1);

      // Dispose panel
      disposeHandler();

      // Third show (should create new)
      await provider.show();
      expect(mockCreateWebviewPanel).toHaveBeenCalledTimes(2);
    });

    it('should setup handlers only once per panel', async () => {
      await provider.show();

      const onDidReceiveMessageCalls = mockPanel.webview.onDidReceiveMessage.mock.calls.length;
      const onDidDisposeCalls = mockPanel.onDidDispose.mock.calls.length;

      // Reveal same panel
      await provider.show();

      expect(mockPanel.webview.onDidReceiveMessage).toHaveBeenCalledTimes(onDidReceiveMessageCalls);
      expect(mockPanel.onDidDispose).toHaveBeenCalledTimes(onDidDisposeCalls);
    });
  });

  describe('integration scenarios', () => {
    beforeEach(() => {
      // Reset mocks for integration tests
      mockSaveUserConfig.mockReset().mockResolvedValue(undefined);
      mockSetLevel.mockClear();
    });

    it('should handle full save workflow', async () => {
      await provider.show();

      const newConfig = {
        experienceLevel: DeveloperLevel.Junior,
        blindApprovalThreshold: 3000,
        alertFrequency: AlertFrequency.High,
        enableGamification: true,
        anonymizePaths: false,
        trackedTools: {
          copilot: true,
          cursor: true,
          claudeCode: false
        },
        onboardingCompleted: true
      };

      await messageHandler({ type: 'saveSettings', data: newConfig });

      expect(mockSaveUserConfig).toHaveBeenCalledWith(newConfig);
      expect(mockSetLevel).toHaveBeenCalledWith(DeveloperLevel.Junior);
      expect(mockShowInformationMessage).toHaveBeenCalledWith('Settings saved successfully');
    });

    it('should handle full reset workflow', async () => {
      await provider.show();

      mockShowWarningMessage.mockResolvedValue('Reset');

      await messageHandler({ type: 'resetToDefaults' });

      expect(mockShowWarningMessage).toHaveBeenCalled();
      expect(mockSaveUserConfig).toHaveBeenCalled();
      expect(mockShowInformationMessage).toHaveBeenCalledWith('Settings reset to defaults');
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'updateSettings' })
      );
    });
  });
});
