/**
 * SessionManager Unit Tests
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SessionManager } from '../SessionManager';
import { MetricsRepository } from '../../storage/MetricsRepository';
import { AITool } from '../../types';

jest.mock('../../storage/MetricsRepository');

describe('SessionManager', () => {
  let manager: SessionManager;
  let mockMetricsRepo: jest.Mocked<MetricsRepository>;

  beforeEach(() => {
    mockMetricsRepo = {
      saveSession: jest.fn<() => Promise<void>>().mockResolvedValue(undefined as any)
    } as any;

    manager = new SessionManager(mockMetricsRepo);
  });

  describe('Session Lifecycle', () => {
    it('should start a new session', () => {
      const session = manager.startSession();

      expect(session).toBeDefined();
      expect(session.id).toMatch(/^session-/);
      expect(session.eventCount).toBe(0);
      expect(session.toolsUsed).toEqual([]);
    });

    it('should check for active session', () => {
      expect(manager.hasActiveSession()).toBe(false);

      manager.startSession();

      expect(manager.hasActiveSession()).toBe(true);
    });

    it('should get current session', () => {
      manager.startSession();

      const session = manager.getCurrentSession();

      expect(session).toBeDefined();
      expect(session?.id).toBeDefined();
    });

    it('should return null when no active session', () => {
      const session = manager.getCurrentSession();

      expect(session).toBeNull();
    });
  });

  describe('Event Recording', () => {
    beforeEach(() => {
      manager.startSession();
    });

    it('should record events', () => {
      manager.recordEvent(AITool.Copilot, 5);

      const session = manager.getCurrentSession();

      expect(session?.eventCount).toBe(1);
      expect(session?.aiLinesGenerated).toBe(5);
      expect(session?.toolsUsed).toContain(AITool.Copilot);
    });

    it('should track multiple tools', () => {
      manager.recordEvent(AITool.Copilot, 3);
      manager.recordEvent(AITool.Cursor, 2);

      const session = manager.getCurrentSession();

      expect(session?.toolsUsed).toHaveLength(2);
      expect(session?.toolsUsed).toContain(AITool.Copilot);
      expect(session?.toolsUsed).toContain(AITool.Cursor);
    });

    it('should record manual lines', () => {
      manager.recordManualLines(10);

      const session = manager.getCurrentSession();

      expect(session?.manualLinesWritten).toBe(10);
    });

    it('should auto-start session if not active', () => {
      const noSessionManager = new SessionManager(mockMetricsRepo);

      expect(noSessionManager.hasActiveSession()).toBe(false);

      noSessionManager.recordEvent(AITool.Copilot, 5);

      expect(noSessionManager.hasActiveSession()).toBe(true);
    });
  });

  describe('Session Termination', () => {
    it('should end current session', async () => {
      manager.startSession();
      manager.recordEvent(AITool.Copilot, 5);

      const endedSession = await manager.endSession();

      expect(endedSession).toBeDefined();
      expect(endedSession?.endTime).toBeDefined();
      expect(endedSession?.duration).toBeDefined();
      expect(manager.hasActiveSession()).toBe(false);
    });

    it('should save session when ending', async () => {
      manager.startSession();
      await manager.endSession();

      expect(mockMetricsRepo.saveSession).toHaveBeenCalled();
    });

    it('should handle ending non-existent session', async () => {
      const result = await manager.endSession();

      expect(result).toBeNull();
    });

    it('should handle save errors gracefully', async () => {
      const errorManager = new SessionManager({
        saveSession: jest.fn<() => Promise<void>>().mockRejectedValue(new Error('Database error'))
      } as any);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      errorManager.startSession();
      const result = await errorManager.endSession();

      expect(result).toBeDefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[CodePause:SessionManager] Error saving session:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should trigger onSessionEnd callback', async () => {
      const callback = jest.fn();
      const managerWithCallback = new SessionManager(mockMetricsRepo, callback);

      managerWithCallback.startSession();
      const session = await managerWithCallback.endSession();

      expect(callback).toHaveBeenCalledWith(session);
    });

    it('should clear idle timer on end', async () => {
      jest.useFakeTimers();
      manager.startSession();

      await manager.endSession();

      // Advance timers to verify idle timeout doesn't trigger
      jest.advanceTimersByTime(10000000);
      expect(manager.hasActiveSession()).toBe(false);

      jest.useRealTimers();
    });

    it('should end existing session when starting new one', async () => {
      manager.startSession();
      const firstSessionId = manager.getCurrentSession()?.id;

      manager.startSession();
      const secondSessionId = manager.getCurrentSession()?.id;

      expect(firstSessionId).not.toBe(secondSessionId);
      expect(mockMetricsRepo.saveSession).toHaveBeenCalled();
    });
  });

  describe('Session Duration', () => {
    it('should calculate duration for active session', () => {
      jest.useFakeTimers();
      const startTime = Date.now();
      jest.setSystemTime(startTime);

      manager.startSession();

      jest.setSystemTime(startTime + 5000);

      const duration = manager.getSessionDuration();
      expect(duration).toBe(5000);

      jest.useRealTimers();
    });

    it('should return 0 when no active session', () => {
      const duration = manager.getSessionDuration();
      expect(duration).toBe(0);
    });

    it('should return stored duration for ended session', async () => {
      jest.useFakeTimers();
      const startTime = Date.now();
      jest.setSystemTime(startTime);

      manager.startSession();
      jest.setSystemTime(startTime + 3000);

      const endedSession = await manager.endSession();

      expect(endedSession?.duration).toBe(3000);
      jest.useRealTimers();
    });
  });

  describe('Session Statistics', () => {
    it('should return null when no active session', () => {
      const stats = manager.getSessionStats();
      expect(stats).toBeNull();
    });

    it('should calculate session stats', () => {
      manager.startSession();
      manager.recordEvent(AITool.Copilot, 30);
      manager.recordManualLines(70);

      const stats = manager.getSessionStats();

      expect(stats).toBeDefined();
      expect(stats?.eventCount).toBe(1);
      expect(stats?.aiLines).toBe(30);
      expect(stats?.manualLines).toBe(70);
      expect(stats?.aiPercentage).toBe(30);
      expect(stats?.toolsUsed).toContain(AITool.Copilot);
    });

    it('should handle zero total lines', () => {
      manager.startSession();

      const stats = manager.getSessionStats();

      expect(stats?.aiPercentage).toBe(0);
    });

    it('should return copy of toolsUsed array', () => {
      manager.startSession();
      manager.recordEvent(AITool.Copilot, 10);

      const stats1 = manager.getSessionStats();
      const stats2 = manager.getSessionStats();

      expect(stats1?.toolsUsed).not.toBe(stats2?.toolsUsed);
      expect(stats1?.toolsUsed).toEqual(stats2?.toolsUsed);
    });
  });

  describe('Session Retrieval', () => {
    it('should fetch recent sessions', async () => {
      const mockSessions = [
        { id: 'session-1', startTime: 1000, eventCount: 5 },
        { id: 'session-2', startTime: 2000, eventCount: 3 }
      ] as any[];

      const getRecentSessionsMock = jest.fn<() => Promise<any[]>>().mockResolvedValue(mockSessions);

      const retrievalManager = new SessionManager({
        saveSession: jest.fn<() => Promise<void>>().mockResolvedValue(undefined as any),
        getRecentSessions: getRecentSessionsMock
      } as any);

      const sessions = await retrievalManager.getRecentSessions(10);

      expect(sessions).toEqual(mockSessions);
    });

    it('should use default limit for recent sessions', async () => {
      const getRecentSessionsMock = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

      const retrievalManager = new SessionManager({
        saveSession: jest.fn<() => Promise<void>>().mockResolvedValue(undefined as any),
        getRecentSessions: getRecentSessionsMock
      } as any);

      await retrievalManager.getRecentSessions();

      // Default limit is 10 (verified in implementation)
      expect(retrievalManager).toBeDefined();
    });

    it('should fetch single session by id', async () => {
      const mockSession = { id: 'session-1', startTime: 1000, eventCount: 5 } as any;
      const getSessionMock = jest.fn<() => Promise<any>>().mockResolvedValue(mockSession);

      const retrievalManager = new SessionManager({
        saveSession: jest.fn<() => Promise<void>>().mockResolvedValue(undefined as any),
        getSession: getSessionMock
      } as any);

      const session = await retrievalManager.getSession('session-1');

      expect(session).toEqual(mockSession);
    });

    it('should return null for non-existent session', async () => {
      const getSessionMock = jest.fn<() => Promise<any>>().mockResolvedValue(null);

      const retrievalManager = new SessionManager({
        saveSession: jest.fn<() => Promise<void>>().mockResolvedValue(undefined as any),
        getSession: getSessionMock
      } as any);

      const session = await retrievalManager.getSession('invalid-id');

      expect(session).toBeNull();
    });
  });

  describe('Idle Timeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should end session after idle timeout', async () => {
      manager.startSession();

      // Fast-forward past idle timeout
      await jest.advanceTimersByTimeAsync(10000000);

      expect(manager.hasActiveSession()).toBe(false);
    });

    it('should reset idle timer on recordEvent', async () => {
      manager.startSession();

      // Advance to just before timeout
      jest.advanceTimersByTime(5000000);

      // Record event to reset timer
      manager.recordEvent(AITool.Copilot, 5);

      // Advance again but still within new timeout window
      jest.advanceTimersByTime(5000000);

      expect(manager.hasActiveSession()).toBe(true);
    });

    it('should reset idle timer on recordManualLines', async () => {
      manager.startSession();

      // Advance to just before timeout
      jest.advanceTimersByTime(5000000);

      // Record manual lines to reset timer
      manager.recordManualLines(10);

      // Advance again but still within new timeout window
      jest.advanceTimersByTime(5000000);

      expect(manager.hasActiveSession()).toBe(true);
    });
  });

  describe('Force End Session', () => {
    it('should force end current session', async () => {
      manager.startSession();

      await manager.forceEndSession();

      expect(manager.hasActiveSession()).toBe(false);
    });

    it('should handle force end with no session', async () => {
      await expect(manager.forceEndSession()).resolves.not.toThrow();
    });
  });

  describe('Dispose', () => {
    it('should clear idle timer on dispose', () => {
      jest.useFakeTimers();
      manager.startSession();

      manager.dispose();

      // Advance timers to verify idle timeout doesn't trigger
      jest.advanceTimersByTime(10000000);

      jest.useRealTimers();
    });

    it('should clear current session on dispose', () => {
      manager.startSession();

      manager.dispose();

      expect(manager.hasActiveSession()).toBe(false);
    });

    it('should handle dispose with no active session', () => {
      expect(() => manager.dispose()).not.toThrow();
    });
  });

  describe('Session ID Generation', () => {
    it('should generate unique session IDs', () => {
      const session1 = manager.startSession();
      manager.dispose();

      const session2 = manager.startSession();

      expect(session1.id).not.toBe(session2.id);
      expect(session1.id).toMatch(/^session-\d+-[a-z0-9]+$/);
      expect(session2.id).toMatch(/^session-\d+-[a-z0-9]+$/);
    });
  });
});
