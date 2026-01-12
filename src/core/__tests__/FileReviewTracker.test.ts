/**
 * FileReviewTracker Unit Tests
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { FileReviewTracker } from '../FileReviewTracker';
import { FileReviewStatus, ReviewQuality, AITool } from '../../types';

describe('FileReviewTracker', () => {
  let tracker: FileReviewTracker;
  const today = new Date().toISOString().split('T')[0];

  beforeEach(() => {
    tracker = new FileReviewTracker();
  });

  describe('trackFile', () => {
    it('should track file review status', () => {
      const status: FileReviewStatus = {
        filePath: '/project/file.ts',
        date: today,
        tool: AITool.Copilot,
        reviewQuality: ReviewQuality.Thorough,
        reviewScore: 85,
        isReviewed: true,
        linesGenerated: 50,
        charactersCount: 1200,
        agentSessionId: undefined,
        isAgentGenerated: false,
        wasFileOpen: true,
        firstGeneratedAt: Date.now(),
        lastReviewedAt: Date.now(),
        totalReviewTime: 5000,
        modificationCount: 1,
        totalTimeInFocus: 60000,
        scrollEventCount: 5,
        cursorMovementCount: 10,
        editsMade: true,
        reviewSessionsCount: 1,
        reviewedInTerminal: false
      };

      tracker.trackFile(status);

      const retrieved = tracker.getFileStatus('/project/file.ts', today, AITool.Copilot);

      expect(retrieved).toBeDefined();
      expect(retrieved?.reviewQuality).toBe(ReviewQuality.Thorough);
      expect(retrieved?.reviewScore).toBe(85);
    });

    it('should update existing file status', () => {
      const initialStatus: FileReviewStatus = {
        filePath: '/project/file.ts',
        date: today,
        tool: AITool.Copilot,
        reviewQuality: ReviewQuality.None,
        reviewScore: 25,
        isReviewed: false,
        linesGenerated: 50,
        charactersCount: 1200,
        agentSessionId: undefined,
        isAgentGenerated: false,
        wasFileOpen: true,
        firstGeneratedAt: Date.now(),
        lastReviewedAt: undefined,
        totalReviewTime: 1000,
        modificationCount: 0,
        totalTimeInFocus: 5000,
        scrollEventCount: 0,
        cursorMovementCount: 0,
        editsMade: false,
        reviewSessionsCount: 0,
        reviewedInTerminal: false
      };

      tracker.trackFile(initialStatus);

      // Update with better review
      const updatedStatus: FileReviewStatus = {
        ...initialStatus,
        reviewQuality: ReviewQuality.Thorough,
        reviewScore: 80,
        isReviewed: true,
        lastReviewedAt: Date.now()
      };

      tracker.trackFile(updatedStatus);

      const retrieved = tracker.getFileStatus('/project/file.ts', today, AITool.Copilot);

      expect(retrieved?.reviewScore).toBe(80);
      expect(retrieved?.isReviewed).toBe(true);
    });
  });

  describe('getUnreviewedFiles', () => {
    it('should return only unreviewed files', () => {
      const reviewedFile: FileReviewStatus = {
        filePath: '/project/reviewed.ts',
        date: today,
        tool: AITool.Copilot,
        reviewQuality: ReviewQuality.Thorough,
        reviewScore: 85,
        isReviewed: true,
        linesGenerated: 50,
        charactersCount: 1200,
        agentSessionId: undefined,
        isAgentGenerated: false,
        wasFileOpen: true,
        firstGeneratedAt: Date.now(),
        lastReviewedAt: Date.now(),
        totalReviewTime: 5000,
        modificationCount: 1,
        totalTimeInFocus: 60000,
        scrollEventCount: 5,
        cursorMovementCount: 10,
        editsMade: true,
        reviewSessionsCount: 1,
        reviewedInTerminal: false
      };

      const unreviewedFile: FileReviewStatus = {
        filePath: '/project/unreviewed.ts',
        date: today,
        tool: AITool.ClaudeCode,
        reviewQuality: ReviewQuality.None,
        reviewScore: 15,
        isReviewed: false,
        linesGenerated: 100,
        charactersCount: 2500,
        agentSessionId: 'session-1',
        isAgentGenerated: true,
        wasFileOpen: false,
        firstGeneratedAt: Date.now(),
        lastReviewedAt: undefined,
        totalReviewTime: 0,
        modificationCount: 0,
        totalTimeInFocus: 0,
        scrollEventCount: 0,
        cursorMovementCount: 0,
        editsMade: false,
        reviewSessionsCount: 0,
        reviewedInTerminal: false
      };

      tracker.trackFile(reviewedFile);
      tracker.trackFile(unreviewedFile);

      const unreviewed = tracker.getUnreviewedFiles();

      expect(unreviewed.length).toBe(1);
      expect(unreviewed[0].filePath).toBe('/project/unreviewed.ts');
    });

    it('should filter by date', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const todayFile: FileReviewStatus = {
        filePath: '/project/today.ts',
        date: today,
        tool: AITool.Copilot,
        reviewQuality: ReviewQuality.None,
        reviewScore: 20,
        isReviewed: false,
        linesGenerated: 30,
        charactersCount: 800,
        agentSessionId: undefined,
        isAgentGenerated: false,
        wasFileOpen: true,
        firstGeneratedAt: Date.now(),
        lastReviewedAt: undefined,
        totalReviewTime: 0,
        modificationCount: 0,
        totalTimeInFocus: 0,
        scrollEventCount: 0,
        cursorMovementCount: 0,
        editsMade: false,
        reviewSessionsCount: 0,
        reviewedInTerminal: false
      };

      const yesterdayFile: FileReviewStatus = {
        filePath: '/project/yesterday.ts',
        date: yesterday,
        tool: AITool.Copilot,
        reviewQuality: ReviewQuality.None,
        reviewScore: 25,
        isReviewed: false,
        linesGenerated: 40,
        charactersCount: 1000,
        agentSessionId: undefined,
        isAgentGenerated: false,
        wasFileOpen: true,
        firstGeneratedAt: Date.now() - 24 * 60 * 60 * 1000,
        lastReviewedAt: undefined,
        totalReviewTime: 0,
        modificationCount: 0,
        totalTimeInFocus: 0,
        scrollEventCount: 0,
        cursorMovementCount: 0,
        editsMade: false,
        reviewSessionsCount: 0,
        reviewedInTerminal: false
      };

      tracker.trackFile(todayFile);
      tracker.trackFile(yesterdayFile);

      const todayUnreviewed = tracker.getUnreviewedFiles({ date: today });

      expect(todayUnreviewed.length).toBe(1);
      expect(todayUnreviewed[0].date).toBe(today);
    });
  });

  describe('markAsReviewed', () => {
    it('should mark file as reviewed', () => {
      const status: FileReviewStatus = {
        filePath: '/project/file.ts',
        date: today,
        tool: AITool.Copilot,
        reviewQuality: ReviewQuality.None,
        reviewScore: 20,
        isReviewed: false,
        linesGenerated: 50,
        charactersCount: 1200,
        agentSessionId: undefined,
        isAgentGenerated: false,
        wasFileOpen: true,
        firstGeneratedAt: Date.now(),
        lastReviewedAt: undefined,
        totalReviewTime: 0,
        modificationCount: 0,
        totalTimeInFocus: 0,
        scrollEventCount: 0,
        cursorMovementCount: 0,
        editsMade: false,
        reviewSessionsCount: 0,
        reviewedInTerminal: false
      };

      tracker.trackFile(status);

      tracker.markAsReviewed('/project/file.ts', today, AITool.Copilot, ReviewQuality.Thorough, 85);

      const updated = tracker.getFileStatus('/project/file.ts', today, AITool.Copilot);

      expect(updated?.isReviewed).toBe(true);
      expect(updated?.reviewQuality).toBe(ReviewQuality.Thorough);
      expect(updated?.reviewScore).toBe(85);
    });
  });

  describe('getStats', () => {
    it('should calculate review statistics', () => {
      const files: FileReviewStatus[] = [
        {
          filePath: '/project/file1.ts',
          date: today,
          tool: AITool.Copilot,
          reviewQuality: ReviewQuality.Thorough,
          reviewScore: 85,
          isReviewed: true,
          linesGenerated: 50,
          charactersCount: 1200,
          agentSessionId: undefined,
          isAgentGenerated: false,
          wasFileOpen: true,
          firstGeneratedAt: Date.now(),
          lastReviewedAt: Date.now(),
          totalReviewTime: 5000,
          modificationCount: 1,
          totalTimeInFocus: 60000,
          scrollEventCount: 5,
          cursorMovementCount: 10,
          editsMade: true,
          reviewSessionsCount: 1,
        reviewedInTerminal: false
        },
        {
          filePath: '/project/file2.ts',
          date: today,
          tool: AITool.Copilot,
          reviewQuality: ReviewQuality.None,
          reviewScore: 25,
          isReviewed: false,
          linesGenerated: 30,
          charactersCount: 800,
          agentSessionId: undefined,
          isAgentGenerated: false,
          wasFileOpen: true,
          firstGeneratedAt: Date.now(),
          lastReviewedAt: undefined,
          totalReviewTime: 0,
          modificationCount: 0,
          totalTimeInFocus: 0,
          scrollEventCount: 0,
          cursorMovementCount: 0,
          editsMade: false,
          reviewSessionsCount: 0,
        reviewedInTerminal: false
        }
      ];

      files.forEach((f: FileReviewStatus) => tracker.trackFile(f));

      const stats = tracker.getStats({ date: today });

      expect(stats.totalFiles).toBe(2);
      expect(stats.reviewedFiles).toBe(1);
      expect(stats.unreviewedFiles).toBe(1);
      expect(stats.totalLines).toBe(80);
      expect(stats.reviewedLines).toBe(50);
      expect(stats.unreviewedLines).toBe(30);
    });
  });

  describe('Edge Cases', () => {
    it('should handle same file from different tools separately', () => {
      const copilotStatus: FileReviewStatus = {
        filePath: '/project/shared.ts',
        date: today,
        tool: AITool.Copilot,
        reviewQuality: ReviewQuality.Thorough,
        reviewScore: 80,
        isReviewed: true,
        linesGenerated: 30,
        charactersCount: 800,
        agentSessionId: undefined,
        isAgentGenerated: false,
        wasFileOpen: true,
        firstGeneratedAt: Date.now(),
        lastReviewedAt: Date.now(),
        totalReviewTime: 5000,
        modificationCount: 1,
        totalTimeInFocus: 60000,
        scrollEventCount: 5,
        cursorMovementCount: 10,
        editsMade: true,
        reviewSessionsCount: 1,
        reviewedInTerminal: false
      };

      const cursorStatus: FileReviewStatus = {
        filePath: '/project/shared.ts',
        date: today,
        tool: AITool.Cursor,
        reviewQuality: ReviewQuality.Light,
        reviewScore: 55,
        isReviewed: true,
        linesGenerated: 20,
        charactersCount: 500,
        agentSessionId: undefined,
        isAgentGenerated: false,
        wasFileOpen: true,
        firstGeneratedAt: Date.now(),
        lastReviewedAt: Date.now(),
        totalReviewTime: 3000,
        modificationCount: 1,
        totalTimeInFocus: 30000,
        scrollEventCount: 3,
        cursorMovementCount: 5,
        editsMade: false,
        reviewSessionsCount: 1,
        reviewedInTerminal: false
      };

      tracker.trackFile(copilotStatus);
      tracker.trackFile(cursorStatus);

      const copilotFile = tracker.getFileStatus('/project/shared.ts', today, AITool.Copilot);
      const cursorFile = tracker.getFileStatus('/project/shared.ts', today, AITool.Cursor);

      expect(copilotFile?.reviewScore).toBe(80);
      expect(cursorFile?.reviewScore).toBe(55);
    });

    it('should return null for non-existent file', () => {
      const result = tracker.getFileStatus('/project/nonexistent.ts', today, AITool.Copilot);

      expect(result).toBeNull();
    });
  });
});
