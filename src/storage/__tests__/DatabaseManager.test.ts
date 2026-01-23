/**
 * DatabaseManager Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseManager } from '../DatabaseManager';
import { TrackingEvent, DailyMetrics, ToolMetrics, CodingSession, SnoozeState, AITool, EventType } from '../../types';

describe('DatabaseManager', () => {
  let dbManager: DatabaseManager;
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for test database
    tempDir = path.join(__dirname, '..', '..', '..', 'test-data', `test-${Date.now()}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Using node-sqlite3-wasm - works across all Node.js and Electron versions
    dbManager = new DatabaseManager(tempDir);
    await dbManager.initialize();
  });

  afterEach(() => {
    // Clean up
    dbManager.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Initialization', () => {
    it('should initialize database successfully', async () => {
      const stats = await dbManager.getStats();
      expect(stats).toBeDefined();
      expect(stats.totalEvents).toBe(0);
      expect(stats.totalSessions).toBe(0);
    });

    it('should create all required tables', async () => {
      // Verify tables exist by querying them without errors
      const snoozeState = await dbManager.getSnoozeState();
      expect(snoozeState).toBeDefined();
      expect(snoozeState.snoozed).toBe(false);
    });

    it('should initialize with default snooze state', async () => {
      const snoozeState = await dbManager.getSnoozeState();
      expect(snoozeState.snoozed).toBe(false);
      expect(snoozeState.snoozeUntil).toBeUndefined();
    });
  });

  describe('Event Operations', () => {
    it('should insert a tracking event', async () => {
      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionDisplayed,
        linesOfCode: 5,
        charactersCount: 120,
        filePath: '/test/file.ts',
        language: 'typescript',
        sessionId: 'session-1'
      };

      const eventId = await dbManager.insertEvent(event);
      expect(eventId).toBeGreaterThan(0);

      const stats = await dbManager.getStats();
      expect(stats.totalEvents).toBe(1);
    });

    it('should retrieve events within date range', async () => {
      const today = new Date().toISOString().split('T')[0];
      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        linesOfCode: 3
      };

      await dbManager.insertEvent(event);

      const events = await dbManager.getEvents(today, today);
      expect(events).toHaveLength(1);
      expect(events[0].tool).toBe('copilot');
      expect(events[0].eventType).toBe('suggestion-accepted');
    });

    it('should retrieve recent events', async () => {
      // Insert multiple events
      for (let i = 0; i < 5; i++) {
        await dbManager.insertEvent({
          timestamp: Date.now() + i,
          tool: AITool.Cursor,
          eventType: EventType.SuggestionDisplayed
        });
      }

      const recentEvents = await dbManager.getRecentEvents(3);
      expect(recentEvents).toHaveLength(3);
      // Should be in descending order (most recent first)
      expect(recentEvents[0].timestamp).toBeGreaterThanOrEqual(recentEvents[1].timestamp);
    });

    it('should retrieve events for a specific session', async () => {
      const sessionId = 'test-session-123';

      await dbManager.insertEvent({
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        sessionId
      });

      await dbManager.insertEvent({
        timestamp: Date.now() + 1000,
        tool: AITool.Copilot,
        eventType: EventType.SuggestionRejected,
        sessionId
      });

      await dbManager.insertEvent({
        timestamp: Date.now() + 2000,
        tool: AITool.Cursor,
        eventType: EventType.SuggestionAccepted,
        sessionId: 'different-session'
      });

      const sessionEvents = await dbManager.getSessionEvents(sessionId);
      expect(sessionEvents).toHaveLength(2);
      expect(sessionEvents.every(e => e.sessionId === sessionId)).toBe(true);
    });

    it('should handle events with metadata', async () => {
      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.ClaudeCode,
        eventType: EventType.SuggestionAccepted,
        metadata: {
          complexity: 'high',
          reviewTime: 5000,
          customField: 'test-value'
        }
      };

      await dbManager.insertEvent(event);
      const recentEvents = await dbManager.getRecentEvents(1);

      expect(recentEvents[0].metadata).toEqual(event.metadata);
    });
  });

  describe('Daily Metrics Operations', () => {
    it('should insert daily metrics', async () => {
      const today = new Date().toISOString().split('T')[0];
      const metrics: DailyMetrics = {
        date: today,
        totalEvents: 50,
        totalAISuggestions: 40,
        totalAILines: 300,
        totalManualLines: 200,
        aiPercentage: 60,
        averageReviewTime: 3.5,
        sessionCount: 3,
        toolBreakdown: {
          copilot: {
            tool: AITool.Copilot,
            suggestionCount: 30,
            acceptedCount: 25,
            rejectedCount: 5,
            linesGenerated: 150,
            averageReviewTime: 3.2,
          },
          cursor: {
            tool: AITool.Cursor,
            suggestionCount: 20,
            acceptedCount: 15,
            rejectedCount: 5,
            linesGenerated: 150,
            averageReviewTime: 3.8,
          },
          'claude-code': {
            tool: AITool.ClaudeCode,
            suggestionCount: 0,
            acceptedCount: 0,
            rejectedCount: 0,
            linesGenerated: 0,
            averageReviewTime: 0,
          }
        }
      };

      await dbManager.insertOrUpdateDailyMetrics(metrics);

      const retrieved = await dbManager.getDailyMetrics(today);
      expect(retrieved).toBeDefined();
      expect(retrieved?.totalEvents).toBe(50);
      expect(retrieved?.aiPercentage).toBe(60);
      expect(retrieved?.toolBreakdown.copilot.acceptedCount).toBe(25);
    });

    it('should update existing daily metrics', async () => {
      const today = new Date().toISOString().split('T')[0];
      const metrics: DailyMetrics = {
        date: today,
        totalEvents: 50,
        totalAISuggestions: 40,
        totalAILines: 300,
        totalManualLines: 200,
        aiPercentage: 60,
        averageReviewTime: 3.5,
        sessionCount: 3,
        toolBreakdown: {} as Record<AITool, ToolMetrics>
      };

      await dbManager.insertOrUpdateDailyMetrics(metrics);

      // Update with new values
      metrics.totalEvents = 75;
      metrics.aiPercentage = 65;
      await dbManager.insertOrUpdateDailyMetrics(metrics);

      const retrieved = await dbManager.getDailyMetrics(today);
      expect(retrieved?.totalEvents).toBe(75);
      expect(retrieved?.aiPercentage).toBe(65);
    });

    it('should retrieve daily metrics range', async () => {
      const dates = ['2025-01-01', '2025-01-02', '2025-01-03'];

      for (const date of dates) {
        await dbManager.insertOrUpdateDailyMetrics({
          date,
          totalEvents: 10,
          totalAISuggestions: 8,
          totalAILines: 50,
          totalManualLines: 50,
          aiPercentage: 50,
          averageReviewTime: 3.0,
          sessionCount: 1,
          toolBreakdown: {} as Record<AITool, ToolMetrics>
        });
      }

      const range = await dbManager.getDailyMetricsRange('2025-01-01', '2025-01-03');
      expect(range).toHaveLength(3);
      expect(range.map(m => m.date).sort()).toEqual(dates);
    });

    it('should return null for non-existent date', async () => {
      const metrics = await dbManager.getDailyMetrics('2020-01-01');
      expect(metrics).toBeNull();
    });
  });

  describe('Tool Metrics Operations', () => {
    it('should insert and retrieve tool metrics', async () => {
      const date = '2025-01-15';
      const toolMetrics: ToolMetrics = {
        tool: AITool.Copilot,
        suggestionCount: 100,
        acceptedCount: 80,
        rejectedCount: 20,
        linesGenerated: 400,
        averageReviewTime: 2.5,
      };

      await dbManager.insertOrUpdateToolMetrics(date, toolMetrics);

      const retrieved = await dbManager.getToolMetrics(date);
      expect(retrieved.copilot).toBeDefined();
      expect(retrieved.copilot.suggestionCount).toBe(100);
      expect(retrieved.copilot.acceptedCount).toBe(80);
    });
  });

  describe('Session Operations', () => {
    it('should insert and retrieve a coding session', async () => {
      const session: CodingSession = {
        id: 'session-abc-123',
        startTime: Date.now(),
        endTime: Date.now() + 3600000,
        duration: 3600000,
        eventCount: 25,
        aiLinesGenerated: 150,
        manualLinesWritten: 100,
        toolsUsed: [AITool.Copilot, AITool.Cursor]
      };

      await dbManager.insertOrUpdateSession(session);

      const retrieved = await dbManager.getSession(session.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(session.id);
      expect(retrieved?.eventCount).toBe(25);
      expect(retrieved?.toolsUsed).toEqual([AITool.Copilot, AITool.Cursor]);
    });

    it('should update existing session', async () => {
      const session: CodingSession = {
        id: 'session-update-test',
        startTime: Date.now(),
        eventCount: 10,
        aiLinesGenerated: 50,
        manualLinesWritten: 30,
        toolsUsed: [AITool.Copilot]
      };

      await dbManager.insertOrUpdateSession(session);

      // Update
      session.eventCount = 20;
      session.endTime = Date.now() + 1800000;
      session.duration = 1800000;

      await dbManager.insertOrUpdateSession(session);

      const retrieved = await dbManager.getSession(session.id);
      expect(retrieved?.eventCount).toBe(20);
      expect(retrieved?.endTime).toBe(session.endTime);
    });

    it('should retrieve recent sessions', async () => {
      for (let i = 0; i < 5; i++) {
        await dbManager.insertOrUpdateSession({
          id: `session-${i}`,
          startTime: Date.now() + i * 1000,
          eventCount: i,
          aiLinesGenerated: i * 10,
          manualLinesWritten: i * 5,
          toolsUsed: [AITool.Copilot]
        });
      }

      const recentSessions = await dbManager.getRecentSessions(3);
      expect(recentSessions).toHaveLength(3);
    });

    it('should return null for non-existent session', async () => {
      const session = await dbManager.getSession('non-existent-id');
      expect(session).toBeNull();
    });
  });

  describe('Achievement Operations', () => {
    it('should update and retrieve achievement', async () => {
      await dbManager.updateAchievement('first-steps', true, 1.0);

      const achievements = await dbManager.getAllAchievements();
      const firstSteps = achievements.find(a => a.id === 'first-steps');

      expect(firstSteps).toBeDefined();
      expect(firstSteps?.unlocked).toBe(true);
      expect(firstSteps?.progress).toBe(1.0);
      expect(firstSteps?.unlockedAt).toBeDefined();
    });

    it('should track achievement progress', async () => {
      await dbManager.updateAchievement('balanced-coder', false, 0.5);

      const achievements = await dbManager.getAllAchievements();
      const balanced = achievements.find(a => a.id === 'balanced-coder');

      expect(balanced?.unlocked).toBe(false);
      expect(balanced?.progress).toBe(0.5);
      expect(balanced?.unlockedAt).toBeUndefined();
    });

    it('should return empty array when no achievements exist', async () => {
      const achievements = await dbManager.getAllAchievements();
      expect(achievements).toEqual([]);
    });
  });

  describe('Config Operations', () => {
    it('should set and get string config value', async () => {
      await dbManager.setConfig('test-key', 'test-value');
      const value = await dbManager.getConfig('test-key');
      expect(value).toBe('test-value');
    });

    it('should set and get object config value', async () => {
      const configObj = { setting1: true, setting2: 42, setting3: 'value' };
      await dbManager.setConfig('complex-config', configObj);

      const retrieved = await dbManager.getConfig('complex-config');
      expect(retrieved).toEqual(configObj);
    });

    it('should set and get number config value', async () => {
      await dbManager.setConfig('numeric-value', 12345);
      const value = await dbManager.getConfig('numeric-value');
      expect(value).toBe(12345);
    });

    it('should return null for non-existent config key', async () => {
      const value = await dbManager.getConfig('non-existent-key');
      expect(value).toBeNull();
    });

    it('should update existing config value', async () => {
      await dbManager.setConfig('update-test', 'original');
      await dbManager.setConfig('update-test', 'updated');

      const value = await dbManager.getConfig('update-test');
      expect(value).toBe('updated');
    });
  });

  describe('Snooze Operations', () => {
    it('should set and get snooze state', async () => {
      const snoozeState: SnoozeState = {
        snoozed: true,
        snoozeUntil: Date.now() + 3600000,
        snoozeReason: 'Working on critical bug'
      };

      await dbManager.setSnoozeState(snoozeState);

      const retrieved = await dbManager.getSnoozeState();
      expect(retrieved.snoozed).toBe(true);
      expect(retrieved.snoozeUntil).toBe(snoozeState.snoozeUntil);
      expect(retrieved.snoozeReason).toBe(snoozeState.snoozeReason);
    });

    it('should clear snooze state', async () => {
      await dbManager.setSnoozeState({
        snoozed: true,
        snoozeUntil: Date.now() + 1000
      });

      await dbManager.setSnoozeState({ snoozed: false });

      const retrieved = await dbManager.getSnoozeState();
      expect(retrieved.snoozed).toBe(false);
    });
  });

  describe('Alert History Operations', () => {
    it('should record alert history', async () => {
      const timestamp = Date.now();
      await dbManager.updateAlertHistory('blind-approval', timestamp);

      const history = await dbManager.getAlertHistory('blind-approval');
      expect(history).toBeDefined();
      expect(history?.alertType).toBe('blind-approval');
      expect(history?.lastShown).toBe(timestamp);
      expect(history?.count).toBe(1);
    });

    it('should increment alert count on multiple updates', async () => {
      await dbManager.updateAlertHistory('educational', Date.now());
      await dbManager.updateAlertHistory('educational', Date.now() + 1000);
      await dbManager.updateAlertHistory('educational', Date.now() + 2000);

      const history = await dbManager.getAlertHistory('educational');
      expect(history?.count).toBe(3);
    });

    it('should return null for non-existent alert type', async () => {
      const history = await dbManager.getAlertHistory('non-existent-alert');
      expect(history).toBeNull();
    });
  });

  describe('Database Statistics', () => {
    it('should return accurate statistics', async () => {
      // Insert some data
      await dbManager.insertEvent({
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted
      });

      await dbManager.insertOrUpdateSession({
        id: 'stats-test-session',
        startTime: Date.now(),
        eventCount: 1,
        aiLinesGenerated: 10,
        manualLinesWritten: 5,
        toolsUsed: [AITool.Copilot]
      });

      // Manually sync to disk before checking file size
      dbManager.sync();

      const stats = await dbManager.getStats();
      expect(stats.totalEvents).toBe(1);
      expect(stats.totalSessions).toBe(1);
      expect(stats.databaseSize).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when operating on uninitialized database', async () => {
      const uninitializedDb = new DatabaseManager(tempDir + '-uninitialized');

      await expect(uninitializedDb.insertEvent({
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted
      })).rejects.toThrow('Database not initialized');
    });

    it('should handle database close gracefully', () => {
      dbManager.close();
      dbManager.close(); // Should not throw on second close
    });
  });

  describe('Workspace Isolation', () => {
    it('should create workspace-specific database', async () => {
      const workspacePath = path.join(tempDir, 'test-workspace');
      fs.mkdirSync(workspacePath, { recursive: true });

      const workspaceDb = new DatabaseManager(tempDir, workspacePath);
      await workspaceDb.initialize();

      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        linesOfCode: 5
      };

      await workspaceDb.insertEvent(event);
      const stats = await workspaceDb.getStats();

      expect(stats.totalEvents).toBe(1);

      workspaceDb.close();
      fs.rmSync(workspacePath, { recursive: true, force: true });
    });

    it('should isolate events between workspaces', async () => {
      const workspace1 = path.join(tempDir, 'workspace1');
      const workspace2 = path.join(tempDir, 'workspace2');

      fs.mkdirSync(workspace1, { recursive: true });
      fs.mkdirSync(workspace2, { recursive: true });

      const db1 = new DatabaseManager(tempDir, workspace1);
      const db2 = new DatabaseManager(tempDir, workspace2);

      await db1.initialize();
      await db2.initialize();

      // Add event to workspace1
      await db1.insertEvent({
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        linesOfCode: 10
      });

      // Add event to workspace2
      await db2.insertEvent({
        timestamp: Date.now(),
        tool: AITool.Cursor,
        eventType: EventType.SuggestionDisplayed,
        linesOfCode: 20
      });

      const stats1 = await db1.getStats();
      const stats2 = await db2.getStats();

      expect(stats1.totalEvents).toBe(1);
      expect(stats2.totalEvents).toBe(1);

      db1.close();
      db2.close();

      fs.rmSync(workspace1, { recursive: true, force: true });
      fs.rmSync(workspace2, { recursive: true, force: true });
    });

    it('should use global database when no workspace specified', async () => {
      const globalDb = new DatabaseManager(tempDir);
      await globalDb.initialize();

      await globalDb.insertEvent({
        timestamp: Date.now(),
        tool: AITool.ClaudeCode,
        eventType: EventType.CodeGenerated,
        linesOfCode: 50
      });

      const stats = await globalDb.getStats();
      expect(stats.totalEvents).toBeGreaterThan(0);

      globalDb.close();
    });
  });

  describe('Security Validation', () => {
    it('should reject workspace path with null byte', () => {
      expect(() => {
        new DatabaseManager(tempDir, '/path/with\0null');
      }).toThrow('Invalid workspace path: contains null byte');
    });

    it('should reject workspace path that is too long', () => {
      const longPath = '/very/long/path/' + 'a'.repeat(500);

      expect(() => {
        new DatabaseManager(tempDir, longPath);
      }).toThrow('Workspace path too long');
    });

    it('should normalize relative workspace paths', async () => {
      const relativePath = './relative/path';
      const db = new DatabaseManager(tempDir, relativePath);

      await db.initialize();
      expect(db).toBeDefined();

      db.close();
    });
  });

  describe('Auto-Save Functionality', () => {
    it('should trigger auto-save after operations', async () => {
      // Insert multiple events to trigger auto-save
      for (let i = 0; i < 12; i++) {
        await dbManager.insertEvent({
          timestamp: Date.now() + i,
          tool: AITool.Copilot,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 5
        });
      }

      const stats = await dbManager.getStats();
      expect(stats.totalEvents).toBe(12);
    });

    it('should sync database manually', () => {
      dbManager.sync();

      // Manual sync should not throw
      expect(dbManager).toBeDefined();
    });
  });

  describe('Recent Agent Sessions', () => {
    it('should return empty array when no sessions exist', async () => {
      const sessions = await dbManager.getRecentAgentSessions(10);
      expect(sessions).toBeInstanceOf(Array);
    });

    it('should retrieve recent agent sessions with limit', async () => {
      const sessions = await dbManager.getRecentAgentSessions(5);
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBeLessThanOrEqual(5);
    });
  });

  describe('File Review Queries', () => {
    it('should retrieve unreviewed files for date', async () => {
      const today = new Date().toISOString().split('T')[0];
      const unreviewed = await dbManager.getUnreviewedFiles(today);

      expect(Array.isArray(unreviewed)).toBe(true);
    });

    it('should retrieve terminal reviewed files for date', async () => {
      const today = new Date().toISOString().split('T')[0];
      const terminalReviewed = await dbManager.getTerminalReviewedFiles(today);

      expect(Array.isArray(terminalReviewed)).toBe(true);
    });

    it('should retrieve all file reviews for date', async () => {
      const today = new Date().toISOString().split('T')[0];
      const reviews = await dbManager.getFileReviewsForDate(today);

      expect(Array.isArray(reviews)).toBe(true);
    });
  });

  describe('Database Statistics', () => {
    it('should calculate database size', async () => {
      // Add some data
      for (let i = 0; i < 5; i++) {
        await dbManager.insertEvent({
          timestamp: Date.now() + i,
          tool: AITool.Copilot,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 10
        });
      }

      const stats = await dbManager.getStats();
      expect(stats.databaseSize).toBeGreaterThanOrEqual(0);
      expect(stats.totalEvents).toBe(5);
    });

    it('should track operation count', async () => {
      const initialStats = await dbManager.getStats();

      await dbManager.insertEvent({
        timestamp: Date.now(),
        tool: AITool.Cursor,
        eventType: EventType.CodeGenerated,
        linesOfCode: 20
      });

      const newStats = await dbManager.getStats();
      expect(newStats.totalEvents).toBe(initialStats.totalEvents + 1);
    });
  });

  describe('Date Range Queries', () => {
    it('should handle same start and end date', async () => {
      const today = new Date().toISOString().split('T')[0];

      await dbManager.insertEvent({
        timestamp: Date.now(),
        tool: AITool.ClaudeCode,
        eventType: EventType.SuggestionAccepted,
        linesOfCode: 15
      });

      const events = await dbManager.getEvents(today, today);
      expect(events.length).toBeGreaterThan(0);
    });

    it('should return empty array for future dates', async () => {
      const futureDate = new Date(Date.now() + 86400000 * 30).toISOString().split('T')[0];

      const events = await dbManager.getEvents(futureDate, futureDate);
      expect(events).toHaveLength(0);
    });
  });

  describe('Workspace Information', () => {
    it('should return workspace path', () => {
      const workspacePath = dbManager.getWorkspacePath();
      expect(workspacePath).toBeDefined();
    });

    it('should return workspace hash', () => {
      const hash = dbManager.getWorkspaceHash();
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });
  });

  describe('Alert History Operations', () => {
    it('should return null for non-existent alert', async () => {
      const history = await dbManager.getAlertHistory('non-existent-alert');
      expect(history).toBeNull();
    });
  });

  describe('Config Edge Cases', () => {
    it('should return null for non-existent config keys', async () => {
      const value = await dbManager.getConfig('non-existent-key');
      expect(value).toBeNull();
    });

    it('should overwrite existing config', async () => {
      await dbManager.setConfig('testKey', { value: 'first' });
      await dbManager.setConfig('testKey', { value: 'second' });

      const retrieved: any = await dbManager.getConfig('testKey');
      expect(retrieved.value).toBe('second');
    });

    it('should handle null values in config', async () => {
      await dbManager.setConfig('nullKey', null);
      const retrieved = await dbManager.getConfig('nullKey');
      // Null is serialized to JSON string "null"
      expect(retrieved).toBeDefined();
    });

    it('should handle array values in config', async () => {
      const array = [1, 2, 3];
      await dbManager.setConfig('arrayKey', array);
      const retrieved = await dbManager.getConfig('arrayKey');
      expect(retrieved).toEqual(array);
    });

    it('should handle nested object values', async () => {
      const nested = { a: { b: { c: 'deep' } } };
      await dbManager.setConfig('nestedKey', nested);
      const retrieved = await dbManager.getConfig('nestedKey');
      expect(retrieved).toEqual(nested);
    });
  });

  describe('Snooze State Edge Cases', () => {
    it('should handle snooze with reason', async () => {
      const state: SnoozeState = {
        snoozed: true,
        snoozeUntil: Date.now() + 3600000,
        snoozeReason: 'Testing'
      };

      await dbManager.setSnoozeState(state);
      const retrieved = await dbManager.getSnoozeState();

      expect(retrieved.snoozed).toBe(true);
      expect(retrieved.snoozeReason).toBe('Testing');
    });

    it('should handle unsnooze', async () => {
      await dbManager.setSnoozeState({
        snoozed: true,
        snoozeUntil: Date.now() + 3600000
      });

      await dbManager.setSnoozeState({
        snoozed: false
      });

      const retrieved = await dbManager.getSnoozeState();
      expect(retrieved.snoozed).toBe(false);
    });

    it('should persist snooze across operations', async () => {
      await dbManager.setSnoozeState({
        snoozed: true,
        snoozeUntil: Date.now() + 7200000
      });

      // Do other operations
      await dbManager.insertEvent({
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.CodeGenerated,
        linesOfCode: 10
      });

      const retrieved = await dbManager.getSnoozeState();
      expect(retrieved.snoozed).toBe(true);
    });
  });

  describe('Event Metadata', () => {
    it('should handle events with metadata', async () => {
      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.Cursor,
        eventType: EventType.CodeGenerated,
        linesOfCode: 20,
        metadata: {
          source: 'test',
          custom: 'value'
        }
      };

      const id = await dbManager.insertEvent(event);
      expect(id).toBeGreaterThan(0);
    });

    it('should handle events without optional fields', async () => {
      const minimalEvent: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.ClaudeCode,
        eventType: EventType.SessionStart
      };

      const id = await dbManager.insertEvent(minimalEvent);
      expect(id).toBeGreaterThan(0);
    });

    it('should handle review quality fields', async () => {
      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        linesOfCode: 5,
        reviewQuality: 'thorough' as any,
        reviewQualityScore: 95,
        isReviewed: true
      };

      const id = await dbManager.insertEvent(event);
      expect(id).toBeGreaterThan(0);
    });

    it('should handle agent mode flags', async () => {
      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.ClaudeCode,
        eventType: EventType.CodeGenerated,
        linesOfCode: 50,
        isAgentMode: true,
        agentSessionId: 'agent-session-123',
        fileWasOpen: false
      };

      const id = await dbManager.insertEvent(event);
      expect(id).toBeGreaterThan(0);

      const today = new Date().toISOString().split('T')[0];
      const events = await dbManager.getEvents(today, today);
      const inserted = events.find(e => e.agentSessionId === 'agent-session-123');
      expect(inserted).toBeDefined();
      expect(inserted?.isAgentMode).toBe(true);
    });
  });

  describe('Session Edge Cases', () => {
    it('should handle session without end time', async () => {
      const session: CodingSession = {
        id: 'session-no-end',
        startTime: Date.now(),
        eventCount: 0,
        aiLinesGenerated: 0,
        manualLinesWritten: 0,
        toolsUsed: []
      };

      await dbManager.insertOrUpdateSession(session);
      const retrieved = await dbManager.getSession(session.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.endTime).toBeUndefined();
    });

    it('should handle empty tools used array', async () => {
      const session: CodingSession = {
        id: 'session-no-tools',
        startTime: Date.now(),
        endTime: Date.now() + 1000,
        duration: 1000,
        eventCount: 5,
        aiLinesGenerated: 10,
        manualLinesWritten: 5,
        toolsUsed: []
      };

      await dbManager.insertOrUpdateSession(session);
      const retrieved = await dbManager.getSession(session.id);
      expect(retrieved?.toolsUsed).toEqual([]);
    });

    it('should handle multiple tool types', async () => {
      const session: CodingSession = {
        id: 'session-multi-tools',
        startTime: Date.now(),
        endTime: Date.now() + 3600000,
        duration: 3600000,
        eventCount: 100,
        aiLinesGenerated: 500,
        manualLinesWritten: 300,
        toolsUsed: [AITool.Copilot, AITool.Cursor, AITool.ClaudeCode]
      };

      await dbManager.insertOrUpdateSession(session);
      const retrieved = await dbManager.getSession(session.id);
      expect(retrieved?.toolsUsed).toHaveLength(3);
    });
  });

  describe('File Review Status Edge Cases', () => {
    it('should handle review status without agent session', async () => {
      const status = {
        filePath: '/test/file.ts',
        date: '2025-01-20',
        tool: AITool.Copilot,
        reviewQuality: 'light' as any,
        reviewScore: 50,
        isReviewed: false,
        linesGenerated: 25,
        charactersCount: 500,
        isAgentGenerated: false,
        wasFileOpen: true,
        firstGeneratedAt: Date.now(),
        totalReviewTime: 0,
        modificationCount: 1,
        totalTimeInFocus: 0,
        scrollEventCount: 0,
        cursorMovementCount: 0,
        editsMade: false,
        reviewSessionsCount: 0,
        reviewedInTerminal: false
      };

      await dbManager.insertOrUpdateFileReviewStatus(status);
      const files = await dbManager.getUnreviewedFiles('2025-01-20');
      expect(files).toBeDefined();
    });

    it('should handle terminal review flag', async () => {
      const status = {
        filePath: '/test/cli-file.ts',
        date: '2025-01-20',
        tool: AITool.ClaudeCode,
        reviewQuality: 'thorough' as any,
        reviewScore: 90,
        isReviewed: true,
        linesGenerated: 100,
        charactersCount: 2000,
        isAgentGenerated: true,
        wasFileOpen: false,
        firstGeneratedAt: Date.now(),
        totalReviewTime: 5000,
        modificationCount: 1,
        totalTimeInFocus: 0,
        scrollEventCount: 0,
        cursorMovementCount: 0,
        editsMade: true,
        reviewSessionsCount: 0,
        reviewedInTerminal: true
      };

      await dbManager.insertOrUpdateFileReviewStatus(status);
      const files = await dbManager.getUnreviewedFiles('2025-01-20');
      // Should not include reviewed files
      expect(files.every(f => f.filePath !== status.filePath)).toBe(true);
    });
  });

  describe('Stats with Multiple Event Types', () => {
    it('should count different event types separately', async () => {
      const eventTypes = [
        EventType.SuggestionDisplayed,
        EventType.SuggestionAccepted,
        EventType.SuggestionRejected,
        EventType.CodeGenerated,
        EventType.SessionStart,
        EventType.SessionEnd
      ];

      for (const eventType of eventTypes) {
        await dbManager.insertEvent({
          timestamp: Date.now(),
          tool: AITool.Copilot,
          eventType,
          linesOfCode: 5
        });
      }

      const stats = await dbManager.getStats();
      expect(stats.totalEvents).toBe(eventTypes.length);
    });

    it('should track events across multiple tools', async () => {
      const tools = [AITool.Copilot, AITool.Cursor, AITool.ClaudeCode];

      for (const tool of tools) {
        await dbManager.insertEvent({
          timestamp: Date.now(),
          tool,
          eventType: EventType.CodeGenerated,
          linesOfCode: 10
        });
      }

      const stats = await dbManager.getStats();
      expect(stats.totalEvents).toBe(tools.length);
    });
  });

  describe('Unreviewed Lines Calculation', () => {
    const today = new Date().toISOString().split('T')[0];

    describe('Scenario 1: File created, reviewed, then updated with new lines', () => {
      it('should track lines correctly when file is created with 200 lines, reviewed, then updated with 30 lines', async () => {
        const filePath = '/project/large-file.ts';

        // Step 1: File created with 200 lines
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 200,
          linesChanged: 200,
          linesSinceReview: 200, // Initial 200 lines are unreviewed
          charactersCount: 5000,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // Verify initial state
        let unreviewed = await dbManager.getUnreviewedFiles(today);
        let file = unreviewed.find(f => f.filePath === filePath);
        expect(file?.linesGenerated).toBe(200);
        expect(file?.linesSinceReview).toBe(200);
        expect(file?.isReviewed).toBe(false);

        // Step 2: File is marked as reviewed
        await dbManager.markFileAsReviewed(filePath, AITool.ClaudeCode, today, 'mid', 'manual');

        // Verify reviewed state
        unreviewed = await dbManager.getUnreviewedFiles(today);
        file = unreviewed.find(f => f.filePath === filePath);
        expect(file).toBeUndefined(); // File should no longer be in unreviewed list

        // Verify lines_since_review was reset to 0
        const allReviews = await dbManager.getFileReviewsForDate(today);
        const reviewedFile = allReviews.find(f => f.filePath === filePath);
        expect(reviewedFile?.linesSinceReview).toBe(0);
        expect(reviewedFile?.isReviewed).toBe(true);
        expect(reviewedFile?.linesGenerated).toBe(200); // Cumulative total preserved

        // Step 3: File updated with 30 new lines (different agent session)
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false, // New modification makes it unreviewed again
          linesGenerated: 230, // Cumulative: 200 + 30
          linesChanged: 230,
          linesSinceReview: 30, // Only 30 new lines since last review
          charactersCount: 5750,
          agentSessionId: 'session-2', // Different session = new modification
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: reviewedFile?.firstGeneratedAt || Date.now(),
          totalReviewTime: 0,
          modificationCount: 2,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // Verify final state
        unreviewed = await dbManager.getUnreviewedFiles(today);
        file = unreviewed.find(f => f.filePath === filePath);
        expect(file?.linesGenerated).toBe(230); // Cumulative total
        expect(file?.linesSinceReview).toBe(30); // Only new lines since review!
        expect(file?.isReviewed).toBe(false);
      });
    });

    describe('Scenario 2: Multiple update/review cycles', () => {
      it('should correctly track lines across multiple review cycles', async () => {
        const filePath = '/project/multiple-cycles.ts';

        // Cycle 1: Initial creation with 100 lines
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Cursor,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 100,
          linesChanged: 100,
          linesSinceReview: 100,
          charactersCount: 2500,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        await dbManager.markFileAsReviewed(filePath, AITool.Cursor, today, 'mid', 'manual');

        // Cycle 2: Add 50 lines
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Cursor,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 150,
          linesChanged: 150,
          linesSinceReview: 50,
          charactersCount: 3750,
          agentSessionId: 'session-2',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 2,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        await dbManager.markFileAsReviewed(filePath, AITool.Cursor, today, 'mid', 'manual');

        // Cycle 3: Add 25 lines
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Cursor,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 175,
          linesChanged: 175,
          linesSinceReview: 25,
          charactersCount: 4375,
          agentSessionId: 'session-3',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 3,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // Verify final state
        const unreviewed = await dbManager.getUnreviewedFiles(today);
        const file = unreviewed.find(f => f.filePath === filePath);
        expect(file?.linesGenerated).toBe(175); // Cumulative: 100 + 50 + 25
        expect(file?.linesSinceReview).toBe(25); // Only last cycle's lines
        expect(file?.isReviewed).toBe(false);
      });
    });

    describe('Scenario 3: File with deletions (lines removed)', () => {
      it('should mark file as unreviewed when lines are deleted', async () => {
        const filePath = '/project/deleted-lines.ts';

        // Initial file with 200 lines
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Copilot,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 200,
          linesChanged: 200,
          linesSinceReview: 200,
          charactersCount: 5000,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        await dbManager.markFileAsReviewed(filePath, AITool.Copilot, today, 'mid', 'manual');

        // File is updated with deletions (line count decreased)
        // linesChanged = 300 (200 deletions + 100 additions) but linesSinceReview stays at 0 or low
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Copilot,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false, // File needs re-review after modifications
          linesGenerated: 150, // Net decrease: 200 - 50
          linesChanged: 250, // Total changes: 200 deleted + 50 added/modified
          linesSinceReview: 50, // Only new additions need review
          charactersCount: 3750,
          agentSessionId: 'session-2',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 2,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // File should be in unreviewed list
        const unreviewed = await dbManager.getUnreviewedFiles(today);
        const file = unreviewed.find(f => f.filePath === filePath);
        expect(file).toBeDefined();
        expect(file?.isReviewed).toBe(false);
        expect(file?.linesSinceReview).toBe(50); // Only the new/changed lines
      });
    });

    describe('Scenario 4: Same agent session with multiple updates before review', () => {
      it('should accumulate lines from the same session before review', async () => {
        const filePath = '/project/same-session.ts';

        // First update in session-1: 100 lines
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 100,
          linesChanged: 100,
          linesSinceReview: 100,
          charactersCount: 2500,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // Second update in SAME session-1: +50 lines (caller sends accumulated 150)
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 150, // Cumulative
          linesChanged: 150,
          linesSinceReview: 150, // Caller sends accumulated value (100 + 50)
          charactersCount: 3750,
          agentSessionId: 'session-1', // Same session!
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 2,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // Verify accumulated lines
        const unreviewed = await dbManager.getUnreviewedFiles(today);
        const file = unreviewed.find(f => f.filePath === filePath);
        expect(file?.linesGenerated).toBe(150);
        expect(file?.linesSinceReview).toBe(150); // DB accumulates: 100 (first) + 50 (second) = 150 total since review
      });
    });

    describe('Scenario 5: Periodic aggregation should preserve lines_since_review', () => {
      it('should not overwrite lines_since_review when undefined is passed (periodic aggregation)', async () => {
        const filePath = '/project/aggregation-test.ts';

        // Initial file with 100 lines
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Cursor,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 100,
          linesChanged: 100,
          linesSinceReview: 100,
          charactersCount: 2500,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // Verify initial state
        let unreviewed = await dbManager.getUnreviewedFiles(today);
        let file = unreviewed.find(f => f.filePath === filePath);
        expect(file?.linesSinceReview).toBe(100);

        // Simulate periodic aggregation - send undefined for linesSinceReview
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Cursor,
          reviewQuality: 'light' as any,
          reviewScore: 50,
          isReviewed: false,
          linesGenerated: 100,
          linesChanged: 100,
          linesSinceReview: undefined as any, // Undefined from periodic aggregation
          charactersCount: 2500,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 10000,
          modificationCount: 1,
          totalTimeInFocus: 5000,
          scrollEventCount: 10,
          cursorMovementCount: 20,
          editsMade: true,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // Verify lines_since_review was preserved (not overwritten)
        unreviewed = await dbManager.getUnreviewedFiles(today);
        file = unreviewed.find(f => f.filePath === filePath);
        expect(file?.linesSinceReview).toBe(100); // Should still be 100
        expect(file?.reviewScore).toBe(50); // Other fields updated
      });
    });

    describe('Scenario 6: New agent session after review', () => {
      it('should correctly reset and track new lines after review when agent session changes', async () => {
        const filePath = '/project/session-change.ts';

        // Create file in session-1
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 200,
          linesChanged: 200,
          linesSinceReview: 200,
          charactersCount: 5000,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // Review the file
        await dbManager.markFileAsReviewed(filePath, AITool.ClaudeCode, today, 'mid', 'manual');

        // Verify reviewed state
        const allReviews = await dbManager.getFileReviewsForDate(today);
        const file = allReviews.find(f => f.filePath === filePath);
        expect(file?.isReviewed).toBe(true);
        expect(file?.linesSinceReview).toBe(0);

        // New agent session (session-2) adds 30 lines
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 230,
          linesChanged: 230,
          linesSinceReview: 30, // Only 30 new lines
          charactersCount: 5750,
          agentSessionId: 'session-2', // Different session!
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: file?.firstGeneratedAt || Date.now(),
          totalReviewTime: 0,
          modificationCount: 2,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // Verify new state
        const unreviewed = await dbManager.getUnreviewedFiles(today);
        const unreviewedFile = unreviewed.find(f => f.filePath === filePath);
        expect(unreviewedFile?.isReviewed).toBe(false);
        expect(unreviewedFile?.linesSinceReview).toBe(30); // Only new lines
        expect(unreviewedFile?.linesGenerated).toBe(230); // Cumulative total
      });
    });

    describe('Scenario 7: Multiple files with different review states', () => {
      it('should correctly track lines_since_review across multiple files', async () => {
        // File A: 100 lines, reviewed
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath: '/project/file-a.ts',
          date: today,
          tool: AITool.Copilot,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 100,
          linesChanged: 100,
          linesSinceReview: 100,
          charactersCount: 2500,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });
        await dbManager.markFileAsReviewed('/project/file-a.ts', AITool.Copilot, today, 'mid', 'manual');

        // File B: 150 lines, unreviewed
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath: '/project/file-b.ts',
          date: today,
          tool: AITool.Cursor,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 150,
          linesChanged: 150,
          linesSinceReview: 150,
          charactersCount: 3750,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // File C: 50 lines, reviewed, then 25 new lines added
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath: '/project/file-c.ts',
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 50,
          linesChanged: 50,
          linesSinceReview: 50,
          charactersCount: 1250,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });
        await dbManager.markFileAsReviewed('/project/file-c.ts', AITool.ClaudeCode, today, 'mid', 'manual');

        await dbManager.insertOrUpdateFileReviewStatus({
          filePath: '/project/file-c.ts',
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 75,
          linesChanged: 75,
          linesSinceReview: 25,
          charactersCount: 1875,
          agentSessionId: 'session-2',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 2,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // Verify all files
        const unreviewed = await dbManager.getUnreviewedFiles(today);

        const fileB = unreviewed.find(f => f.filePath === '/project/file-b.ts');
        expect(fileB?.linesSinceReview).toBe(150); // Full amount, never reviewed

        const fileC = unreviewed.find(f => f.filePath === '/project/file-c.ts');
        expect(fileC?.linesSinceReview).toBe(25); // Only new lines after review

        // File A should not be in unreviewed list
        const fileA = unreviewed.find(f => f.filePath === '/project/file-a.ts');
        expect(fileA).toBeUndefined();
      });
    });

    describe('Scenario 8: Zero lines in update event', () => {
      it('should handle events with zero lines correctly', async () => {
        const filePath = '/project/zero-lines.ts';

        // Initial file
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Copilot,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 100,
          linesChanged: 100,
          linesSinceReview: 100,
          charactersCount: 2500,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        await dbManager.markFileAsReviewed(filePath, AITool.Copilot, today, 'mid', 'manual');

        // Event with 0 lines (e.g., only metadata update)
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Copilot,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: true, // Still reviewed
          linesGenerated: 100,
          linesChanged: 100,
          linesSinceReview: 0, // No new lines
          charactersCount: 2500,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 5000,
          modificationCount: 2,
          totalTimeInFocus: 2000,
          scrollEventCount: 5,
          cursorMovementCount: 10,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // File should still be reviewed
        const allReviews = await dbManager.getFileReviewsForDate(today);
        const file = allReviews.find(f => f.filePath === filePath);
        expect(file?.isReviewed).toBe(true);
        expect(file?.linesSinceReview).toBe(0);
      });
    });

    describe('Scenario 9: Edge cases - empty file and very large files', () => {
      it('should handle empty file (0 lines) correctly', async () => {
        const filePath = '/project/empty-file.ts';

        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Copilot,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 0,
          linesChanged: 0,
          linesSinceReview: 0,
          charactersCount: 0,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        const unreviewed = await dbManager.getUnreviewedFiles(today);
        const file = unreviewed.find(f => f.filePath === filePath);
        expect(file?.linesGenerated).toBe(0);
        expect(file?.linesSinceReview).toBe(0);
      });

      it('should handle very large files (1000+ lines) correctly', async () => {
        const filePath = '/project/large-file.ts';
        const largeLineCount = 1500;

        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: largeLineCount,
          linesChanged: largeLineCount,
          linesSinceReview: largeLineCount,
          charactersCount: largeLineCount * 50,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        await dbManager.markFileAsReviewed(filePath, AITool.ClaudeCode, today, 'senior', 'manual');

        // Add 100 more lines
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: largeLineCount + 100,
          linesChanged: largeLineCount + 100,
          linesSinceReview: 100,
          charactersCount: (largeLineCount + 100) * 50,
          agentSessionId: 'session-2',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 2,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        const unreviewed = await dbManager.getUnreviewedFiles(today);
        const file = unreviewed.find(f => f.filePath === filePath);
        expect(file?.linesGenerated).toBe(1600);
        expect(file?.linesSinceReview).toBe(100); // Only new lines since review
      });
    });

    describe('Scenario 10: Multiple AI tools on the same file', () => {
      it('should correctly track lines when file is modified by different AI tools', async () => {
        const filePath = '/project/multi-tool-file.ts';

        // Copilot creates initial file with 50 lines
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Copilot,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 50,
          linesChanged: 50,
          linesSinceReview: 50,
          charactersCount: 1250,
          agentSessionId: 'copilot-session',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        await dbManager.markFileAsReviewed(filePath, AITool.Copilot, today, 'mid', 'manual');

        // Cursor adds 30 lines (different tool)
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Cursor,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 80,
          linesChanged: 80,
          linesSinceReview: 30,
          charactersCount: 2000,
          agentSessionId: 'cursor-session',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 2,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // Check that both tools have their own records
        const unreviewed = await dbManager.getUnreviewedFiles(today);
        const cursorFile = unreviewed.find(f => f.filePath === filePath && f.tool === 'cursor');
        expect(cursorFile?.linesSinceReview).toBe(30);

        // Copilot record should still show as reviewed (separate record per tool)
        const allReviews = await dbManager.getFileReviewsForDate(today);
        const copilotFile = allReviews.find(f => f.filePath === filePath && f.tool === 'copilot');
        expect(copilotFile?.isReviewed).toBe(true);
      });
    });

    describe('Scenario 11: Review quality and score variations', () => {
      it('should preserve review quality and score when marking as reviewed', async () => {
        const filePath = '/project/quality-test.ts';

        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 100,
          linesChanged: 100,
          linesSinceReview: 100,
          charactersCount: 2500,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: true,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 30000,
          modificationCount: 1,
          totalTimeInFocus: 15000,
          scrollEventCount: 25,
          cursorMovementCount: 100,
          editsMade: true,
          reviewSessionsCount: 1,
          reviewedInTerminal: false
        });

        await dbManager.markFileAsReviewed(filePath, AITool.ClaudeCode, today, 'senior', 'manual');

        const allReviews = await dbManager.getFileReviewsForDate(today);
        const file = allReviews.find(f => f.filePath === filePath);
        expect(file?.isReviewed).toBe(true);
        expect(file?.reviewQuality).toBe('thorough');
        expect(file?.reviewScore).toBe(100);
        expect(file?.linesSinceReview).toBe(0);
      });

      it('should handle different review quality levels', async () => {
        const filePath = '/project/light-review.ts';

        // Create file
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Cursor,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 75,
          linesChanged: 75,
          linesSinceReview: 75,
          charactersCount: 1875,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: true,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 5000,
          modificationCount: 1,
          totalTimeInFocus: 3000,
          scrollEventCount: 3,
          cursorMovementCount: 15,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // Mark as reviewed - system should detect "light" review based on low interaction
        await dbManager.markFileAsReviewed(filePath, AITool.Cursor, today, 'mid', 'automatic');

        const allReviews = await dbManager.getFileReviewsForDate(today);
        const file = allReviews.find(f => f.filePath === filePath);
        expect(file?.isReviewed).toBe(true);
        expect(file?.linesSinceReview).toBe(0);
      });
    });

    describe('Scenario 12: Session-related edge cases', () => {
      it('should handle null agent session ID', async () => {
        const filePath = '/project/no-session.ts';

        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Copilot,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 40,
          linesChanged: 40,
          linesSinceReview: 40,
          charactersCount: 1000,
          agentSessionId: undefined, // No session ID
          isAgentGenerated: false,
          wasFileOpen: true,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        const unreviewed = await dbManager.getUnreviewedFiles(today);
        const file = unreviewed.find(f => f.filePath === filePath);
        expect(file?.linesSinceReview).toBe(40);
      });

      it('should handle session ID changing mid-stream', async () => {
        const filePath = '/project/session-change-mid.ts';

        // Start with session-1
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 60,
          linesChanged: 60,
          linesSinceReview: 60,
          charactersCount: 1500,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // Continue with session-2 (same as new modification)
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 90,
          linesChanged: 90,
          linesSinceReview: 90, // Caller sends accumulated value (60 + 30)
          charactersCount: 2250,
          agentSessionId: 'session-2',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 2,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        const unreviewed = await dbManager.getUnreviewedFiles(today);
        const file = unreviewed.find(f => f.filePath === filePath);
        expect(file?.linesSinceReview).toBe(90); // Caller sent accumulated value
      });
    });

    describe('Scenario 13: File opened and closed multiple times', () => {
      it('should track review status across multiple open/close cycles', async () => {
        const filePath = '/project/multiple-opens.ts';

        // Initial creation
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Copilot,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 100,
          linesChanged: 100,
          linesSinceReview: 100,
          charactersCount: 2500,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: true, // File was opened
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 5000,
          scrollEventCount: 10,
          cursorMovementCount: 50,
          editsMade: false,
          reviewSessionsCount: 1,
          reviewedInTerminal: false
        });

        // File closed and reopened, new modification
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Copilot,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 120,
          linesChanged: 120,
          linesSinceReview: 120, // Caller sends accumulated value (100 + 20)
          charactersCount: 3000,
          agentSessionId: 'session-2',
          isAgentGenerated: true,
          wasFileOpen: true,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 2,
          totalTimeInFocus: 8000,
          scrollEventCount: 15,
          cursorMovementCount: 75,
          editsMade: false,
          reviewSessionsCount: 2,
          reviewedInTerminal: false
        });

        const unreviewed = await dbManager.getUnreviewedFiles(today);
        const file = unreviewed.find(f => f.filePath === filePath);
        expect(file?.linesSinceReview).toBe(120); // Caller sent accumulated value
        expect(file?.reviewSessionsCount).toBe(2);
      });
    });

    describe('Scenario 14: Multiple reviews without changes', () => {
      it('should handle multiple review actions without new changes', async () => {
        const filePath = '/project/multi-review.ts';

        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Cursor,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 80,
          linesChanged: 80,
          linesSinceReview: 80,
          charactersCount: 2000,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // First review
        await dbManager.markFileAsReviewed(filePath, AITool.Cursor, today, 'mid', 'manual');

        let allReviews = await dbManager.getFileReviewsForDate(today);
        let file = allReviews.find(f => f.filePath === filePath);
        expect(file?.isReviewed).toBe(true);
        expect(file?.linesSinceReview).toBe(0);

        // Second review (no changes in between)
        await dbManager.markFileAsReviewed(filePath, AITool.Cursor, today, 'mid', 'manual');

        allReviews = await dbManager.getFileReviewsForDate(today);
        file = allReviews.find(f => f.filePath === filePath);
        expect(file?.isReviewed).toBe(true);
        expect(file?.linesSinceReview).toBe(0);
      });
    });

    describe('Scenario 15: Cross-day file tracking', () => {
      it('should track files across multiple dates correctly', async () => {
        const filePath = '/project/cross-day.ts';
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        // Created yesterday
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: yesterday,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 150,
          linesChanged: 150,
          linesSinceReview: 150,
          charactersCount: 3750,
          agentSessionId: 'session-yesterday',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now() - 86400000,
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // Check yesterday's record
        const unreviewedYesterday = await dbManager.getUnreviewedFiles(yesterday);
        const fileYesterday = unreviewedYesterday.find(f => f.filePath === filePath);
        expect(fileYesterday?.linesSinceReview).toBe(150);

        // Continue work today
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 180,
          linesChanged: 180,
          linesSinceReview: 30,
          charactersCount: 4500,
          agentSessionId: 'session-today',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now() - 86400000,
          totalReviewTime: 0,
          modificationCount: 2,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // Check today's record
        const unreviewedToday = await dbManager.getUnreviewedFiles(today);
        const fileToday = unreviewedToday.find(f => f.filePath === filePath);
        expect(fileToday?.linesSinceReview).toBe(30); // Only today's changes

        // Records should be separate per date
        expect(unreviewedToday.length).toBe(1);
        expect(unreviewedYesterday.length).toBe(1);
      });
    });

    describe('Scenario 16: Rapid successive updates', () => {
      it('should handle rapid updates to the same file correctly', async () => {
        const filePath = '/project/rapid-updates.ts';

        // Rapid updates in quick succession (same session)
        for (let i = 1; i <= 10; i++) {
          await dbManager.insertOrUpdateFileReviewStatus({
            filePath,
            date: today,
            tool: AITool.ClaudeCode,
            reviewQuality: 'none' as any,
            reviewScore: 0,
            isReviewed: false,
            linesGenerated: i * 10, // 10, 20, 30, ..., 100
            linesChanged: i * 10,
            linesSinceReview: i * 10, // Caller must send accumulated value: 10, 20, 30, ..., 100
            charactersCount: i * 250,
            agentSessionId: 'rapid-session',
            isAgentGenerated: true,
            wasFileOpen: false,
            firstGeneratedAt: Date.now(),
            totalReviewTime: 0,
            modificationCount: i,
            totalTimeInFocus: 0,
            scrollEventCount: 0,
            cursorMovementCount: 0,
            editsMade: false,
            reviewSessionsCount: 0,
            reviewedInTerminal: false
          });
        }

        const unreviewed = await dbManager.getUnreviewedFiles(today);
        const file = unreviewed.find(f => f.filePath === filePath);
        expect(file?.linesGenerated).toBe(100); // Cumulative total
        expect(file?.linesSinceReview).toBe(100); // Last accumulated value sent
        expect(file?.modificationCount).toBe(10);
      });
    });

    describe('Scenario 17: Files with special characters in paths', () => {
      it('should handle files with spaces and special characters', async () => {
        const specialPaths = [
          '/project/file with spaces.ts',
          '/project/file-with-dashes.ts',
          '/project/file_with_underscores.ts',
          '/project/nested/deep/path/file.ts',
          '/project/file@123.ts',
          '/project/file(1).ts'
        ];

        for (const filePath of specialPaths) {
          await dbManager.insertOrUpdateFileReviewStatus({
            filePath,
            date: today,
            tool: AITool.Copilot,
            reviewQuality: 'none' as any,
            reviewScore: 0,
            isReviewed: false,
            linesGenerated: 25,
            linesChanged: 25,
            linesSinceReview: 25,
            charactersCount: 625,
            agentSessionId: 'session-1',
            isAgentGenerated: true,
            wasFileOpen: false,
            firstGeneratedAt: Date.now(),
            totalReviewTime: 0,
            modificationCount: 1,
            totalTimeInFocus: 0,
            scrollEventCount: 0,
            cursorMovementCount: 0,
            editsMade: false,
            reviewSessionsCount: 0,
            reviewedInTerminal: false
          });
        }

        const unreviewed = await dbManager.getUnreviewedFiles(today);
        expect(unreviewed.length).toBe(specialPaths.length);

        for (const filePath of specialPaths) {
          const file = unreviewed.find(f => f.filePath === filePath);
          expect(file?.linesSinceReview).toBe(25);
        }
      });
    });

    describe('Scenario 18: Concurrent updates to different files', () => {
      it('should handle multiple files being updated concurrently', async () => {
        const files = [];
        const fileCount = 20;

        // Create 20 files concurrently
        for (let i = 0; i < fileCount; i++) {
          const filePath = `/project/concurrent-file-${i}.ts`;
          files.push(filePath);

          await dbManager.insertOrUpdateFileReviewStatus({
            filePath,
            date: today,
            tool: AITool.Cursor,
            reviewQuality: 'none' as any,
            reviewScore: 0,
            isReviewed: false,
            linesGenerated: (i + 1) * 5, // Different line counts
            linesChanged: (i + 1) * 5,
            linesSinceReview: (i + 1) * 5,
            charactersCount: (i + 1) * 125,
            agentSessionId: 'session-1',
            isAgentGenerated: true,
            wasFileOpen: false,
            firstGeneratedAt: Date.now(),
            totalReviewTime: 0,
            modificationCount: 1,
            totalTimeInFocus: 0,
            scrollEventCount: 0,
            cursorMovementCount: 0,
            editsMade: false,
            reviewSessionsCount: 0,
            reviewedInTerminal: false
          });
        }

        const unreviewed = await dbManager.getUnreviewedFiles(today);
        expect(unreviewed.length).toBe(fileCount);

        // Verify each file has correct line count
        for (let i = 0; i < fileCount; i++) {
          const filePath = files[i];
          const file = unreviewed.find(f => f.filePath === filePath);
          expect(file?.linesSinceReview).toBe((i + 1) * 5);
        }
      });
    });

    describe('Scenario 19: Terminal workflow files', () => {
      it('should correctly handle terminal workflow files (never opened in editor)', async () => {
        const filePath = '/cli-generated/file.ts';

        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 200,
          linesChanged: 200,
          linesSinceReview: 200,
          charactersCount: 5000,
          agentSessionId: 'cli-session',
          isAgentGenerated: true,
          wasFileOpen: false, // Never opened in editor
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: true // Marked as terminal workflow
        });

        const unreviewed = await dbManager.getUnreviewedFiles(today);
        const file = unreviewed.find(f => f.filePath === filePath);
        expect(file?.linesSinceReview).toBe(200);
        expect(file?.reviewedInTerminal).toBe(true);
      });
    });

    describe('Scenario 20: Review during active agent session', () => {
      it('should handle file being reviewed while agent session is still active', async () => {
        const filePath = '/project/active-session-review.ts';

        // Agent starts working on file
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 75,
          linesChanged: 75,
          linesSinceReview: 75,
          charactersCount: 1875,
          agentSessionId: 'active-agent-session',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // User reviews while agent session is still active
        await dbManager.markFileAsReviewed(filePath, AITool.ClaudeCode, today, 'mid', 'manual');

        // Verify file is reviewed
        let allReviews = await dbManager.getFileReviewsForDate(today);
        let file = allReviews.find(f => f.filePath === filePath);
        expect(file?.isReviewed).toBe(true);
        expect(file?.linesSinceReview).toBe(0);

        // Agent continues in same session and adds more lines
        // NOTE: When same agent session continues after manual review,
        // the system considers this continuous work and preserves reviewed status
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 100,
          linesChanged: 100,
          linesSinceReview: 25, // New lines since review
          charactersCount: 2500,
          agentSessionId: 'active-agent-session', // Still the same session
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 2,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // File remains reviewed because it's the same agent session (continuous work)
        allReviews = await dbManager.getFileReviewsForDate(today);
        file = allReviews.find(f => f.filePath === filePath);
        expect(file?.isReviewed).toBe(true); // Still reviewed - same session is continuous work
        expect(file?.linesGenerated).toBe(100); // Cumulative total updated
      });
    });

    describe('Scenario 21: Partial file content replacement', () => {
      it('should handle file where most content is replaced but line count stays similar', async () => {
        const filePath = '/project/replaced-content.ts';

        // Initial file with 100 lines
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Cursor,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 100,
          linesChanged: 100,
          linesSinceReview: 100,
          charactersCount: 2500,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        await dbManager.markFileAsReviewed(filePath, AITool.Cursor, today, 'mid', 'manual');

        // File content is replaced (95 lines removed, 95 new lines added)
        // Net line count stays at 100, but entire content is different
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Cursor,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 100, // Same count
          linesChanged: 190, // But changed count is high (95 deletions + 95 additions)
          linesSinceReview: 95, // New content to review
          charactersCount: 2500,
          agentSessionId: 'session-2',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 2,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        const unreviewed = await dbManager.getUnreviewedFiles(today);
        const file = unreviewed.find(f => f.filePath === filePath);
        expect(file?.linesGenerated).toBe(100);
        expect(file?.linesChanged).toBe(190); // Reflects the actual changes
        expect(file?.linesSinceReview).toBe(95); // Only new lines
      });
    });

    describe('Scenario 22: Incremental development pattern', () => {
      it('should handle typical incremental development workflow', async () => {
        const filePath = '/project/incremental.ts';

        // Phase 1: Initial scaffold (20 lines)
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 20,
          linesChanged: 20,
          linesSinceReview: 20,
          charactersCount: 500,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        await dbManager.markFileAsReviewed(filePath, AITool.ClaudeCode, today, 'senior', 'manual');

        // Phase 2: Add function implementation (+30 lines)
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 50,
          linesChanged: 50,
          linesSinceReview: 30,
          charactersCount: 1250,
          agentSessionId: 'session-2',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 2,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        await dbManager.markFileAsReviewed(filePath, AITool.ClaudeCode, today, 'senior', 'manual');

        // Phase 3: Add tests (+15 lines)
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 65,
          linesChanged: 65,
          linesSinceReview: 15,
          charactersCount: 1625,
          agentSessionId: 'session-3',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 3,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        await dbManager.markFileAsReviewed(filePath, AITool.ClaudeCode, today, 'senior', 'manual');

        // Phase 4: Bug fix (+5 lines)
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 70,
          linesChanged: 70,
          linesSinceReview: 5,
          charactersCount: 1750,
          agentSessionId: 'session-4',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 4,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        const unreviewed = await dbManager.getUnreviewedFiles(today);
        const file = unreviewed.find(f => f.filePath === filePath);

        // Final state: 70 total lines generated, 5 unreviewed
        expect(file?.linesGenerated).toBe(70);
        expect(file?.linesSinceReview).toBe(5);
        expect(file?.modificationCount).toBe(4);
      });
    });

    describe('Scenario 23: Files marked as reviewed via automatic detection', () => {
      it('should distinguish between manual and automatic reviews', async () => {
        const filePath = '/project/auto-review.ts';

        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Copilot,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 60,
          linesChanged: 60,
          linesSinceReview: 60,
          charactersCount: 1500,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: true,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // Mark as reviewed via automatic detection (user spent time in file)
        await dbManager.markFileAsReviewed(filePath, AITool.Copilot, today, 'mid', 'automatic');

        const allReviews = await dbManager.getFileReviewsForDate(today);
        const file = allReviews.find(f => f.filePath === filePath);

        expect(file?.isReviewed).toBe(true);
        expect(file?.linesSinceReview).toBe(0);
      });
    });

    describe('Scenario 24: Agent reading existing file (should NOT mark as unreviewed)', () => {
      it('should not track files that are only read by agents, not modified', async () => {
        // This test verifies that when an agent reads an existing file (like backup_tool.py with 900 lines)
        // the system does NOT incorrectly mark it as AI-generated/unreviewed
        const filePath = '/existing-project/backup_tool.py';

        // Simulate existing file that was created before the session started
        // The agent is just reading this file, not creating it
        // In the real system, UnifiedAITracker now checks file age to distinguish this
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 0, // No AI-generated lines (file already existed)
          linesChanged: 0, // No modifications made
          linesSinceReview: 0, // Nothing to review
          charactersCount: 0,
          agentSessionId: 'reading-session',
          isAgentGenerated: false, // NOT AI-generated - file already existed
          wasFileOpen: true, // File was opened (agent read it)
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 0, // No modifications
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // Since linesGenerated = 0 and isAgentGenerated = false,
        // this file should NOT appear in the unreviewed list
        const unreviewed = await dbManager.getUnreviewedFiles(today);
        const file = unreviewed.find(f => f.filePath === filePath);

        // File should either not exist in unreviewed list, or have 0 lines to review
        expect(file?.linesSinceReview ?? 0).toBe(0);
      });
    });

    describe('Scenario 25: Agent deletes lines from file (should mark as unreviewed)', () => {
      it('should track files when agent deletes lines, not just adds', async () => {
        const filePath = '/project/file-with-deletions.ts';

        // Initial state: file created with 200 lines
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Copilot,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 200,
          linesChanged: 200,
          linesSinceReview: 200,
          charactersCount: 5000,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        await dbManager.markFileAsReviewed(filePath, AITool.Copilot, today, 'mid', 'manual');

        // Verify reviewed state
        const allReviews = await dbManager.getFileReviewsForDate(today);
        let file = allReviews.find(f => f.filePath === filePath);
        expect(file?.isReviewed).toBe(true);
        expect(file?.linesSinceReview).toBe(0);

        // Agent deletes 50 lines from the file
        // linesOfCode = 0 (no new lines), linesChanged = 50 (50 deletions)
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Copilot,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false, // New modification makes it unreviewed again
          linesGenerated: 200, // Cumulative stays at 200 (no additions)
          linesChanged: 250, // 200 original + 50 deletions = 250 total changes
          linesSinceReview: 50, // CRITICAL: Should be 50 (the deletions that need review)
          charactersCount: 5000,
          agentSessionId: 'session-2', // Different session
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 2,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // File should now appear in unreviewed list
        const unreviewed = await dbManager.getUnreviewedFiles(today);
        file = unreviewed.find(f => f.filePath === filePath);

        // File should be unreviewed
        expect(file).toBeDefined();
        expect(file?.isReviewed).toBe(false);
        expect(file?.linesSinceReview).toBe(50); // The deletions need review
        expect(file?.linesChanged).toBe(250); // Total changes tracked
      });
    });

    describe('Scenario 26: File with only deletions (no additions)', () => {
      it('should handle files where agent only removes lines without adding any', async () => {
        const filePath = '/project/only-deletions.ts';

        // Create initial file
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Cursor,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 150,
          linesChanged: 150,
          linesSinceReview: 150,
          charactersCount: 3750,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        await dbManager.markFileAsReviewed(filePath, AITool.Cursor, today, 'senior', 'manual');

        // Agent deletes ALL lines (file becomes empty or much smaller)
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Cursor,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 150, // Cumulative unchanged
          linesChanged: 300, // 150 original + 150 deletions = 300 total
          linesSinceReview: 150, // The deletions need review
          charactersCount: 3750,
          agentSessionId: 'session-2',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 2,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        const unreviewed = await dbManager.getUnreviewedFiles(today);
        const file = unreviewed.find(f => f.filePath === filePath);

        // Even though no new lines were added, file should be unreviewed due to deletions
        expect(file?.linesSinceReview).toBe(150);
        expect(file?.isReviewed).toBe(false);
      });
    });

    describe('Scenario 27: Mixed additions and deletions', () => {
      it('should correctly track when agent both adds and removes lines', async () => {
        const filePath = '/project/mixed-changes.ts';

        // Initial: 100 lines
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 100,
          linesChanged: 100,
          linesSinceReview: 100,
          charactersCount: 2500,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        await dbManager.markFileAsReviewed(filePath, AITool.ClaudeCode, today, 'mid', 'manual');

        // Agent makes mixed changes: +40 new lines, -20 deleted lines
        // Net: +20 lines, but total changes = 60
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 140, // Cumulative: 100 + 40
          linesChanged: 160, // 100 + 40 (additions) + 20 (deletions)
          linesSinceReview: 60, // Total changes that need review
          charactersCount: 3500,
          agentSessionId: 'session-2',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 2,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        const unreviewed = await dbManager.getUnreviewedFiles(today);
        const file = unreviewed.find(f => f.filePath === filePath);

        expect(file?.linesGenerated).toBe(140); // Net addition
        expect(file?.linesChanged).toBe(160); // Total changes (additions + deletions)
        expect(file?.linesSinceReview).toBe(60); // All changes need review
      });
    });

    describe('Scenario 28: Very small files (1-5 lines)', () => {
      it('should handle tiny files correctly', async () => {
        const filePath = '/project/tiny.ts';

        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Copilot,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 3, // Very small file
          linesChanged: 3,
          linesSinceReview: 3,
          charactersCount: 75,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        await dbManager.markFileAsReviewed(filePath, AITool.Copilot, today, 'senior', 'manual');

        // Add 1 more line
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Copilot,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 4,
          linesChanged: 4,
          linesSinceReview: 1,
          charactersCount: 100,
          agentSessionId: 'session-2',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 2,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        const unreviewed = await dbManager.getUnreviewedFiles(today);
        const file = unreviewed.find(f => f.filePath === filePath);

        expect(file?.linesSinceReview).toBe(1); // Should track even small changes
      });
    });

    describe('Scenario 29: Multiple agents working on same file', () => {
      it('should handle different agent sessions modifying the same file', async () => {
        const filePath = '/project/shared-file.ts';

        // Agent 1 creates initial version
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 80,
          linesChanged: 80,
          linesSinceReview: 80,
          charactersCount: 2000,
          agentSessionId: 'agent-1-session',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        await dbManager.markFileAsReviewed(filePath, AITool.ClaudeCode, today, 'mid', 'manual');

        // Agent 2 (different session) adds more lines
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 120,
          linesChanged: 120,
          linesSinceReview: 40,
          charactersCount: 3000,
          agentSessionId: 'agent-2-session', // Different agent
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 2,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        const unreviewed = await dbManager.getUnreviewedFiles(today);
        const file = unreviewed.find(f => f.filePath === filePath);

        expect(file?.linesSinceReview).toBe(40); // Only Agent 2's additions
        expect(file?.agentSessionId).toBe('agent-2-session'); // Should reflect latest session
      });
    });

    describe('Scenario 30: File opened in editor, then modified by agent', () => {
      it('should correctly handle files modified while user has them open', async () => {
        const filePath = '/project/open-then-modified.ts';

        // User opens file (no AI yet)
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Cursor,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 50,
          linesChanged: 50,
          linesSinceReview: 50,
          charactersCount: 1250,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: true, // File was open when modified
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 5000,
          scrollEventCount: 15,
          cursorMovementCount: 50,
          editsMade: false,
          reviewSessionsCount: 1,
          reviewedInTerminal: false
        });

        await dbManager.markFileAsReviewed(filePath, AITool.Cursor, today, 'mid', 'manual');

        // User still has file open, agent modifies it
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Cursor,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 75,
          linesChanged: 75,
          linesSinceReview: 25,
          charactersCount: 1875,
          agentSessionId: 'session-2',
          isAgentGenerated: true,
          wasFileOpen: true, // Still open
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 2,
          totalTimeInFocus: 8000,
          scrollEventCount: 20,
          cursorMovementCount: 75,
          editsMade: true,
          reviewSessionsCount: 1,
          reviewedInTerminal: false
        });

        const unreviewed = await dbManager.getUnreviewedFiles(today);
        const file = unreviewed.find(f => f.filePath === filePath);

        expect(file?.linesSinceReview).toBe(25); // Only new modifications
        expect(file?.wasFileOpen).toBe(true); // Track that file was open
      });
    });

    describe('Scenario 31: No actual content change (zero delta)', () => {
      it('should handle when file is saved without actual changes', async () => {
        const filePath = '/project/no-change.ts';

        // Initial file
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 60,
          linesChanged: 60,
          linesSinceReview: 60,
          charactersCount: 1500,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        await dbManager.markFileAsReviewed(filePath, AITool.ClaudeCode, today, 'mid', 'manual');

        // File "changed" but no actual delta (same content, just re-saved)
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: true, // Still reviewed (no actual changes)
          linesGenerated: 60, // Same
          linesChanged: 60,
          linesSinceReview: 0, // No new changes
          charactersCount: 1500,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 2,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // File should still be reviewed (no actual changes)
        const allReviews = await dbManager.getFileReviewsForDate(today);
        const file = allReviews.find(f => f.filePath === filePath);

        expect(file?.isReviewed).toBe(true);
        expect(file?.linesSinceReview).toBe(0);
      });
    });

    describe('Scenario 32: Configuration and non-source files', () => {
      it('should handle non-source code files (JSON, MD, config)', async () => {
        const configFiles = [
          '/project/config.json',
          '/project/README.md',
          '/project/.gitignore',
          '/project/.env.example'
        ];

        for (const filePath of configFiles) {
          await dbManager.insertOrUpdateFileReviewStatus({
            filePath,
            date: today,
            tool: AITool.ClaudeCode,
            reviewQuality: 'none' as any,
            reviewScore: 0,
            isReviewed: false,
            linesGenerated: 15,
            linesChanged: 15,
            linesSinceReview: 15,
            charactersCount: 400,
            agentSessionId: 'session-1',
            isAgentGenerated: true,
            wasFileOpen: false,
            firstGeneratedAt: Date.now(),
            totalReviewTime: 0,
            modificationCount: 1,
            totalTimeInFocus: 0,
            scrollEventCount: 0,
            cursorMovementCount: 0,
            editsMade: false,
            reviewSessionsCount: 0,
            reviewedInTerminal: false
          });
        }

        const unreviewed = await dbManager.getUnreviewedFiles(today);

        // All config files should be tracked
        expect(unreviewed.length).toBe(configFiles.length);
      });
    });

    describe('Scenario 33: Extremely large file (5000+ lines)', () => {
      it('should handle very large files efficiently', async () => {
        const filePath = '/project/large-service.ts';
        const hugeLineCount = 5000;

        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: hugeLineCount,
          linesChanged: hugeLineCount,
          linesSinceReview: hugeLineCount,
          charactersCount: hugeLineCount * 50,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        await dbManager.markFileAsReviewed(filePath, AITool.ClaudeCode, today, 'senior', 'manual');

        // Small update to large file
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: hugeLineCount + 15,
          linesChanged: hugeLineCount + 15,
          linesSinceReview: 15,
          charactersCount: (hugeLineCount + 15) * 50,
          agentSessionId: 'session-2',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 2,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        const unreviewed = await dbManager.getUnreviewedFiles(today);
        const file = unreviewed.find(f => f.filePath === filePath);

        expect(file?.linesSinceReview).toBe(15); // Only the small update
        expect(file?.linesGenerated).toBe(hugeLineCount + 15);
      });
    });

    describe('Scenario 34: File with special characters in name', () => {
      it('should handle files with unicode and special characters', async () => {
        const specialPaths = [
          '/project/文件名.ts', // Chinese characters
          '/project/fichier@v2.0.ts', // Special chars
          '/project/имя-файла.ts', // Cyrillic
          '/project/[test-file].ts', // Brackets
          '/project/file with    spaces.ts' // Multiple spaces
        ];

        for (const filePath of specialPaths) {
          await dbManager.insertOrUpdateFileReviewStatus({
            filePath,
            date: today,
            tool: AITool.Copilot,
            reviewQuality: 'none' as any,
            reviewScore: 0,
            isReviewed: false,
            linesGenerated: 10,
            linesChanged: 10,
            linesSinceReview: 10,
            charactersCount: 250,
            agentSessionId: 'session-1',
            isAgentGenerated: true,
            wasFileOpen: false,
            firstGeneratedAt: Date.now(),
            totalReviewTime: 0,
            modificationCount: 1,
            totalTimeInFocus: 0,
            scrollEventCount: 0,
            cursorMovementCount: 0,
            editsMade: false,
            reviewSessionsCount: 0,
            reviewedInTerminal: false
          });
        }

        const unreviewed = await dbManager.getUnreviewedFiles(today);
        expect(unreviewed.length).toBe(specialPaths.length);

        // Verify all files are tracked correctly
        for (const filePath of specialPaths) {
          const file = unreviewed.find(f => f.filePath === filePath);
          expect(file?.linesSinceReview).toBe(10);
        }
      });
    });

    describe('Scenario 35: Rapid review and modify cycles', () => {
      it('should handle quick review-modify-review cycles', async () => {
        const filePath = '/project/rapid-cycles.ts';

        // Create 20 lines
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Cursor,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 20,
          linesChanged: 20,
          linesSinceReview: 20,
          charactersCount: 500,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // Review
        await dbManager.markFileAsReviewed(filePath, AITool.Cursor, today, 'mid', 'manual');

        // Add 5 lines
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Cursor,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 25,
          linesChanged: 25,
          linesSinceReview: 5,
          charactersCount: 625,
          agentSessionId: 'session-2',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 2,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // Review again immediately
        await dbManager.markFileAsReviewed(filePath, AITool.Cursor, today, 'mid', 'manual');

        // Add 3 more lines
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Cursor,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 28,
          linesChanged: 28,
          linesSinceReview: 3,
          charactersCount: 700,
          agentSessionId: 'session-3',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 3,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // Final review
        await dbManager.markFileAsReviewed(filePath, AITool.Cursor, today, 'mid', 'manual');

        const allReviews = await dbManager.getFileReviewsForDate(today);
        const file = allReviews.find(f => f.filePath === filePath);

        // After all reviews, should be clean
        expect(file?.isReviewed).toBe(true);
        expect(file?.linesSinceReview).toBe(0);
        expect(file?.linesGenerated).toBe(28); // Final cumulative
        expect(file?.modificationCount).toBe(3); // 3 modifications total (20 lines + 5 lines + 3 lines)
      });
    });

    describe('Scenario 36: All three AI tools modifying same file', () => {
      it('should track each tool separately when multiple tools modify same file', async () => {
        const filePath = '/project/multi-tool.ts';

        // Claude Code creates initial
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 30,
          linesChanged: 30,
          linesSinceReview: 30,
          charactersCount: 750,
          agentSessionId: 'claude-session',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        await dbManager.markFileAsReviewed(filePath, AITool.ClaudeCode, today, 'mid', 'manual');

        // Copilot adds lines (separate tracking per tool)
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Copilot,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 20,
          linesChanged: 20,
          linesSinceReview: 20,
          charactersCount: 500,
          agentSessionId: 'copilot-session',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // Cursor adds lines (separate tracking per tool)
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Cursor,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 15,
          linesChanged: 15,
          linesSinceReview: 15,
          charactersCount: 375,
          agentSessionId: 'cursor-session',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        const unreviewed = await dbManager.getUnreviewedFiles(today);

        // Should have 2 unreviewed entries (Copilot and Cursor)
        // Claude Code's entry was reviewed, so not in unreviewed list
        expect(unreviewed.length).toBe(2);

        const copilotEntry = unreviewed.find(f => f.tool === 'copilot');
        const cursorEntry = unreviewed.find(f => f.tool === 'cursor');

        expect(copilotEntry?.linesSinceReview).toBe(20);
        expect(cursorEntry?.linesSinceReview).toBe(15);

        // Claude Code entry should be reviewed (not in unreviewed)
        const claudeEntry = unreviewed.find(f => f.tool === 'claude-code');
        expect(claudeEntry).toBeUndefined();
      });
    });

    describe('Scenario 37: File modified while review is in progress', () => {
      it('should handle file being modified during user review', async () => {
        const filePath = '/project/review-interrupted.ts';

        // Agent creates file
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 100,
          linesChanged: 100,
          linesSinceReview: 100,
          charactersCount: 2500,
          agentSessionId: 'agent-session',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // User starts reviewing (file is opened, user is scrolling through)
        // But agent makes more changes before review is complete

        // Add review tracking (simulating user opening file for review)
        // Note: No new lines added, so linesSinceReview stays at 100 (use undefined to preserve)
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'light' as any,
          reviewScore: 30,
          isReviewed: false, // Not fully reviewed yet
          linesGenerated: 100,
          linesChanged: 100,
          linesSinceReview: undefined, // Preserve existing value (100)
          charactersCount: 2500,
          agentSessionId: 'agent-session',
          isAgentGenerated: true,
          wasFileOpen: true, // User opened for review
          firstGeneratedAt: Date.now(),
          totalReviewTime: 5000,
          modificationCount: 2,
          totalTimeInFocus: 3000,
          scrollEventCount: 10,
          cursorMovementCount: 30,
          editsMade: false,
          reviewSessionsCount: 1,
          reviewedInTerminal: false
        });

        // Agent makes additional changes while user is reviewing!
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'light' as any,
          reviewScore: 30,
          isReviewed: false, // Now needs review again
          linesGenerated: 120,
          linesChanged: 120,
          linesSinceReview: 120, // Caller sends accumulated value (100 + 20)
          charactersCount: 3000,
          agentSessionId: 'agent-session', // Same session
          isAgentGenerated: true,
          wasFileOpen: true,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 5000,
          modificationCount: 3,
          totalTimeInFocus: 5000,
          scrollEventCount: 15,
          cursorMovementCount: 40,
          editsMade: false,
          reviewSessionsCount: 1,
          reviewedInTerminal: false
        });

        const unreviewed = await dbManager.getUnreviewedFiles(today);
        const file = unreviewed.find(f => f.filePath === filePath);

        expect(file?.linesSinceReview).toBe(120); // Caller sent accumulated value
        expect(file?.totalTimeInFocus).toBe(5000); // Review time tracked
        expect(file?.reviewSessionsCount).toBe(1); // Review session tracked
      });
    });

    describe('Scenario 38: Single line change', () => {
      it('should handle single-line modifications correctly', async () => {
        const filePath = '/project/single-line-change.ts';

        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Copilot,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 1,
          linesChanged: 1,
          linesSinceReview: 1,
          charactersCount: 25,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        const unreviewed = await dbManager.getUnreviewedFiles(today);
        const file = unreviewed.find(f => f.filePath === filePath);

        // Should track even single-line changes
        expect(file?.linesSinceReview).toBe(1);
        expect(file?.linesGenerated).toBe(1);
      });
    });

    describe('Scenario 39: Alternating between tools on same file', () => {
      it('should track when different AI tools alternately modify same file', async () => {
        const filePath = '/project/alternating.ts';

        // Copilot adds 10 lines
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Copilot,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 10,
          linesChanged: 10,
          linesSinceReview: 10,
          charactersCount: 250,
          agentSessionId: 'copilot-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // Cursor adds 15 lines to same file (separate entry)
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Cursor,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 15,
          linesChanged: 15,
          linesSinceReview: 15,
          charactersCount: 375,
          agentSessionId: 'cursor-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        // Copilot adds 5 more lines (updates Copilot's entry)
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.Copilot,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 15, // Copilot's cumulative: 10 + 5
          linesChanged: 15,
          linesSinceReview: 15, // Caller sends accumulated value (10 + 5)
          charactersCount: 375,
          agentSessionId: 'copilot-2',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 2,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        const unreviewed = await dbManager.getUnreviewedFiles(today);

        // Should have 2 unreviewed entries (one per tool)
        expect(unreviewed.length).toBe(2);

        const copilotEntry = unreviewed.find(f => f.tool === 'copilot');
        const cursorEntry = unreviewed.find(f => f.tool === 'cursor');

        expect(copilotEntry?.linesSinceReview).toBe(15); // Caller sent accumulated value
        expect(cursorEntry?.linesSinceReview).toBe(15); // Cursor's total
      });
    });

    describe('Scenario 40: File with zero new lines after review', () => {
      it('should handle file that has zero new lines when modified', async () => {
        const filePath = '/project/zero-new-lines.ts';

        // Original file had 100 lines
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 100,
          linesChanged: 100,
          linesSinceReview: 100,
          charactersCount: 2500,
          agentSessionId: 'session-1',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 1,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        await dbManager.markFileAsReviewed(filePath, AITool.ClaudeCode, today, 'mid', 'manual');

        // File is modified but has zero new lines (reformatting, comments only, etc.)
        await dbManager.insertOrUpdateFileReviewStatus({
          filePath,
          date: today,
          tool: AITool.ClaudeCode,
          reviewQuality: 'none' as any,
          reviewScore: 0,
          isReviewed: false,
          linesGenerated: 100, // No change
          linesChanged: 100,
          linesSinceReview: 0, // No new lines (but still modified)
          charactersCount: 2500,
          agentSessionId: 'session-2',
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: Date.now(),
          totalReviewTime: 0,
          modificationCount: 2,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: true,
          reviewSessionsCount: 0,
          reviewedInTerminal: false
        });

        const unreviewed = await dbManager.getUnreviewedFiles(today);
        const file = unreviewed.find(f => f.filePath === filePath);

        // Even with 0 new lines, file is unreviewed because it was modified
        // The modificationCount = 2 and editsMade = true indicate changes
        expect(file?.modificationCount).toBe(2);
      });
    });
  });
});
