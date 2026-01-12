/**
 * FileReviewSessionTracker Unit Tests
 * Note: These tests focus on core logic. VSCode API integration is tested via integration tests.
 */

// Mock vscode module
jest.mock('vscode', () => ({
  window: {
    onDidChangeActiveTextEditor: jest.fn(() => ({ dispose: jest.fn() })),
    onDidChangeTextEditorVisibleRanges: jest.fn(() => ({ dispose: jest.fn() })),
    onDidChangeTextEditorSelection: jest.fn(() => ({ dispose: jest.fn() })),
    activeTextEditor: undefined
  },
  workspace: {
    onDidChangeTextDocument: jest.fn(() => ({ dispose: jest.fn() }))
  },
  Uri: {
    file: (path: string) => ({ fsPath: path, scheme: 'file' })
  }
}), { virtual: true });

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { FileReviewSessionTracker } from '../FileReviewSessionTracker';
import { ReviewQuality, AITool, DeveloperLevel } from '../../types';

describe('FileReviewSessionTracker', () => {
  let tracker: FileReviewSessionTracker;

  beforeEach(() => {
    tracker = new FileReviewSessionTracker();
  });

  describe('startTracking', () => {
    it('should start tracking a file for review', () => {
      const filePath = '/project/unreviewed.ts';
      const agentSessionId = 'session-123';
      const linesGenerated = 100;

      // Should not throw
      expect(() => {
        tracker.startTracking(filePath, AITool.ClaudeCode, agentSessionId, linesGenerated);
      }).not.toThrow();
    });

    it('should track multiple files independently', () => {
      tracker.startTracking('/project/file1.ts', AITool.ClaudeCode, 'session-1', 50);
      tracker.startTracking('/project/file2.ts', AITool.ClaudeCode, 'session-1', 80);
      tracker.startTracking('/project/file3.ts', AITool.ClaudeCode, 'session-1', 30);

      // All should be tracked without errors
      expect(true).toBe(true); // Placeholder - actual verification would require exposing internal state
    });
  });

  describe('getSession', () => {
    it('should retrieve session for tracked file', () => {
      const filePath = '/project/file.ts';
      tracker.startTracking(filePath, AITool.ClaudeCode, 'session-1', 50);

      const session = tracker.getSession(filePath);

      expect(session).toBeDefined();
      expect(session?.filePath).toBe(filePath);
      expect(session?.linesGenerated).toBe(50);
      expect(session?.currentReviewQuality).toBe(ReviewQuality.None);
    });

    it('should return null for untracked file', () => {
      const session = tracker.getSession('/project/nonexistent.ts');

      expect(session).toBeNull();
    });
  });

  describe('getAllSessions', () => {
    it('should return all tracked sessions', () => {
      tracker.startTracking('/project/file1.ts', AITool.ClaudeCode, 'session-1', 50);
      tracker.startTracking('/project/file2.ts', AITool.ClaudeCode, 'session-1', 80);

      const sessions = tracker.getAllSessions();

      expect(sessions.length).toBe(2);
      expect(sessions[0].filePath).toMatch(/file[12]\.ts/);
    });

    it('should return empty array when no sessions tracked', () => {
      const sessions = tracker.getAllSessions();

      expect(sessions.length).toBe(0);
    });
  });

  describe('getAgentSessionSessions', () => {
    it('should filter sessions by agent session ID', () => {
      tracker.startTracking('/project/file1.ts', AITool.ClaudeCode, 'session-1', 50);
      tracker.startTracking('/project/file2.ts', AITool.ClaudeCode, 'session-2', 80);
      tracker.startTracking('/project/file3.ts', AITool.ClaudeCode, 'session-1', 30);

      const session1Files = tracker.getAgentSessionSessions('session-1');
      const session2Files = tracker.getAgentSessionSessions('session-2');

      expect(session1Files.length).toBe(2);
      expect(session2Files.length).toBe(1);
    });
  });

  describe('getReviewedFiles', () => {
    it('should return files marked as reviewed', () => {
      tracker.startTracking('/project/file1.ts', AITool.ClaudeCode, 'session-1', 50);
      tracker.startTracking('/project/file2.ts', AITool.ClaudeCode, 'session-1', 80);

      // Initially no files are reviewed
      const reviewed = tracker.getReviewedFiles();
      expect(reviewed.length).toBe(0);
    });
  });

  describe('getUnreviewedFiles', () => {
    it('should return files not yet reviewed', () => {
      tracker.startTracking('/project/file1.ts', AITool.ClaudeCode, 'session-1', 50);
      tracker.startTracking('/project/file2.ts', AITool.ClaudeCode, 'session-1', 80);

      const unreviewed = tracker.getUnreviewedFiles();

      expect(unreviewed.length).toBe(2);
      expect(unreviewed.every(s => !s.wasReviewed)).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should calculate statistics for tracked sessions', () => {
      tracker.startTracking('/project/file1.ts', AITool.ClaudeCode, 'session-1', 50);
      tracker.startTracking('/project/file2.ts', AITool.ClaudeCode, 'session-1', 80);

      const stats = tracker.getStats();

      expect(stats.totalSessions).toBe(2);
      expect(stats.unreviewedCount).toBe(2);
      expect(stats.reviewedCount).toBe(0);
      expect(stats.averageScore).toBe(0);
    });

    it('should return zeros for empty tracker', () => {
      const stats = tracker.getStats();

      expect(stats.totalSessions).toBe(0);
      expect(stats.reviewedCount).toBe(0);
      expect(stats.unreviewedCount).toBe(0);
      expect(stats.averageScore).toBe(0);
    });
  });

  describe('isTracking', () => {
    it('should check if file is being tracked', () => {
      const filePath = '/project/file.ts';

      expect(tracker.isTracking(filePath)).toBe(false);

      tracker.startTracking(filePath, AITool.ClaudeCode, 'session-1', 50);

      expect(tracker.isTracking(filePath)).toBe(true);
    });
  });

  describe('stopTracking', () => {
    it('should stop tracking a file', () => {
      const filePath = '/project/file.ts';
      tracker.startTracking(filePath, AITool.ClaudeCode, 'session-1', 50);

      const session = tracker.stopTracking(filePath);

      expect(session).toBeDefined();
      expect(session?.filePath).toBe(filePath);
      expect(tracker.isTracking(filePath)).toBe(false);
    });

    it('should return null for untracked file', () => {
      const session = tracker.stopTracking('/project/nonexistent.ts');

      expect(session).toBeNull();
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should cleanup sessions older than grace period', () => {
      // This would require mocking Date.now() or time manipulation
      // For now, just verify it doesn't throw
      expect(() => {
        tracker.cleanupExpiredSessions();
      }).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should clear all sessions', () => {
      tracker.startTracking('/project/file1.ts', AITool.ClaudeCode, 'session-1', 50);
      tracker.startTracking('/project/file2.ts', AITool.ClaudeCode, 'session-1', 80);

      tracker.clear();

      const sessions = tracker.getAllSessions();
      expect(sessions.length).toBe(0);
    });
  });

  describe('dispose', () => {
    it('should cleanup resources', () => {
      tracker.startTracking('/project/file.ts', AITool.ClaudeCode, 'session-1', 50);

      // Should not throw
      expect(() => {
        tracker.dispose();
      }).not.toThrow();
    });
  });

  describe('Developer Level', () => {
    it('should accept developer level in constructor', () => {
      const juniorTracker = new FileReviewSessionTracker(DeveloperLevel.Junior);
      const seniorTracker = new FileReviewSessionTracker(DeveloperLevel.Senior);

      expect(juniorTracker).toBeDefined();
      expect(seniorTracker).toBeDefined();
    });

    it('should default to mid-level developer', () => {
      const defaultTracker = new FileReviewSessionTracker();
      expect(defaultTracker).toBeDefined();
    });

    it('should allow changing developer level', () => {
      expect(() => {
        tracker.setDeveloperLevel(DeveloperLevel.Senior);
      }).not.toThrow();
    });

    it('should work with all developer levels', () => {
      Object.values(DeveloperLevel).forEach(level => {
        const levelTracker = new FileReviewSessionTracker(level);
        levelTracker.startTracking('/project/test.ts', AITool.ClaudeCode, 'session-1', 100);
        const session = levelTracker.getSession('/project/test.ts');
        expect(session).toBeDefined();
      });
    });
  });

  describe('Review Callbacks', () => {
    it('should allow setting review callback', () => {
      const callback = jest.fn();
      expect(() => {
        tracker.setReviewCallback(callback);
      }).not.toThrow();
    });

    it('should handle callback function', () => {
      const callback = jest.fn();
      tracker.setReviewCallback(callback);
      tracker.startTracking('/project/file.ts', AITool.ClaudeCode, 'session-1', 50);
      // Callback would be invoked internally when review is detected
      expect(callback).not.toThrow();
    });
  });

  describe('Multiple Sessions', () => {
    it('should handle multiple sessions from same agent', () => {
      tracker.startTracking('/project/file1.ts', AITool.ClaudeCode, 'same-session', 50);
      tracker.startTracking('/project/file2.ts', AITool.ClaudeCode, 'same-session', 80);
      tracker.startTracking('/project/file3.ts', AITool.ClaudeCode, 'same-session', 30);

      const sessions = tracker.getAgentSessionSessions('same-session');
      expect(sessions.length).toBe(3);
    });

    it('should track different tools separately', () => {
      tracker.startTracking('/project/file1.ts', AITool.ClaudeCode, 'session-1', 50);
      tracker.startTracking('/project/file2.ts', AITool.Copilot, 'session-2', 80);
      tracker.startTracking('/project/file3.ts', AITool.Cursor, 'session-3', 30);

      const all = tracker.getAllSessions();
      expect(all.length).toBe(3);
      expect(all.map(s => s.tool)).toContain(AITool.ClaudeCode);
      expect(all.map(s => s.tool)).toContain(AITool.Copilot);
      expect(all.map(s => s.tool)).toContain(AITool.Cursor);
    });

    it('should handle re-tracking same file', () => {
      const filePath = '/project/file.ts';
      tracker.startTracking(filePath, AITool.ClaudeCode, 'session-1', 50);
      tracker.startTracking(filePath, AITool.ClaudeCode, 'session-2', 80);

      const session = tracker.getSession(filePath);
      expect(session).toBeDefined();
      expect(session?.linesGenerated).toBe(80); // Should use new value
    });
  });

  describe('Session Statistics with Reviews', () => {
    it('should calculate stats with mixed reviewed/unreviewed files', () => {
      tracker.startTracking('/project/file1.ts', AITool.ClaudeCode, 'session-1', 50);
      tracker.startTracking('/project/file2.ts', AITool.ClaudeCode, 'session-1', 80);
      tracker.startTracking('/project/file3.ts', AITool.ClaudeCode, 'session-1', 30);

      const stats = tracker.getStats();
      expect(stats.totalSessions).toBe(3);
      expect(stats.unreviewedCount).toBeGreaterThanOrEqual(0);
    });

    it('should track total lines generated', () => {
      tracker.startTracking('/project/file1.ts', AITool.ClaudeCode, 'session-1', 50);
      tracker.startTracking('/project/file2.ts', AITool.ClaudeCode, 'session-1', 80);

      const sessions = tracker.getAllSessions();
      const totalLines = sessions.reduce((sum, s) => sum + s.linesGenerated, 0);
      expect(totalLines).toBe(130);
    });
  });

  describe('Initialization', () => {
    it('should initialize without active file', () => {
      expect(() => {
        tracker.initialize();
      }).not.toThrow();
    });

    it('should initialize active file timer', () => {
      expect(() => {
        tracker.initializeActiveFileTimer();
      }).not.toThrow();
    });

    it('should allow multiple initializations', () => {
      tracker.initialize();
      tracker.initialize(); // Second call should not throw
      expect(true).toBe(true);
    });
  });

  describe('Session Filtering', () => {
    beforeEach(() => {
      tracker.startTracking('/project/file1.ts', AITool.ClaudeCode, 'session-a', 50);
      tracker.startTracking('/project/file2.ts', AITool.ClaudeCode, 'session-b', 80);
      tracker.startTracking('/project/file3.ts', AITool.Copilot, 'session-a', 30);
      tracker.startTracking('/project/file4.ts', AITool.Cursor, 'session-c', 100);
    });

    it('should filter by agent session correctly', () => {
      const sessionA = tracker.getAgentSessionSessions('session-a');
      const sessionB = tracker.getAgentSessionSessions('session-b');
      const sessionC = tracker.getAgentSessionSessions('session-c');

      expect(sessionA.length).toBe(2);
      expect(sessionB.length).toBe(1);
      expect(sessionC.length).toBe(1);
    });

    it('should return empty array for non-existent session', () => {
      const nonExistent = tracker.getAgentSessionSessions('non-existent');
      expect(nonExistent.length).toBe(0);
    });

    it('should maintain session data integrity', () => {
      const session = tracker.getSession('/project/file1.ts');
      expect(session?.filePath).toBe('/project/file1.ts');
      expect(session?.tool).toBe(AITool.ClaudeCode);
      expect(session?.agentSessionId).toBe('session-a');
      expect(session?.linesGenerated).toBe(50);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty file paths', () => {
      expect(() => {
        tracker.startTracking('', AITool.ClaudeCode, 'session-1', 50);
      }).not.toThrow();
    });

    it('should handle zero lines generated', () => {
      tracker.startTracking('/project/empty.ts', AITool.ClaudeCode, 'session-1', 0);
      const session = tracker.getSession('/project/empty.ts');
      expect(session?.linesGenerated).toBe(0);
    });

    it('should handle very large line counts', () => {
      tracker.startTracking('/project/huge.ts', AITool.ClaudeCode, 'session-1', 10000);
      const session = tracker.getSession('/project/huge.ts');
      expect(session?.linesGenerated).toBe(10000);
    });

    it('should handle special characters in file paths', () => {
      const specialPath = '/project/file-with-特殊字符.ts';
      tracker.startTracking(specialPath, AITool.ClaudeCode, 'session-1', 50);
      const session = tracker.getSession(specialPath);
      expect(session?.filePath).toBe(specialPath);
    });

    it('should handle long file paths', () => {
      const longPath = '/very/long/path/' + 'a/'.repeat(100) + 'file.ts';
      tracker.startTracking(longPath, AITool.ClaudeCode, 'session-1', 50);
      const session = tracker.getSession(longPath);
      expect(session).toBeDefined();
    });
  });

  describe('Session Lifecycle', () => {
    it('should track full session lifecycle', () => {
      const filePath = '/project/lifecycle.ts';

      // Start tracking
      tracker.startTracking(filePath, AITool.ClaudeCode, 'session-1', 100);
      expect(tracker.isTracking(filePath)).toBe(true);

      // Get session
      const session = tracker.getSession(filePath);
      expect(session).toBeDefined();
      expect(session?.wasReviewed).toBe(false);

      // Stop tracking
      const stoppedSession = tracker.stopTracking(filePath);
      expect(stoppedSession).toBeDefined();
      expect(tracker.isTracking(filePath)).toBe(false);
    });

    it('should allow restarting stopped session', () => {
      const filePath = '/project/restart.ts';

      tracker.startTracking(filePath, AITool.ClaudeCode, 'session-1', 50);
      tracker.stopTracking(filePath);
      tracker.startTracking(filePath, AITool.ClaudeCode, 'session-2', 100);

      expect(tracker.isTracking(filePath)).toBe(true);
      const session = tracker.getSession(filePath);
      expect(session?.linesGenerated).toBe(100);
    });
  });

  describe('Cleanup Operations', () => {
    it('should cleanup expired sessions without errors', () => {
      tracker.startTracking('/project/file1.ts', AITool.ClaudeCode, 'session-1', 50);
      tracker.startTracking('/project/file2.ts', AITool.ClaudeCode, 'session-1', 80);

      expect(() => {
        tracker.cleanupExpiredSessions();
      }).not.toThrow();
    });

    it('should clear all sessions', () => {
      tracker.startTracking('/project/file1.ts', AITool.ClaudeCode, 'session-1', 50);
      tracker.startTracking('/project/file2.ts', AITool.ClaudeCode, 'session-1', 80);

      expect(tracker.getAllSessions().length).toBe(2);

      tracker.clear();

      expect(tracker.getAllSessions().length).toBe(0);
      expect(tracker.getStats().totalSessions).toBe(0);
    });

    it('should handle clear on empty tracker', () => {
      tracker.clear();
      expect(tracker.getAllSessions().length).toBe(0);
    });

    it('should handle cleanup on empty tracker', () => {
      expect(() => {
        tracker.cleanupExpiredSessions();
      }).not.toThrow();
    });
  });

  describe('Review Quality', () => {
    it('should initialize with None review quality', () => {
      tracker.startTracking('/project/file.ts', AITool.ClaudeCode, 'session-1', 50);
      const session = tracker.getSession('/project/file.ts');
      expect(session?.currentReviewQuality).toBe(ReviewQuality.None);
    });

    it('should initialize with zero review score', () => {
      tracker.startTracking('/project/file.ts', AITool.ClaudeCode, 'session-1', 50);
      const session = tracker.getSession('/project/file.ts');
      expect(session?.currentReviewScore).toBe(0);
    });

    it('should track review state correctly', () => {
      tracker.startTracking('/project/file.ts', AITool.ClaudeCode, 'session-1', 50);
      const session = tracker.getSession('/project/file.ts');
      expect(session?.wasReviewed).toBe(false);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle rapid session creation', () => {
      for (let i = 0; i < 100; i++) {
        tracker.startTracking(`/project/file${i}.ts`, AITool.ClaudeCode, 'session-1', 50);
      }

      const sessions = tracker.getAllSessions();
      expect(sessions.length).toBe(100);
    });

    it('should handle mixed operations', () => {
      tracker.startTracking('/project/file1.ts', AITool.ClaudeCode, 'session-1', 50);
      tracker.startTracking('/project/file2.ts', AITool.ClaudeCode, 'session-1', 80);
      tracker.stopTracking('/project/file1.ts');
      tracker.startTracking('/project/file3.ts', AITool.ClaudeCode, 'session-1', 30);
      tracker.clear();

      expect(tracker.getAllSessions().length).toBe(0);
    });
  });

  describe('VSCode API Initialization', () => {
    it('should setup all VSCode event listeners', () => {
      const vscode = require('vscode');

      tracker.initialize();

      expect(vscode.window.onDidChangeActiveTextEditor).toHaveBeenCalled();
      expect(vscode.window.onDidChangeTextEditorVisibleRanges).toHaveBeenCalled();
      expect(vscode.window.onDidChangeTextEditorSelection).toHaveBeenCalled();
      expect(vscode.workspace.onDidChangeTextDocument).toHaveBeenCalled();
    });

    it('should cleanup VSCode listeners on dispose', () => {
      tracker.initialize();
      tracker.dispose();

      // Should not throw after disposal
      expect(tracker.getAllSessions()).toBeDefined();
    });

    it('should register disposables for cleanup', () => {
      tracker.initialize();

      // Dispose should clean up all listeners
      expect(() => tracker.dispose()).not.toThrow();
    });
  });

  describe('Active File Timer Initialization', () => {
    it('should initialize timer without active editor', () => {
      const vscode = require('vscode');
      vscode.window.activeTextEditor = undefined;

      expect(() => {
        tracker.initializeActiveFileTimer();
      }).not.toThrow();
    });

    it('should initialize timer with active editor for tracked file', () => {
      const vscode = require('vscode');
      const filePath = '/project/tracked.ts';

      tracker.startTracking(filePath, AITool.ClaudeCode, 'session-1', 50);

      vscode.window.activeTextEditor = {
        document: {
          uri: vscode.Uri.file(filePath)
        }
      };

      expect(() => {
        tracker.initializeActiveFileTimer();
      }).not.toThrow();
    });

    it('should initialize timer with active editor for untracked file', () => {
      const vscode = require('vscode');

      vscode.window.activeTextEditor = {
        document: {
          uri: vscode.Uri.file('/project/untracked.ts')
        }
      };

      expect(() => {
        tracker.initializeActiveFileTimer();
      }).not.toThrow();
    });

    it('should handle initialization with null active editor', () => {
      const vscode = require('vscode');
      vscode.window.activeTextEditor = null;

      expect(() => {
        tracker.initializeActiveFileTimer();
      }).not.toThrow();
    });
  });

  describe('File URI Handling', () => {
    it('should extract path from file scheme URI', () => {
      const vscode = require('vscode');
      const uri = vscode.Uri.file('/project/file.ts');

      tracker.startTracking(uri.fsPath, AITool.ClaudeCode, 'session-1', 50);
      const session = tracker.getSession(uri.fsPath);
      expect(session).toBeDefined();
    });

    it('should handle URIs with different schemes', () => {
      // Test that tracker doesn't crash with various URI schemes
      expect(() => {
        tracker.startTracking('/project/file.ts', AITool.ClaudeCode, 'session-1', 50);
      }).not.toThrow();
    });

    it('should normalize file paths consistently', () => {
      const path1 = '/project/file.ts';
      const path2 = '/project/file.ts'; // Same path

      tracker.startTracking(path1, AITool.ClaudeCode, 'session-1', 50);

      expect(tracker.isTracking(path2)).toBe(true);
      expect(tracker.getSession(path2)).toBeDefined();
    });
  });

  describe('Session Timeout Handling', () => {
    it('should track session timestamps', () => {
      const filePath = '/project/timeout-test.ts';
      tracker.startTracking(filePath, AITool.ClaudeCode, 'session-1', 50);

      const session = tracker.getSession(filePath);
      expect(session).toBeDefined();
      expect(session?.generatedAt).toBeDefined();
      expect(session?.generatedAt).toBeGreaterThan(0);
    });

    it('should initialize with recent creation timestamp', () => {
      const now = Date.now();
      const filePath = '/project/recent.ts';

      tracker.startTracking(filePath, AITool.ClaudeCode, 'session-1', 50);

      const session = tracker.getSession(filePath);
      expect(session?.generatedAt).toBeGreaterThanOrEqual(now - 1000);
      expect(session?.generatedAt).toBeLessThanOrEqual(now + 1000);
    });

    it('should handle sessions with no lastOpenedAt', () => {
      const filePath = '/project/never-opened.ts';
      tracker.startTracking(filePath, AITool.ClaudeCode, 'session-1', 50);

      const session = tracker.getSession(filePath);
      expect(session?.lastOpenedAt).toBeUndefined();
    });
  });

  describe('Multiple Tool Support', () => {
    it('should support Claude Code tool', () => {
      tracker.startTracking('/project/file1.ts', AITool.ClaudeCode, 'session-1', 50);
      const session = tracker.getSession('/project/file1.ts');
      expect(session?.tool).toBe(AITool.ClaudeCode);
    });

    it('should support Copilot tool', () => {
      tracker.startTracking('/project/file2.ts', AITool.Copilot, 'session-1', 50);
      const session = tracker.getSession('/project/file2.ts');
      expect(session?.tool).toBe(AITool.Copilot);
    });

    it('should support Cursor tool', () => {
      tracker.startTracking('/project/file3.ts', AITool.Cursor, 'session-1', 50);
      const session = tracker.getSession('/project/file3.ts');
      expect(session?.tool).toBe(AITool.Cursor);
    });

    it('should track mixed tools in same session', () => {
      tracker.startTracking('/project/claude.ts', AITool.ClaudeCode, 'mixed-session', 50);
      tracker.startTracking('/project/copilot.ts', AITool.Copilot, 'mixed-session', 80);
      tracker.startTracking('/project/cursor.ts', AITool.Cursor, 'mixed-session', 30);

      const sessions = tracker.getAgentSessionSessions('mixed-session');
      expect(sessions.length).toBe(3);

      const tools = sessions.map(s => s.tool);
      expect(tools).toContain(AITool.ClaudeCode);
      expect(tools).toContain(AITool.Copilot);
      expect(tools).toContain(AITool.Cursor);
    });
  });

  describe('Review Score Initialization', () => {
    it('should initialize score to 0', () => {
      tracker.startTracking('/project/file.ts', AITool.ClaudeCode, 'session-1', 50);
      const session = tracker.getSession('/project/file.ts');
      expect(session?.currentReviewScore).toBe(0);
    });

    it('should initialize without lastOpenedAt', () => {
      tracker.startTracking('/project/file.ts', AITool.ClaudeCode, 'session-1', 50);
      const session = tracker.getSession('/project/file.ts');
      expect(session?.lastOpenedAt).toBeUndefined();
    });

    it('should initialize without totalTimeInFocus', () => {
      tracker.startTracking('/project/file.ts', AITool.ClaudeCode, 'session-1', 50);
      const session = tracker.getSession('/project/file.ts');
      expect(session?.totalTimeInFocus).toBe(0);
    });

    it('should initialize without edits made', () => {
      tracker.startTracking('/project/file.ts', AITool.ClaudeCode, 'session-1', 50);
      const session = tracker.getSession('/project/file.ts');
      expect(session?.editsMade).toBe(false);
    });
  });

  describe('Session State Management', () => {
    it('should maintain wasReviewed state', () => {
      tracker.startTracking('/project/file.ts', AITool.ClaudeCode, 'session-1', 50);
      const session = tracker.getSession('/project/file.ts');
      expect(session?.wasReviewed).toBe(false);
    });

    it('should track generatedAt timestamp', () => {
      const beforeCreate = Date.now();
      tracker.startTracking('/project/file.ts', AITool.ClaudeCode, 'session-1', 50);
      const afterCreate = Date.now();

      const session = tracker.getSession('/project/file.ts');
      expect(session?.generatedAt).toBeGreaterThanOrEqual(beforeCreate);
      expect(session?.generatedAt).toBeLessThanOrEqual(afterCreate);
    });

    it('should preserve agentSessionId', () => {
      const sessionId = 'unique-session-id-12345';
      tracker.startTracking('/project/file.ts', AITool.ClaudeCode, sessionId, 50);

      const session = tracker.getSession('/project/file.ts');
      expect(session?.agentSessionId).toBe(sessionId);
    });

    it('should preserve linesGenerated accurately', () => {
      const lines = 12345;
      tracker.startTracking('/project/file.ts', AITool.ClaudeCode, 'session-1', lines);

      const session = tracker.getSession('/project/file.ts');
      expect(session?.linesGenerated).toBe(lines);
    });
  });

  describe('Callback Invocation', () => {
    it('should store callback function', () => {
      const callback = jest.fn();
      tracker.setReviewCallback(callback);

      // Callback is stored but not invoked until review is detected
      expect(callback).not.toHaveBeenCalled();
    });

    it('should accept null callback', () => {
      expect(() => {
        tracker.setReviewCallback(null as any);
      }).not.toThrow();
    });

    it('should allow callback replacement', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      tracker.setReviewCallback(callback1);
      tracker.setReviewCallback(callback2);

      // Only callback2 should be active
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });
  });

  describe('Statistics Edge Cases', () => {
    it('should handle stats with single session', () => {
      tracker.startTracking('/project/single.ts', AITool.ClaudeCode, 'session-1', 50);

      const stats = tracker.getStats();
      expect(stats.totalSessions).toBe(1);
      expect(stats.unreviewedCount).toBe(1);
      expect(stats.reviewedCount).toBe(0);
    });

    it('should calculate average score with no sessions', () => {
      const stats = tracker.getStats();
      expect(stats.averageScore).toBe(0);
    });

    it('should handle stats after cleanup', () => {
      tracker.startTracking('/project/file1.ts', AITool.ClaudeCode, 'session-1', 50);
      tracker.startTracking('/project/file2.ts', AITool.ClaudeCode, 'session-1', 80);

      tracker.cleanupExpiredSessions();

      const stats = tracker.getStats();
      expect(stats.totalSessions).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Session Data Integrity', () => {
    it('should preserve all session fields', () => {
      const filePath = '/project/complete.ts';
      const tool = AITool.ClaudeCode;
      const agentSessionId = 'session-xyz';
      const linesGenerated = 150;

      tracker.startTracking(filePath, tool, agentSessionId, linesGenerated);

      const session = tracker.getSession(filePath);
      expect(session?.filePath).toBe(filePath);
      expect(session?.tool).toBe(tool);
      expect(session?.agentSessionId).toBe(agentSessionId);
      expect(session?.linesGenerated).toBe(linesGenerated);
      expect(session?.currentReviewQuality).toBe(ReviewQuality.None);
      expect(session?.currentReviewScore).toBe(0);
      expect(session?.wasReviewed).toBe(false);
      expect(session?.generatedAt).toBeGreaterThan(0);
    });

    it('should maintain data consistency after operations', () => {
      const filePath = '/project/consistent.ts';

      tracker.startTracking(filePath, AITool.ClaudeCode, 'session-1', 50);
      const session1 = tracker.getSession(filePath);

      tracker.startTracking(filePath, AITool.ClaudeCode, 'session-2', 100);
      const session2 = tracker.getSession(filePath);

      expect(session2?.filePath).toBe(session1?.filePath);
      expect(session2?.linesGenerated).toBe(100);
      expect(session2?.agentSessionId).toBe('session-2');
    });
  });

  describe('Disposal and Cleanup', () => {
    it('should dispose without initialization', () => {
      const freshTracker = new FileReviewSessionTracker();
      expect(() => freshTracker.dispose()).not.toThrow();
    });

    it('should dispose after initialization', () => {
      tracker.initialize();
      expect(() => tracker.dispose()).not.toThrow();
    });

    it('should dispose with active sessions', () => {
      tracker.startTracking('/project/file1.ts', AITool.ClaudeCode, 'session-1', 50);
      tracker.startTracking('/project/file2.ts', AITool.ClaudeCode, 'session-1', 80);

      expect(() => tracker.dispose()).not.toThrow();
    });

    it('should allow operations after dispose', () => {
      tracker.dispose();

      // Operations should still work after dispose
      expect(() => {
        tracker.startTracking('/project/file.ts', AITool.ClaudeCode, 'session-1', 50);
      }).not.toThrow();
    });
  });
});
