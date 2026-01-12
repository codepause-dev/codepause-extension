/**
 * OnboardingFlow Tests - Simplified
 */

jest.mock('vscode', () => ({
  window: {
    showQuickPick: jest.fn(),
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    createWebviewPanel: jest.fn(() => ({
      webview: {
        html: '',
        onDidReceiveMessage: jest.fn(() => ({
          dispose: jest.fn(),
        })),
      },
      onDidDispose: jest.fn(() => ({
        dispose: jest.fn(),
      })),
      dispose: jest.fn(),
    })),
  },
  commands: {
    executeCommand: jest.fn(),
  },
  ViewColumn: {
    One: 1,
    Two: 2,
    Three: 3,
  },
  ExtensionContext: class {},
}), { virtual: true });

jest.mock('../../storage/ConfigRepository');

import { OnboardingFlow } from '../OnboardingFlow';
import { ConfigRepository } from '../../storage/ConfigRepository';
import { DeveloperLevel } from '../../types';
import * as vscode from 'vscode';

describe('OnboardingFlow', () => {
  let onboardingFlow: OnboardingFlow;
  let mockConfigRepo: jest.Mocked<ConfigRepository>;
  let mockContext: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      subscriptions: [],
      globalState: {
        get: jest.fn(),
        update: jest.fn(),
      },
      workspaceState: {
        get: jest.fn(),
        update: jest.fn(),
      },
    };

    mockConfigRepo = new ConfigRepository(null as any) as jest.Mocked<ConfigRepository>;
    mockConfigRepo.getUserConfig = jest.fn().mockResolvedValue({
      experienceLevel: DeveloperLevel.Mid,
      onboardingCompleted: false,
    } as any);
    mockConfigRepo.updateConfig = jest.fn().mockResolvedValue({} as any);

    onboardingFlow = new OnboardingFlow(mockConfigRepo);
  });

  describe('Initialization', () => {
    it('should create instance', () => {
      expect(onboardingFlow).toBeTruthy();
    });
  });

  describe('Onboarding Start', () => {
    it('should start without errors', async () => {
      await expect(onboardingFlow.start(mockContext)).resolves.not.toThrow();
    });

    it('should create webview panel', async () => {
      await onboardingFlow.start(mockContext);
      expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
    });

    it('should handle multiple starts', async () => {
      await onboardingFlow.start(mockContext);
      await expect(onboardingFlow.start(mockContext)).resolves.not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle config errors gracefully', async () => {
      mockConfigRepo.updateConfig.mockRejectedValue(new Error('Config error'));
      await expect(onboardingFlow.start(mockContext)).resolves.not.toThrow();
    });

    it('should handle webview panel creation errors', async () => {
      (vscode.window.createWebviewPanel as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Webview error');
      });
      await expect(onboardingFlow.start(mockContext)).rejects.toThrow();
    });
  });

  describe('Already Completed Onboarding', () => {
    beforeEach(() => {
      mockConfigRepo.getUserConfig.mockResolvedValue({
        experienceLevel: DeveloperLevel.Mid,
        onboardingCompleted: true,
      } as any);
    });

    it('should prompt to restart if already completed', async () => {
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('No');

      await onboardingFlow.start(mockContext);

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('already completed'),
        'Yes',
        'No'
      );
    });

    it('should not create webview if user declines restart', async () => {
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('No');

      await onboardingFlow.start(mockContext);

      expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
    });

    it('should restart onboarding if user accepts', async () => {
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Yes');

      await onboardingFlow.start(mockContext);

      expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
    });
  });

  describe('Message Handling - Complete', () => {
    let messageHandler: (message: any) => void;

    beforeEach(async () => {
      mockConfigRepo.saveUserConfig = jest.fn().mockResolvedValue({} as any);

      const mockPanel = {
        webview: {
          html: '',
          onDidReceiveMessage: jest.fn((handler: any) => {
            messageHandler = handler;
            return { dispose: jest.fn() };
          }),
        },
        onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
        dispose: jest.fn(),
      };

      (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);

      await onboardingFlow.start(mockContext);
    });

    it('should handle complete message', async () => {
      const completeData = {
        experienceLevel: DeveloperLevel.Senior,
        enableGamification: true,
        alertFrequency: 'high'
      };

      await messageHandler({ type: 'complete', data: completeData });

      expect(mockConfigRepo.saveUserConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          experienceLevel: DeveloperLevel.Senior,
          enableGamification: true,
          alertFrequency: 'high',
          onboardingCompleted: true
        })
      );
    });

    it('should show completion message', async () => {
      await messageHandler({
        type: 'complete',
        data: {
          experienceLevel: DeveloperLevel.Mid,
          enableGamification: false,
          alertFrequency: 'low'
        }
      });

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('CodePause is ready')
      );
    });

    it('should open dashboard when user selects it', async () => {
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Open Dashboard');

      await messageHandler({
        type: 'complete',
        data: {
          experienceLevel: DeveloperLevel.Mid,
          enableGamification: true,
          alertFrequency: 'medium'
        }
      });

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('codePause.openDashboard');
    });

    it('should handle save errors', async () => {
      mockConfigRepo.saveUserConfig.mockRejectedValue(new Error('Save failed'));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await messageHandler({
        type: 'complete',
        data: {
          experienceLevel: DeveloperLevel.Mid,
          enableGamification: true,
          alertFrequency: 'medium'
        }
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to complete onboarding:',
        expect.any(Error)
      );
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'Failed to save onboarding preferences'
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Message Handling - Skip', () => {
    let messageHandler: (message: any) => void;

    beforeEach(async () => {
      mockConfigRepo.completeOnboarding = jest.fn().mockResolvedValue(undefined);

      const mockPanel = {
        webview: {
          html: '',
          onDidReceiveMessage: jest.fn((handler: any) => {
            messageHandler = handler;
            return { dispose: jest.fn() };
          }),
        },
        onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
        dispose: jest.fn(),
      };

      (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);

      await onboardingFlow.start(mockContext);
    });

    it('should handle skip message', async () => {
      await messageHandler({ type: 'skip' });

      expect(mockConfigRepo.completeOnboarding).toHaveBeenCalled();
    });

    it('should show skip confirmation message', async () => {
      await messageHandler({ type: 'skip' });

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('default settings')
      );
    });

    it('should handle skip errors gracefully', async () => {
      mockConfigRepo.completeOnboarding.mockRejectedValue(new Error('Skip failed'));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await messageHandler({ type: 'skip' });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to skip onboarding:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('HTML Generation', () => {
    it('should generate onboarding HTML', async () => {
      let capturedHtml = '';

      const mockPanel = {
        webview: {
          html: '',
          onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })),
        },
        onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
        dispose: jest.fn(),
      };

      (vscode.window.createWebviewPanel as jest.Mock).mockImplementation((_viewType, _title, _column, _options) => {
        const panel = mockPanel;
        // Capture the HTML when it's set
        Object.defineProperty(panel.webview, 'html', {
          set: (value: string) => { capturedHtml = value; },
          get: () => capturedHtml,
        });
        return panel;
      });

      await onboardingFlow.start(mockContext);

      expect(capturedHtml).toContain('<!DOCTYPE html>');
      expect(capturedHtml).toContain('CodePause Setup');
      expect(capturedHtml).toContain('Welcome to CodePause');
    });

    it('should include privacy message', async () => {
      let capturedHtml = '';

      const mockPanel = {
        webview: {
          html: '',
          onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })),
        },
        onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
        dispose: jest.fn(),
      };

      (vscode.window.createWebviewPanel as jest.Mock).mockImplementation(() => {
        const panel = mockPanel;
        Object.defineProperty(panel.webview, 'html', {
          set: (value: string) => { capturedHtml = value; },
          get: () => capturedHtml,
        });
        return panel;
      });

      await onboardingFlow.start(mockContext);

      expect(capturedHtml).toContain('Privacy First');
      expect(capturedHtml).toContain('100% local');
    });

    it('should include experience level options', async () => {
      let capturedHtml = '';

      const mockPanel = {
        webview: {
          html: '',
          onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })),
        },
        onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
        dispose: jest.fn(),
      };

      (vscode.window.createWebviewPanel as jest.Mock).mockImplementation(() => {
        const panel = mockPanel;
        Object.defineProperty(panel.webview, 'html', {
          set: (value: string) => { capturedHtml = value; },
          get: () => capturedHtml,
        });
        return panel;
      });

      await onboardingFlow.start(mockContext);

      expect(capturedHtml).toContain('Junior Developer');
      expect(capturedHtml).toContain('Mid-Level Developer');
      expect(capturedHtml).toContain('Senior Developer');
    });

    it('should include alert frequency options', async () => {
      let capturedHtml = '';

      const mockPanel = {
        webview: {
          html: '',
          onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })),
        },
        onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
        dispose: jest.fn(),
      };

      (vscode.window.createWebviewPanel as jest.Mock).mockImplementation(() => {
        const panel = mockPanel;
        Object.defineProperty(panel.webview, 'html', {
          set: (value: string) => { capturedHtml = value; },
          get: () => capturedHtml,
        });
        return panel;
      });

      await onboardingFlow.start(mockContext);

      expect(capturedHtml).toContain('Alert Frequency');
      expect(capturedHtml).toContain('Low - Minimal Interruptions');
      expect(capturedHtml).toContain('Medium - Balanced Coaching');
      expect(capturedHtml).toContain('High - Active Guidance');
    });

    it('should include gamification option', async () => {
      let capturedHtml = '';

      const mockPanel = {
        webview: {
          html: '',
          onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })),
        },
        onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
        dispose: jest.fn(),
      };

      (vscode.window.createWebviewPanel as jest.Mock).mockImplementation(() => {
        const panel = mockPanel;
        Object.defineProperty(panel.webview, 'html', {
          set: (value: string) => { capturedHtml = value; },
          get: () => capturedHtml,
        });
        return panel;
      });

      await onboardingFlow.start(mockContext);

      expect(capturedHtml).toContain('Enable Gamification');
      expect(capturedHtml).toContain('achievements');
    });
  });
});
