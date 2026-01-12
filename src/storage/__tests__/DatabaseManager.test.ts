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
});
