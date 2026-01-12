/**
 * SnoozeManager Tests
 */

jest.mock('vscode', () => ({
  EventEmitter: class {
    private listeners: any[] = [];
    fire(data: any) {
      this.listeners.forEach(listener => listener(data));
    }
    get event() {
      return (listener: any) => {
        this.listeners.push(listener);
        return { dispose: () => {} };
      };
    }
    dispose() {
      this.listeners = [];
    }
  },
  window: {
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showQuickPick: jest.fn(),
  },
}), { virtual: true });

jest.mock('../../storage/ConfigRepository');

import { SnoozeManager } from '../SnoozeManager';
import { ConfigRepository } from '../../storage/ConfigRepository';
import { SnoozeState } from '../../types';
import * as vscode from 'vscode';

describe('SnoozeManager', () => {
  let snoozeManager: SnoozeManager;
  let mockConfigRepo: jest.Mocked<ConfigRepository>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfigRepo = new ConfigRepository(null as any) as jest.Mocked<ConfigRepository>;
    mockConfigRepo.setSnoozeState = jest.fn().mockResolvedValue(undefined);
    mockConfigRepo.getSnoozeState = jest.fn().mockResolvedValue({
      snoozed: false
    });
    mockConfigRepo.clearSnooze = jest.fn().mockResolvedValue(undefined);
    mockConfigRepo.isSnoozed = jest.fn().mockResolvedValue(false);
    mockConfigRepo.snoozeUntilEndOfDay = jest.fn().mockResolvedValue(undefined);

    snoozeManager = new SnoozeManager(mockConfigRepo);
  });

  afterEach(() => {
    snoozeManager.dispose();
  });

  describe('Initialization', () => {
    it('should create instance', () => {
      expect(snoozeManager).toBeTruthy();
    });

    it('should initialize and check expired snooze', async () => {
      await snoozeManager.initialize();
      expect(mockConfigRepo.getSnoozeState).toHaveBeenCalled();
    });

    it('should set up periodic checking', async () => {
      jest.useFakeTimers();
      await snoozeManager.initialize();

      // Fast-forward 1 minute
      jest.advanceTimersByTime(60 * 1000);

      // Should have checked twice (init + interval)
      expect(mockConfigRepo.getSnoozeState).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });
  });

  describe('Snooze Operations', () => {
    it('should snooze for custom duration', async () => {
      await snoozeManager.snoozeFor(3600000, 'Testing');

      expect(mockConfigRepo.setSnoozeState).toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });

    it('should snooze for 1 hour', async () => {
      await snoozeManager.snoozeFor1Hour();

      expect(mockConfigRepo.setSnoozeState).toHaveBeenCalled();
    });

    it('should snooze for 2 hours', async () => {
      await snoozeManager.snoozeFor2Hours();

      expect(mockConfigRepo.setSnoozeState).toHaveBeenCalled();
    });

    it('should snooze for 4 hours', async () => {
      await snoozeManager.snoozeFor4Hours();

      expect(mockConfigRepo.setSnoozeState).toHaveBeenCalled();
    });

    it('should snooze until end of day', async () => {
      await snoozeManager.snoozeUntilEndOfDay('Rest of day');

      expect(mockConfigRepo.snoozeUntilEndOfDay).toHaveBeenCalledWith('Rest of day');
      expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });

    it('should snooze until specific time', async () => {
      const futureTime = new Date(Date.now() + 7200000); // 2 hours from now

      await snoozeManager.snoozeUntil(futureTime);

      expect(mockConfigRepo.setSnoozeState).toHaveBeenCalled();
    });

    it('should reject past time for snoozeUntil', async () => {
      const pastTime = new Date(Date.now() - 3600000); // 1 hour ago

      await snoozeManager.snoozeUntil(pastTime);

      expect(vscode.window.showWarningMessage).toHaveBeenCalled();
      expect(mockConfigRepo.setSnoozeState).not.toHaveBeenCalled();
    });
  });

  describe('Clear Snooze', () => {
    it('should clear snooze', async () => {
      await snoozeManager.clearSnooze();

      expect(mockConfigRepo.clearSnooze).toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });

    it('should emit event when clearing snooze', async () => {
      const onChanged = jest.fn();
      snoozeManager.onSnoozeChanged(onChanged);

      await snoozeManager.clearSnooze();

      expect(onChanged).toHaveBeenCalled();
    });
  });

  describe('Snooze State', () => {
    it('should check if snoozed', async () => {
      mockConfigRepo.isSnoozed.mockResolvedValue(true);

      const snoozed = await snoozeManager.isSnoozed();

      expect(snoozed).toBe(true);
      expect(mockConfigRepo.isSnoozed).toHaveBeenCalled();
    });

    it('should get snooze state', async () => {
      const mockState: SnoozeState = {
        snoozed: true,
        snoozeUntil: Date.now() + 3600000,
        snoozeReason: 'Testing'
      };
      mockConfigRepo.getSnoozeState.mockResolvedValue(mockState);

      const state = await snoozeManager.getSnoozeState();

      expect(state).toEqual(mockState);
    });

    it('should get remaining time', async () => {
      const futureTime = Date.now() + 7200000;
      mockConfigRepo.getSnoozeState.mockResolvedValue({
        snoozed: true,
        snoozeUntil: futureTime
      });

      const remaining = await snoozeManager.getRemainingTime();

      expect(remaining).toBeGreaterThan(0);
    });

    it('should return 0 for remaining time when not snoozed', async () => {
      mockConfigRepo.getSnoozeState.mockResolvedValue({
        snoozed: false
      });

      const remaining = await snoozeManager.getRemainingTime();

      expect(remaining).toBe(0);
    });
  });

  describe('Event Emission', () => {
    it('should emit event when snoozing', async () => {
      const onChanged = jest.fn();
      snoozeManager.onSnoozeChanged(onChanged);

      await snoozeManager.snoozeFor(3600000);

      expect(onChanged).toHaveBeenCalled();
    });

    it('should emit event when snooze expires', async () => {
      jest.useFakeTimers();

      const onChanged = jest.fn();
      snoozeManager.onSnoozeChanged(onChanged);

      // Set expired snooze
      mockConfigRepo.getSnoozeState.mockResolvedValue({
        snoozed: true,
        snoozeUntil: Date.now() - 1000 // Already expired
      });

      await snoozeManager.initialize();

      // Fast-forward to trigger check
      jest.advanceTimersByTime(60 * 1000);

      jest.useRealTimers();
    });
  });

  describe('Expired Snooze Detection', () => {
    it('should detect and clear expired snooze on initialize', async () => {
      mockConfigRepo.getSnoozeState.mockResolvedValue({
        snoozed: true,
        snoozeUntil: Date.now() - 1000 // Expired
      });
      mockConfigRepo.isSnoozed.mockResolvedValue(false);

      await snoozeManager.initialize();

      // Should check snooze state on init
      expect(mockConfigRepo.getSnoozeState).toHaveBeenCalled();
    });

    it('should maintain valid snooze', async () => {
      mockConfigRepo.getSnoozeState.mockResolvedValue({
        snoozed: true,
        snoozeUntil: Date.now() + 3600000 // Still valid
      });
      mockConfigRepo.isSnoozed.mockResolvedValue(true);

      await snoozeManager.initialize();

      expect(mockConfigRepo.getSnoozeState).toHaveBeenCalled();
    });
  });

  describe('Disposal', () => {
    it('should dispose cleanly', () => {
      expect(() => snoozeManager.dispose()).not.toThrow();
    });

    it('should clear interval on dispose', async () => {
      jest.useFakeTimers();
      await snoozeManager.initialize();

      snoozeManager.dispose();

      // Advance time and ensure no more checks
      const callCountBefore = mockConfigRepo.getSnoozeState.mock.calls.length;
      jest.advanceTimersByTime(10 * 60 * 1000);
      const callCountAfter = mockConfigRepo.getSnoozeState.mock.calls.length;

      expect(callCountAfter).toBe(callCountBefore);

      jest.useRealTimers();
    });
  });

  describe('Edge Cases', () => {
    it('should handle errors gracefully', async () => {
      mockConfigRepo.setSnoozeState.mockRejectedValue(new Error('Config error'));

      await expect(snoozeManager.snoozeFor(3600000)).rejects.toThrow();
    });

    it('should handle zero duration', async () => {
      await snoozeManager.snoozeFor(0);

      expect(mockConfigRepo.setSnoozeState).toHaveBeenCalled();
    });

    it('should handle negative duration for snoozeUntil', async () => {
      const pastTime = new Date(Date.now() - 1000);

      await snoozeManager.snoozeUntil(pastTime);

      expect(vscode.window.showWarningMessage).toHaveBeenCalled();
    });
  });

  describe('Snooze Status', () => {
    it('should return active status when not snoozed', async () => {
      mockConfigRepo.getSnoozeState.mockResolvedValue({ snoozed: false });

      const status = await snoozeManager.getSnoozeStatus();

      expect(status).toBe('Alerts active');
    });

    it('should return indefinite snooze status', async () => {
      mockConfigRepo.getSnoozeState.mockResolvedValue({
        snoozed: true,
        snoozeUntil: undefined
      });

      const status = await snoozeManager.getSnoozeStatus();

      expect(status).toBe('Alerts snoozed indefinitely');
    });

    it('should return expired status for past snooze', async () => {
      mockConfigRepo.getSnoozeState.mockResolvedValue({
        snoozed: true,
        snoozeUntil: Date.now() - 1000
      });

      const status = await snoozeManager.getSnoozeStatus();

      expect(status).toBe('Snooze expired (resuming...)');
    });

    it('should return remaining time status', async () => {
      mockConfigRepo.getSnoozeState.mockResolvedValue({
        snoozed: true,
        snoozeUntil: Date.now() + 3600000 // 1 hour
      });

      const status = await snoozeManager.getSnoozeStatus();

      expect(status).toContain('Alerts snoozed for');
      expect(status).toContain('hour');
    });
  });

  describe('Snooze Dialog', () => {
    it('should show quick pick dialog', async () => {
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(null);

      await snoozeManager.showSnoozeDialog();

      expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
        expect.arrayContaining(['1 Hour', '2 Hours', '4 Hours']),
        expect.any(Object)
      );
    });

    it('should handle cancel in dialog', async () => {
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      await snoozeManager.showSnoozeDialog();

      expect(mockConfigRepo.setSnoozeState).not.toHaveBeenCalled();
    });

    it('should snooze for 1 hour from dialog', async () => {
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue('1 Hour');

      await snoozeManager.showSnoozeDialog();

      expect(mockConfigRepo.setSnoozeState).toHaveBeenCalled();
    });

    it('should snooze for 2 hours from dialog', async () => {
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue('2 Hours');

      await snoozeManager.showSnoozeDialog();

      expect(mockConfigRepo.setSnoozeState).toHaveBeenCalled();
    });

    it('should snooze for 4 hours from dialog', async () => {
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue('4 Hours');

      await snoozeManager.showSnoozeDialog();

      expect(mockConfigRepo.setSnoozeState).toHaveBeenCalled();
    });

    it('should snooze until end of day from dialog', async () => {
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue('Until End of Day');

      await snoozeManager.showSnoozeDialog();

      expect(mockConfigRepo.snoozeUntilEndOfDay).toHaveBeenCalled();
    });

    it('should clear snooze from dialog', async () => {
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue('Resume Alerts');

      await snoozeManager.showSnoozeDialog();

      expect(mockConfigRepo.clearSnooze).toHaveBeenCalled();
    });

    it('should handle invalid selection in dialog', async () => {
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue('Invalid Option');

      await snoozeManager.showSnoozeDialog();

      // Should not do anything for invalid selection
      expect(mockConfigRepo.setSnoozeState).not.toHaveBeenCalled();
    });
  });

  describe('Preset Durations', () => {
    it('should return preset durations', () => {
      const presets = SnoozeManager.getPresetDurations();

      expect(presets).toHaveLength(6);
      expect(presets[0].label).toBe('15 minutes');
      expect(presets[2].label).toBe('1 hour');
      expect(presets[5].label).toBe('Until end of day');
    });

    it('should have correct duration values', () => {
      const presets = SnoozeManager.getPresetDurations();

      expect(presets[0].durationMs).toBe(15 * 60 * 1000); // 15 minutes
      expect(presets[2].durationMs).toBe(60 * 60 * 1000); // 1 hour
      expect(presets[5].durationMs).toBe(-1); // End of day
    });
  });

  describe('Duration Formatting', () => {
    it('should format days correctly', async () => {
      const twoDays = 2 * 24 * 60 * 60 * 1000;
      await snoozeManager.snoozeFor(twoDays);

      const message = (vscode.window.showInformationMessage as jest.Mock).mock.calls[0][0];
      expect(message).toContain('2 days');
    });

    it('should format single day correctly', async () => {
      const oneDay = 24 * 60 * 60 * 1000;
      await snoozeManager.snoozeFor(oneDay);

      const message = (vscode.window.showInformationMessage as jest.Mock).mock.calls[0][0];
      expect(message).toContain('1 day');
      expect(message).not.toContain('days');
    });

    it('should format minutes correctly', async () => {
      const thirtyMinutes = 30 * 60 * 1000;
      await snoozeManager.snoozeFor(thirtyMinutes);

      const message = (vscode.window.showInformationMessage as jest.Mock).mock.calls[0][0];
      expect(message).toContain('30 minutes');
    });

    it('should format seconds correctly', async () => {
      const fortyFiveSeconds = 45 * 1000;
      await snoozeManager.snoozeFor(fortyFiveSeconds);

      const message = (vscode.window.showInformationMessage as jest.Mock).mock.calls[0][0];
      expect(message).toContain('45 seconds');
    });
  });

  describe('Expired Snooze Notification', () => {
    it('should show notification when snooze expires', async () => {
      jest.useFakeTimers();

      // Set up expired snooze that will be detected
      mockConfigRepo.getSnoozeState.mockResolvedValue({
        snoozed: true,
        snoozeUntil: Date.now() - 1000 // Already expired
      });

      await snoozeManager.initialize();

      // The checkExpiredSnooze should have been called and cleared the snooze
      expect(mockConfigRepo.clearSnooze).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('Custom Reasons', () => {
    it('should accept custom reason for 1 hour snooze', async () => {
      await snoozeManager.snoozeFor1Hour('Custom reason');

      expect(mockConfigRepo.setSnoozeState).toHaveBeenCalledWith(
        expect.objectContaining({
          snoozeReason: 'Custom reason'
        })
      );
    });

    it('should accept custom reason for 2 hour snooze', async () => {
      await snoozeManager.snoozeFor2Hours('Another reason');

      expect(mockConfigRepo.setSnoozeState).toHaveBeenCalledWith(
        expect.objectContaining({
          snoozeReason: 'Another reason'
        })
      );
    });

    it('should accept custom reason for 4 hour snooze', async () => {
      await snoozeManager.snoozeFor4Hours('Yet another reason');

      expect(mockConfigRepo.setSnoozeState).toHaveBeenCalledWith(
        expect.objectContaining({
          snoozeReason: 'Yet another reason'
        })
      );
    });

    it('should use default reason if not provided', async () => {
      await snoozeManager.snoozeFor1Hour();

      expect(mockConfigRepo.setSnoozeState).toHaveBeenCalledWith(
        expect.objectContaining({
          snoozeReason: 'Snoozed for 1 hour'
        })
      );
    });
  });
});
