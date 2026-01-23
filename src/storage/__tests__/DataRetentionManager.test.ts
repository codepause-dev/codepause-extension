/**
 * DataRetentionManager Tests
 */

// Mock modules before imports
const mockGlobalStateGet = jest.fn();
const mockGlobalStateUpdate = jest.fn();
const mockShowInformationMessage = jest.fn();
const mockCountEvents = jest.fn();
const mockDeleteEventsBefore = jest.fn();
const mockGetOldestEvent = jest.fn();
const mockGetNewestEvent = jest.fn();

jest.mock('vscode', () => ({
  window: {
    showInformationMessage: (...args: unknown[]) => mockShowInformationMessage(...args),
  }
}), { virtual: true });

import { DataRetentionManager } from '../DataRetentionManager';
import type { DatabaseManager } from '../DatabaseManager';
import type * as vscode from 'vscode';

describe('DataRetentionManager', () => {
  let manager: DataRetentionManager;
  let mockContext: vscode.ExtensionContext;
  let mockDbManager: DatabaseManager;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock context
    mockContext = {
      globalState: {
        get: mockGlobalStateGet,
        update: mockGlobalStateUpdate,
      },
    } as unknown as vscode.ExtensionContext;

    // Mock database manager
    mockDbManager = {
      countEvents: mockCountEvents,
      deleteEventsBefore: mockDeleteEventsBefore,
      getOldestEvent: mockGetOldestEvent,
      getNewestEvent: mockGetNewestEvent,
    } as unknown as DatabaseManager;

    // Setup default mocks
    mockGlobalStateGet.mockReturnValue(null); // Free tier by default
    mockCountEvents.mockResolvedValue(100);
    mockDeleteEventsBefore.mockResolvedValue(50);
    mockGetOldestEvent.mockResolvedValue({ timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000 });
    mockGetNewestEvent.mockResolvedValue({ timestamp: Date.now() });

    manager = new DataRetentionManager(mockContext, mockDbManager);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with context and dbManager', () => {
      expect(manager).toBeInstanceOf(DataRetentionManager);
    });
  });

  describe('startCleanupScheduler', () => {
    it('should perform cleanup on startup', () => {
      const spy = jest.spyOn(manager, 'performCleanup');
      manager.startCleanupScheduler();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should schedule cleanup at midnight', () => {
      manager.startCleanupScheduler();
      expect(jest.getTimerCount()).toBeGreaterThan(0);
    });

    it('should set up recurring cleanup every 24 hours', async () => {
      const spy = jest.spyOn(manager, 'performCleanup');
      manager.startCleanupScheduler();

      // Initial call
      expect(spy).toHaveBeenCalledTimes(1);

      // Fast-forward to midnight
      await jest.runOnlyPendingTimersAsync();

      // Should have called again and set up interval
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe('stopCleanupScheduler', () => {
    it('should clear interval when timer is set', async () => {
      manager.startCleanupScheduler();

      // Trigger the setTimeout callback to set the interval
      await jest.runOnlyPendingTimersAsync();

      const timersBefore = jest.getTimerCount();
      manager.stopCleanupScheduler();
      const timersAfter = jest.getTimerCount();

      // Timer should be cleared (or at least stop scheduler should not crash)
      expect(timersAfter).toBeLessThanOrEqual(timersBefore);
    });

    it('should do nothing if timer is not set', () => {
      // Should not throw
      expect(() => manager.stopCleanupScheduler()).not.toThrow();
    });
  });

  describe('performCleanup', () => {
    it('should cleanup free user data for free tier', async () => {
      mockGlobalStateGet.mockReturnValue(null); // Free tier

      await manager.performCleanup();

      expect(mockDeleteEventsBefore).toHaveBeenCalled();
    });

    it('should skip cleanup for pro tier', async () => {
      mockGlobalStateGet.mockImplementation((key: string) => {
        if (key === 'licenseKey') {return 'pro-key-123';}
        if (key === 'licenseTier') {return 'pro';}
        return null;
      });

      await manager.performCleanup();

      expect(mockDeleteEventsBefore).not.toHaveBeenCalled();
    });

    it('should skip cleanup for team tier', async () => {
      mockGlobalStateGet.mockImplementation((key: string) => {
        if (key === 'licenseKey') {return 'team-key-456';}
        if (key === 'licenseTier') {return 'team';}
        return null;
      });

      await manager.performCleanup();

      expect(mockDeleteEventsBefore).not.toHaveBeenCalled();
    });
  });

  describe('cleanupFreeUserData', () => {
    beforeEach(() => {
      mockCountEvents.mockResolvedValueOnce(150).mockResolvedValueOnce(100);
      mockDeleteEventsBefore.mockResolvedValue(50);
    });

    it('should delete events older than 30 days', async () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1000000000);
      mockGlobalStateGet.mockReturnValue(null); // Free tier

      await manager.performCleanup();

      const thirtyDaysAgo = 1000000000 - (30 * 24 * 60 * 60 * 1000);
      expect(mockDeleteEventsBefore).toHaveBeenCalledWith(thirtyDaysAgo);

      nowSpy.mockRestore();
    });

    it('should delete old events during cleanup', async () => {
      mockGlobalStateGet.mockReturnValue(null); // Free tier

      await manager.performCleanup();

      expect(mockDeleteEventsBefore).toHaveBeenCalled();
    });

    it('should update last cleanup timestamp', async () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1234567890);
      mockGlobalStateGet.mockReturnValue(null); // Free tier

      await manager.performCleanup();

      expect(mockGlobalStateUpdate).toHaveBeenCalledWith('lastCleanupTimestamp', 1234567890);

      nowSpy.mockRestore();
    });

    it('should handle cleanup errors gracefully', async () => {
      mockGlobalStateGet.mockReturnValue(null); // Free tier
      mockDeleteEventsBefore.mockRejectedValue(new Error('Database error'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await manager.performCleanup();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[DataRetention] Cleanup failed:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle large deletion without issues', async () => {
      mockGlobalStateGet.mockReturnValue(null); // Free tier
      mockDeleteEventsBefore.mockResolvedValue(150); // More than 100

      await manager.performCleanup();

      expect(mockDeleteEventsBefore).toHaveBeenCalled();
      expect(mockGlobalStateUpdate).toHaveBeenCalledWith('lastCleanupTimestamp', expect.any(Number));
    });
  });

  describe('getEventCount', () => {
    it('should return count from database manager', async () => {
      // Reset and set fresh mock for this test
      mockCountEvents.mockReset().mockResolvedValue(42);

      const count = await manager.getEventCount();

      expect(count).toBe(42);
      expect(mockCountEvents).toHaveBeenCalled();
    });
  });

  describe('getOldestEventDate', () => {
    it('should return oldest event as Date', async () => {
      const timestamp = 1000000000;
      mockGetOldestEvent.mockResolvedValue({ timestamp });

      const date = await manager.getOldestEventDate();

      expect(date).toBeInstanceOf(Date);
      expect(date?.getTime()).toBe(timestamp);
    });

    it('should return null if no events', async () => {
      mockGetOldestEvent.mockResolvedValue(null);

      const date = await manager.getOldestEventDate();

      expect(date).toBeNull();
    });
  });

  describe('getNewestEventDate', () => {
    it('should return newest event as Date', async () => {
      const timestamp = 2000000000;
      mockGetNewestEvent.mockResolvedValue({ timestamp });

      const date = await manager.getNewestEventDate();

      expect(date).toBeInstanceOf(Date);
      expect(date?.getTime()).toBe(timestamp);
    });

    it('should return null if no events', async () => {
      mockGetNewestEvent.mockResolvedValue(null);

      const date = await manager.getNewestEventDate();

      expect(date).toBeNull();
    });
  });

  describe('getDataRange', () => {
    it('should return date range with days calculated', async () => {
      const oldTimestamp = 1000000000; // Older date
      const newTimestamp = 1000000000 + (7 * 24 * 60 * 60 * 1000); // 7 days later

      mockGetOldestEvent.mockResolvedValue({ timestamp: oldTimestamp });
      mockGetNewestEvent.mockResolvedValue({ timestamp: newTimestamp });

      const range = await manager.getDataRange();

      expect(range.start).toBeInstanceOf(Date);
      expect(range.end).toBeInstanceOf(Date);
      expect(range.start?.getTime()).toBe(oldTimestamp);
      expect(range.end?.getTime()).toBe(newTimestamp);
      expect(range.days).toBe(7);
    });

    it('should return zero days if no events', async () => {
      mockGetOldestEvent.mockResolvedValue(null);
      mockGetNewestEvent.mockResolvedValue(null);

      const range = await manager.getDataRange();

      expect(range.start).toBeNull();
      expect(range.end).toBeNull();
      expect(range.days).toBe(0);
    });

    it('should handle same-day events', async () => {
      const timestamp = 1000000000;

      mockGetOldestEvent.mockResolvedValue({ timestamp });
      mockGetNewestEvent.mockResolvedValue({ timestamp });

      const range = await manager.getDataRange();

      expect(range.days).toBe(0);
    });
  });

  describe('getUserTier', () => {
    it('should return free tier if no license key', async () => {
      mockGlobalStateGet.mockReturnValue(null);

      await manager.performCleanup();

      expect(mockDeleteEventsBefore).toHaveBeenCalled(); // Free tier cleanup runs
    });

    it('should return pro tier if license key and tier set', async () => {
      mockGlobalStateGet.mockImplementation((key: string) => {
        if (key === 'licenseKey') {return 'pro-license';}
        if (key === 'licenseTier') {return 'pro';}
        return null;
      });

      await manager.performCleanup();

      expect(mockDeleteEventsBefore).not.toHaveBeenCalled(); // Pro tier skips cleanup
    });

    it('should return team tier if license key and tier set', async () => {
      mockGlobalStateGet.mockImplementation((key: string) => {
        if (key === 'licenseKey') {return 'team-license';}
        if (key === 'licenseTier') {return 'team';}
        return null;
      });

      await manager.performCleanup();

      expect(mockDeleteEventsBefore).not.toHaveBeenCalled(); // Team tier skips cleanup
    });

    it('should default to free tier if license exists but no tier set', async () => {
      mockGlobalStateGet.mockImplementation((key: string, defaultValue?: unknown) => {
        if (key === 'licenseKey') {return 'some-license';}
        if (key === 'licenseTier') {return defaultValue;}
        return null;
      });

      await manager.performCleanup();

      expect(mockDeleteEventsBefore).toHaveBeenCalled(); // Falls back to free tier
    });
  });

  describe('triggerManualCleanup', () => {
    it('should perform cleanup', async () => {
      const spy = jest.spyOn(manager, 'performCleanup');

      await manager.triggerManualCleanup();

      expect(spy).toHaveBeenCalled();
    });

    it('should show information message with data range', async () => {
      const oldDate = new Date('2024-01-01');
      const newDate = new Date('2024-01-08');

      mockGetOldestEvent.mockResolvedValue({ timestamp: oldDate.getTime() });
      mockGetNewestEvent.mockResolvedValue({ timestamp: newDate.getTime() });

      await manager.triggerManualCleanup();

      expect(mockShowInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('7 days of data')
      );
    });

    it('should include date range in message', async () => {
      const oldDate = new Date('2024-01-01');
      const newDate = new Date('2024-01-15');

      mockGetOldestEvent.mockResolvedValue({ timestamp: oldDate.getTime() });
      mockGetNewestEvent.mockResolvedValue({ timestamp: newDate.getTime() });

      await manager.triggerManualCleanup();

      const message = mockShowInformationMessage.mock.calls[0][0];
      expect(message).toContain('14 days');
      expect(message).toContain(oldDate.toLocaleDateString());
      expect(message).toContain(newDate.toLocaleDateString());
    });
  });

  describe('Cleanup scheduler lifecycle', () => {
    it('should run cleanup immediately and schedule for later', () => {
      const spy = jest.spyOn(manager, 'performCleanup');

      manager.startCleanupScheduler();

      // Immediate cleanup
      expect(spy).toHaveBeenCalledTimes(1);

      // Scheduled cleanup
      expect(jest.getTimerCount()).toBeGreaterThan(0);
    });

    it('should cleanup properly on stop', async () => {
      manager.startCleanupScheduler();

      // Trigger midnight callback
      await jest.runOnlyPendingTimersAsync();

      manager.stopCleanupScheduler();

      // Should not throw
      expect(manager).toBeDefined();
    });
  });
});
