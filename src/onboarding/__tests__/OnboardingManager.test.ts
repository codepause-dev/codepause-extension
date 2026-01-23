/**
 * OnboardingManager Tests
 */

import { OnboardingManager } from '../OnboardingManager';
import { DeveloperLevel } from '../../types';
import * as vscode from 'vscode';

// Mock vscode
jest.mock('vscode', () => {
  const mockPanel = {
    reveal: jest.fn(),
    dispose: jest.fn(),
    webview: {
      html: '',
      onDidReceiveMessage: jest.fn(),
      postMessage: jest.fn()
    },
    onDidDispose: jest.fn()
  };

  return {
    ViewColumn: {
      One: 1,
      Two: 2,
      Three: 3
    },
    window: {
      createWebviewPanel: jest.fn().mockReturnValue(mockPanel),
      showInformationMessage: jest.fn(),
      showQuickPick: jest.fn(),
      showWarningMessage: jest.fn(),
      showErrorMessage: jest.fn()
    },
    commands: {
      executeCommand: jest.fn()
    },
    Uri: {
      file: (str: string) => str,
      parse: (str: string) => str
    }
  };
}, { virtual: true });

describe('OnboardingManager', () => {
  let manager: OnboardingManager;
  let mockContext: any;
  let mockConfigManager: any;
  let mockOnDidReceiveMessageCallback: any;
  let mockPanel: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock panel
    mockPanel = {
      reveal: jest.fn(),
      dispose: jest.fn(),
      webview: {
        html: '',
        onDidReceiveMessage: jest.fn((callback) => {
          mockOnDidReceiveMessageCallback = callback;
        }),
        postMessage: jest.fn()
      },
      onDidDispose: jest.fn((_callback) => {
        // Auto-dispose on trigger
      })
    };

    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);

    // Create mock context
    mockContext = {
      globalState: {
        get: jest.fn().mockReturnValue(false),
        update: jest.fn().mockResolvedValue(undefined)
      },
      extension: {
        packageJSON: {
          version: '0.2.0'
        }
      },
      subscriptions: []
    };

    // Create mock config manager
    mockConfigManager = {
      setExperienceLevel: jest.fn().mockResolvedValue(undefined)
    };

    // Create manager instance
    manager = new OnboardingManager(mockContext, mockConfigManager);
  });

  describe('needsOnboarding', () => {
    it('should return true for new users', async () => {
      mockContext.globalState.get.mockReturnValue(false);

      const needs = await manager.needsOnboarding();

      expect(needs).toBe(true);
    });

    it('should return false if completed', async () => {
      mockContext.globalState.get.mockImplementation((key: string) => {
        return key === 'onboarding.completed' ? true : false;
      });

      const needs = await manager.needsOnboarding();

      expect(needs).toBe(false);
    });

    it('should return false if skipped', async () => {
      mockContext.globalState.get.mockImplementation((key: string) => {
        return key === 'onboarding.skipped' ? true : false;
      });

      const needs = await manager.needsOnboarding();

      expect(needs).toBe(false);
    });
  });

  describe('isCompleted', () => {
    it('should return completion status', async () => {
      mockContext.globalState.get.mockReturnValue(true);

      const completed = await manager.isCompleted();

      expect(completed).toBe(true);
    });
  });

  describe('wasSkipped', () => {
    it('should return skipped status', async () => {
      mockContext.globalState.get.mockReturnValue(true);

      const skipped = await manager.wasSkipped();

      expect(skipped).toBe(true);
    });
  });

  describe('getCompletionTimestamp', () => {
    it('should return timestamp when available', async () => {
      const timestamp = 1704844800000;
      mockContext.globalState.get.mockReturnValue(timestamp);

      const result = await manager.getCompletionTimestamp();

      expect(result).toBe(timestamp);
    });

    it('should return undefined when not available', async () => {
      mockContext.globalState.get.mockReturnValue(undefined);

      const result = await manager.getCompletionTimestamp();

      expect(result).toBeUndefined();
    });
  });

  describe('reset', () => {
    it('should reset all onboarding state', async () => {
      await manager.reset();

      expect(mockContext.globalState.update).toHaveBeenCalledWith('onboarding.completed', false);
      expect(mockContext.globalState.update).toHaveBeenCalledWith('onboarding.skipped', false);
      expect(mockContext.globalState.update).toHaveBeenCalledWith('onboarding.completedAt', undefined);
      expect(mockContext.globalState.update).toHaveBeenCalledWith('onboarding.skippedAt', undefined);
    });
  });

  describe('start - successful completion', () => {
    it('should complete full onboarding flow', async () => {
      await manager.start();

      // Verify webview panel was created
      expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'codePauseOnboarding',
        'CodePause Setup',
        vscode.ViewColumn.One,
        expect.objectContaining({
          enableScripts: true,
          retainContextWhenHidden: true
        })
      );

      // Simulate user completing onboarding with Mid level
      await mockOnDidReceiveMessageCallback({
        command: 'complete',
        data: { experienceLevel: DeveloperLevel.Mid }
      });

      expect(mockConfigManager.setExperienceLevel).toHaveBeenCalledWith(DeveloperLevel.Mid);
      expect(mockContext.globalState.update).toHaveBeenCalledWith('onboarding.completed', true);
      expect(mockContext.globalState.update).toHaveBeenCalledWith('onboarding.completedAt', expect.any(Number));
      expect(mockPanel.dispose).toHaveBeenCalled();
    });

    it('should save selected experience level', async () => {
      await manager.start();

      // Simulate user completing onboarding with Junior level
      await mockOnDidReceiveMessageCallback({
        command: 'complete',
        data: { experienceLevel: DeveloperLevel.Junior }
      });

      expect(mockConfigManager.setExperienceLevel).toHaveBeenCalledWith(DeveloperLevel.Junior);
    });

    it('should handle skip command', async () => {
      await manager.start();

      // Simulate user skipping onboarding
      await mockOnDidReceiveMessageCallback({ command: 'skip' });

      expect(mockContext.globalState.update).toHaveBeenCalledWith('onboarding.skipped', true);
      expect(mockContext.globalState.update).toHaveBeenCalledWith('onboarding.skippedAt', expect.any(Number));
      expect(mockPanel.dispose).toHaveBeenCalled();
    });

    it('should handle openDashboard command', async () => {
      await manager.start();

      // Simulate user clicking Open Dashboard
      await mockOnDidReceiveMessageCallback({ command: 'openDashboard' });

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('codePause.openDashboard');
    });
  });

  describe('start - reveal existing panel', () => {
    it('should reveal existing panel if already open', async () => {
      await manager.start();

      // Start again - should reveal existing panel
      await manager.start();

      expect(mockPanel.reveal).toHaveBeenCalled();
      expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully', async () => {
      (vscode.window.createWebviewPanel as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Test error');
      });

      await manager.start();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('onboarding encountered an error')
      );
      expect(mockContext.globalState.update).not.toHaveBeenCalledWith('onboarding.completed', true);
    });

    it('should not throw on error', async () => {
      (vscode.window.createWebviewPanel as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Critical error');
      });

      await expect(manager.start()).resolves.not.toThrow();
    });
  });
});
