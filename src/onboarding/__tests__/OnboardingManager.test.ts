/**
 * OnboardingManager Tests
 */

import { OnboardingManager } from '../OnboardingManager';
import { DeveloperLevel } from '../../types';
import * as vscode from 'vscode';

// Mock vscode
jest.mock('vscode', () => ({
  window: {
    showInformationMessage: jest.fn(),
    showQuickPick: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn()
  },
  commands: {
    executeCommand: jest.fn()
  }
}), { virtual: true });

describe('OnboardingManager', () => {
  let manager: OnboardingManager;
  let mockContext: any;
  let mockConfigManager: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

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
      }
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
      // Mock successful flow
      (vscode.window.showInformationMessage as jest.Mock)
        .mockResolvedValueOnce('Get Started') // Welcome
        .mockResolvedValueOnce({ title: 'Next' }) // Tour slide 1
        .mockResolvedValueOnce({ title: 'Next' }) // Tour slide 2
        .mockResolvedValueOnce({ title: 'Finish Tour' }) // Tour slide 3
        .mockResolvedValueOnce('Start Coding'); // Dashboard preview

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce({
        label: '$(code) Mid-Level Developer',
        level: DeveloperLevel.Mid
      });

      await manager.start();

      expect(mockConfigManager.setExperienceLevel).toHaveBeenCalledWith(DeveloperLevel.Mid);
      expect(mockContext.globalState.update).toHaveBeenCalledWith('onboarding.completed', true);
      expect(mockContext.globalState.update).toHaveBeenCalledWith('onboarding.completedAt', expect.any(Number));
    });

    it('should save selected experience level', async () => {
      (vscode.window.showInformationMessage as jest.Mock)
        .mockResolvedValueOnce('Get Started')
        .mockResolvedValueOnce({ title: 'Next' })
        .mockResolvedValueOnce({ title: 'Next' })
        .mockResolvedValueOnce({ title: 'Finish Tour' })
        .mockResolvedValueOnce('Start Coding');

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce({
        label: '$(mortar-board) Junior Developer',
        level: DeveloperLevel.Junior
      });

      await manager.start();

      expect(mockConfigManager.setExperienceLevel).toHaveBeenCalledWith(DeveloperLevel.Junior);
    });
  });

  describe('start - skip scenarios', () => {
    it('should handle immediate skip on welcome', async () => {
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce('Skip');
      (vscode.window.showWarningMessage as jest.Mock).mockResolvedValueOnce('Yes, Skip');

      await manager.start();

      expect(mockContext.globalState.update).toHaveBeenCalledWith('onboarding.skipped', true);
      expect(mockContext.globalState.update).not.toHaveBeenCalledWith('onboarding.completed', true);
    });

    it('should handle skip during experience level selection', async () => {
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce('Get Started');
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined); // User canceled
      (vscode.window.showWarningMessage as jest.Mock).mockResolvedValueOnce('Yes, Skip');

      await manager.start();

      expect(mockContext.globalState.update).toHaveBeenCalledWith('onboarding.skipped', true);
    });

    it('should handle skip during tour', async () => {
      (vscode.window.showInformationMessage as jest.Mock)
        .mockResolvedValueOnce('Get Started')
        .mockResolvedValueOnce({ title: 'Skip Tour' }); // Skip on first tour slide

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce({
        label: '$(code) Mid-Level Developer',
        level: DeveloperLevel.Mid
      });

      (vscode.window.showWarningMessage as jest.Mock).mockResolvedValueOnce('Yes, Skip');

      await manager.start();

      expect(mockContext.globalState.update).toHaveBeenCalledWith('onboarding.skipped', true);
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully', async () => {
      (vscode.window.showInformationMessage as jest.Mock).mockRejectedValueOnce(
        new Error('Test error')
      );

      await manager.start();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('onboarding encountered an error')
      );
      expect(mockContext.globalState.update).not.toHaveBeenCalledWith('onboarding.completed', true);
    });

    it('should not throw on error', async () => {
      (vscode.window.showInformationMessage as jest.Mock).mockRejectedValueOnce(
        new Error('Critical error')
      );

      await expect(manager.start()).resolves.not.toThrow();
    });
  });

  describe('dashboard opening', () => {
    it('should complete onboarding when Open Dashboard is selected', async () => {
      // Note: The actual dashboard opening happens in setTimeout which is hard to test
      // This test verifies the flow completes successfully when user selects "Open Dashboard"
      (vscode.window.showInformationMessage as jest.Mock)
        .mockResolvedValueOnce('Get Started')
        .mockResolvedValueOnce({ title: 'Next' })
        .mockResolvedValueOnce({ title: 'Next' })
        .mockResolvedValueOnce({ title: 'Finish Tour' })
        .mockResolvedValueOnce('Open Dashboard');

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce({
        label: '$(star) Senior Developer',
        level: DeveloperLevel.Senior
      });

      await manager.start();

      // Verify onboarding completed successfully
      expect(mockContext.globalState.update).toHaveBeenCalledWith('onboarding.completed', true);
      expect(mockConfigManager.setExperienceLevel).toHaveBeenCalledWith(DeveloperLevel.Senior);
    });

    it('should not open dashboard when user selects Start Coding', async () => {
      (vscode.window.showInformationMessage as jest.Mock)
        .mockResolvedValueOnce('Get Started')
        .mockResolvedValueOnce({ title: 'Next' })
        .mockResolvedValueOnce({ title: 'Next' })
        .mockResolvedValueOnce({ title: 'Finish Tour' })
        .mockResolvedValueOnce('Start Coding');

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce({
        label: '$(code) Mid-Level Developer',
        level: DeveloperLevel.Mid
      });

      await manager.start();

      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });
  });
});
