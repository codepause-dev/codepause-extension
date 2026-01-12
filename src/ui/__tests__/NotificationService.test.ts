/**
 * NotificationService Tests - Comprehensive
 */

jest.mock('vscode', () => ({
  window: {
    showInformationMessage: jest.fn().mockResolvedValue(undefined),
    showWarningMessage: jest.fn().mockResolvedValue(undefined),
    showErrorMessage: jest.fn().mockResolvedValue(undefined),
  },
  commands: {
    executeCommand: jest.fn().mockResolvedValue(undefined),
  },
  env: {
    openExternal: jest.fn().mockResolvedValue(true),
  },
  Uri: {
    parse: jest.fn((url: string) => ({ toString: () => url })),
  },
}), { virtual: true });

jest.mock('../../storage/ConfigRepository');

import { NotificationService } from '../NotificationService';
import { ConfigRepository } from '../../storage/ConfigRepository';
import { Alert, AlertType } from '../../types';
import * as vscode from 'vscode';

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockConfigRepo: jest.Mocked<ConfigRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfigRepo = new ConfigRepository(null as any) as jest.Mocked<ConfigRepository>;
    mockConfigRepo.getSnoozeState = jest.fn().mockResolvedValue({ snoozed: false });
    mockConfigRepo.snoozeUntilEndOfDay = jest.fn().mockResolvedValue(undefined);

    notificationService = new NotificationService(mockConfigRepo);
  });

  describe('Initialization', () => {
    it('should create instance', () => {
      expect(notificationService).toBeTruthy();
    });
  });

  describe('Alert Display', () => {
    it('should show alerts without errors', async () => {
      const alert: Alert = {
        id: 'test',
        type: AlertType.GentleNudge,
        title: 'Test',
        message: 'Test message',
        timestamp: Date.now(),
        actions: [],
      };

      await expect(notificationService.showAlert(alert)).resolves.not.toThrow();
    });

    it('should handle different alert types', async () => {
      const types = [AlertType.GentleNudge, AlertType.StreakWarning, AlertType.EducationalMoment];

      for (const type of types) {
        const alert: Alert = {
          id: 'test',
          type,
          title: 'Test',
          message: 'Test',
          timestamp: Date.now(),
          actions: [],
        };

        await expect(notificationService.showAlert(alert)).resolves.not.toThrow();
      }
    });

    it('should handle snoozed state', async () => {
      mockConfigRepo.getSnoozeState.mockResolvedValue({ snoozed: true, snoozeUntil: Date.now() + 10000 });

      const alert: Alert = {
        id: 'test',
        type: AlertType.GentleNudge,
        title: 'Test',
        message: 'Test',
        timestamp: Date.now(),
        actions: [],
      };

      await expect(notificationService.showAlert(alert)).resolves.not.toThrow();
    });

    it('should allow achievements when snoozed', async () => {
      mockConfigRepo.getSnoozeState.mockResolvedValue({ snoozed: true, snoozeUntil: Date.now() + 10000 });

      const alert: Alert = {
        id: 'test-achievement',
        type: AlertType.Achievement,
        title: 'Achievement',
        message: 'You did it!',
        timestamp: Date.now(),
        actions: [],
      };

      await notificationService.showAlert(alert);
      expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });
  });

  describe('Duplicate Detection', () => {
    it('should block duplicate alert with same ID', async () => {
      const alert: Alert = {
        id: 'same-id',
        type: AlertType.GentleNudge,
        title: 'Test',
        message: 'Test',
        timestamp: Date.now(),
        actions: [],
      };

      const promise1 = notificationService.showAlert(alert);
      const promise2 = notificationService.showAlert(alert);

      await Promise.all([promise1, promise2]);

      expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
    });

    it('should block duplicate messages within 5 seconds', async () => {
      const alert1: Alert = {
        id: 'id1',
        type: AlertType.GentleNudge,
        title: 'Test',
        message: 'Same message',
        timestamp: Date.now(),
        actions: [],
      };

      const alert2: Alert = {
        id: 'id2',
        type: AlertType.GentleNudge,
        title: 'Test',
        message: 'Same message',
        timestamp: Date.now(),
        actions: [],
      };

      await notificationService.showAlert(alert1);
      await notificationService.showAlert(alert2);

      expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
    });

    it('should normalize timeDelta in message for duplicate detection', async () => {
      const alert1: Alert = {
        id: 'id1',
        type: AlertType.GentleNudge,
        title: 'Test',
        message: 'Review time 150ms review time',
        timestamp: Date.now(),
        actions: [],
      };

      const alert2: Alert = {
        id: 'id2',
        type: AlertType.GentleNudge,
        title: 'Test',
        message: 'Review time 175ms review time',
        timestamp: Date.now(),
        actions: [],
      };

      await notificationService.showAlert(alert1);
      await notificationService.showAlert(alert2);

      expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
    });

    it('should block duplicate timeDelta within range', async () => {
      const alert1: Alert = {
        id: 'id1',
        type: AlertType.GentleNudge,
        title: 'Test',
        message: 'Test',
        timestamp: Date.now(),
        actions: [],
        metadata: { detection: { timeDelta: 1550 } },
      };

      const alert2: Alert = {
        id: 'id2',
        type: AlertType.GentleNudge,
        title: 'Test',
        message: 'Test',
        timestamp: Date.now(),
        actions: [],
        metadata: { detection: { timeDelta: 1575 } },
      };

      await notificationService.showAlert(alert1);
      await notificationService.showAlert(alert2);

      expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('Specific Notifications', () => {
    it('should show gentle nudge', async () => {
      await notificationService.showGentleNudge(1500, 3000);
      expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });

    it('should show educational moment', async () => {
      await notificationService.showEducationalMoment('Test tip');
      expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });

    it('should show streak warning', async () => {
      await notificationService.showStreakWarning(5);
      expect(vscode.window.showWarningMessage).toHaveBeenCalled();
    });

    it('should show achievement unlocked', async () => {
      await notificationService.showAchievementUnlocked('First Steps', 'You did it!');
      expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });

    it('should show level up', async () => {
      await notificationService.showLevelUp(2, 'Novice Coder', '🌱');
      expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });

    it('should show achievement progress', async () => {
      await notificationService.showAchievementProgress('Test Achievement', 75, '🏆');
      expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });

    it('should show XP gain for large amounts', async () => {
      await notificationService.showXPGain(15, 'Completed task');
      expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });

    it('should not show XP gain for small amounts', async () => {
      await notificationService.showXPGain(5, 'Small action');
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    });

    it('should show XP gain when explicitly requested', async () => {
      await notificationService.showXPGain(5, 'Small action', true);
      expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });

    it('should show progress notification', async () => {
      await notificationService.showProgressNotification('Loading...');
      expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });
  });

  describe('Error Notifications', () => {
    it('should show error message', () => {
      notificationService.showError('Test error');
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('CodePause: Test error');
    });

    it('should show error with action', () => {
      notificationService.showError('Test error', 'Retry');
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('CodePause: Test error', 'Retry');
    });

    it('should show error with guidance', () => {
      const error = new Error('Database locked');
      notificationService.showErrorWithGuidance(error, 'Saving metrics');
      expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    });

    it('should provide database error guidance', () => {
      const error = new Error('SQLITE_BUSY: database is locked');
      notificationService.showErrorWithGuidance(error, 'test');
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Database error'),
        'Retry',
        'Report Issue'
      );
    });

    it('should provide file not found error guidance', () => {
      const error = new Error('ENOENT: file not found');
      notificationService.showErrorWithGuidance(error, 'test');
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('File not found'),
        'Retry',
        'Report Issue'
      );
    });

    it('should provide permission error guidance', () => {
      const error = new Error('EACCES: permission denied');
      notificationService.showErrorWithGuidance(error, 'test');
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Permission denied'),
        'Retry',
        'Report Issue'
      );
    });

    it('should provide network error guidance', () => {
      const error = new Error('Network timeout');
      notificationService.showErrorWithGuidance(error, 'test');
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Network error'),
        'Retry',
        'Report Issue'
      );
    });

    it('should provide config error guidance', () => {
      const error = new Error('Invalid configuration');
      notificationService.showErrorWithGuidance(error, 'config loading');
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Configuration error'),
        'Retry',
        'Report Issue'
      );
    });

    it('should provide tracker error guidance', () => {
      const error = new Error('Tracker failed');
      notificationService.showErrorWithGuidance(error, 'tracker initialization');
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Tracking error'),
        'Retry',
        'Report Issue'
      );
    });

    it('should provide generic error guidance', () => {
      const error = new Error('Unknown error');
      notificationService.showErrorWithGuidance(error, 'generic operation');
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Unknown error'),
        'Retry',
        'Report Issue'
      );
    });
  });

  describe('Skill-Level Notifications', () => {
    it('should show over-reliance notification for junior', async () => {
      await notificationService.showOverRelianceNotification('junior', 75, 60);
      expect(vscode.window.showInformationMessage).toHaveBeenCalled();
      const call = (vscode.window.showInformationMessage as jest.Mock).mock.calls[0][0];
      expect(call).toContain('Skill Development Check');
    });

    it('should show over-reliance notification for mid', async () => {
      await notificationService.showOverRelianceNotification('mid', 75, 60);
      expect(vscode.window.showInformationMessage).toHaveBeenCalled();
      const call = (vscode.window.showInformationMessage as jest.Mock).mock.calls[0][0];
      expect(call).toContain('Balance Check');
    });

    it('should show over-reliance notification for senior', async () => {
      await notificationService.showOverRelianceNotification('senior', 75, 60);
      expect(vscode.window.showInformationMessage).toHaveBeenCalled();
      const call = (vscode.window.showInformationMessage as jest.Mock).mock.calls[0][0];
      expect(call).toContain('Usage Pattern Alert');
    });

    it('should show insufficient review notification for junior', async () => {
      await notificationService.showInsufficientReviewNotification('junior', 500, 50);
      expect(vscode.window.showWarningMessage).toHaveBeenCalled();
      const call = (vscode.window.showWarningMessage as jest.Mock).mock.calls[0][0];
      expect(call).toContain('Review Reminder');
    });

    it('should show insufficient review notification for mid', async () => {
      await notificationService.showInsufficientReviewNotification('mid', 500, 50);
      expect(vscode.window.showWarningMessage).toHaveBeenCalled();
      const call = (vscode.window.showWarningMessage as jest.Mock).mock.calls[0][0];
      expect(call).toContain('Review Quality Notice');
    });

    it('should show insufficient review notification for senior', async () => {
      await notificationService.showInsufficientReviewNotification('senior', 500, 50);
      expect(vscode.window.showWarningMessage).toHaveBeenCalled();
      const call = (vscode.window.showWarningMessage as jest.Mock).mock.calls[0][0];
      expect(call).toContain('Code Ownership Alert');
    });

    it('should handle Review Now response', async () => {
      (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Review Now');
      await notificationService.showInsufficientReviewNotification('mid', 500, 50);
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.focusActiveEditorGroup');
    });

    it('should handle Snooze response', async () => {
      (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Snooze');
      await notificationService.showInsufficientReviewNotification('mid', 500, 50);
      expect(mockConfigRepo.snoozeUntilEndOfDay).toHaveBeenCalled();
    });

    it('should show positive reinforcement', async () => {
      await notificationService.showPositiveReinforcementNotification(55, 85);
      expect(vscode.window.showInformationMessage).toHaveBeenCalled();
      const call = (vscode.window.showInformationMessage as jest.Mock).mock.calls[0][0];
      expect(call).toContain('Great Work');
    });

    it('should show weekly summary - healthy pattern', async () => {
      await notificationService.showWeeklySummaryNotification('mid', 50, 0.35, 0.15);
      expect(vscode.window.showInformationMessage).toHaveBeenCalled();
      const call = (vscode.window.showInformationMessage as jest.Mock).mock.calls[0][0];
      expect(call).toContain('Healthy AI Usage Pattern');
    });

    it('should show weekly summary - unhealthy pattern', async () => {
      await notificationService.showWeeklySummaryNotification('mid', 80, 0.05, 0.02);
      expect(vscode.window.showInformationMessage).toHaveBeenCalled();
      const call = (vscode.window.showInformationMessage as jest.Mock).mock.calls[0][0];
      expect(call).toContain('Weekly Pattern Summary');
    });

    it('should show senior benchmarks in weekly summary', async () => {
      await notificationService.showWeeklySummaryNotification('senior', 80, 0.05, 0.02);
      const call = (vscode.window.showInformationMessage as jest.Mock).mock.calls[0][0];
      expect(call).toContain('30-40%');
    });
  });

  describe('Action Handling', () => {
    it('should handle snooze action', async () => {
      const alert: Alert = {
        id: 'test',
        type: AlertType.GentleNudge,
        title: 'Test',
        message: 'Test',
        timestamp: Date.now(),
        actions: [{ label: 'Snooze', action: 'snooze' }],
      };

      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Snooze');
      await notificationService.showAlert(alert);

      expect(mockConfigRepo.snoozeUntilEndOfDay).toHaveBeenCalled();
    });

    it('should handle learn-more action', async () => {
      const alert: Alert = {
        id: 'test',
        type: AlertType.EducationalMoment,
        title: 'Test',
        message: 'Test',
        timestamp: Date.now(),
        actions: [{ label: 'Learn More', action: 'learn-more' }],
      };

      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Learn More');
      await notificationService.showAlert(alert);

      expect(vscode.env.openExternal).toHaveBeenCalled();
    });

    it('should handle open-dashboard action', async () => {
      const alert: Alert = {
        id: 'test',
        type: AlertType.GentleNudge,
        title: 'Test',
        message: 'Test',
        timestamp: Date.now(),
        actions: [{ label: 'Dashboard', action: 'open-dashboard' }],
      };

      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Dashboard');
      await notificationService.showAlert(alert);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('codePause.openDashboard');
    });

    it('should handle open-settings action', async () => {
      const alert: Alert = {
        id: 'test',
        type: AlertType.GentleNudge,
        title: 'Test',
        message: 'Test',
        timestamp: Date.now(),
        actions: [{ label: 'Settings', action: 'open-settings' }],
      };

      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Settings');
      await notificationService.showAlert(alert);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('codePause.openSettings');
    });

    it('should handle dismiss action', async () => {
      const alert: Alert = {
        id: 'test',
        type: AlertType.GentleNudge,
        title: 'Test',
        message: 'Test',
        timestamp: Date.now(),
        actions: [{ label: 'Got It', action: 'dismiss' }],
      };

      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Got It');
      await notificationService.showAlert(alert);

      // Dismiss should do nothing special
      expect(mockConfigRepo.snoozeUntilEndOfDay).not.toHaveBeenCalled();
    });
  });

  describe('Utility Methods', () => {
    it('should clear all notifications', () => {
      notificationService.clearAll();
      expect(true).toBe(true); // Just verify it doesn't throw
    });
  });

  describe('Static Methods', () => {
    it('should return educational tips', () => {
      const tips = NotificationService.getEducationalTips();
      expect(tips.length).toBeGreaterThan(0);
      expect(Array.isArray(tips)).toBe(true);
    });

    it('should return random tip', () => {
      const tip = NotificationService.getRandomTip();
      expect(typeof tip).toBe('string');
      expect(tip.length).toBeGreaterThan(0);
    });

    it('should return different tips randomly', () => {
      const tips = new Set();
      for (let i = 0; i < 20; i++) {
        tips.add(NotificationService.getRandomTip());
      }
      // Should have at least 2 different tips in 20 tries
      expect(tips.size).toBeGreaterThan(1);
    });
  });
});
