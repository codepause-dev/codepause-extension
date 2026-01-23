/**
 * DiffViewService Tests
 */

import { DiffViewService } from '../DiffViewService';
import { FileReviewStatus, FileChangeStatus, AITool, ReviewQuality } from '../../types';

describe('DiffViewService', () => {
  let service: DiffViewService;

  beforeEach(() => {
    service = new DiffViewService();
  });

  const createMockFile = (overrides: Partial<FileReviewStatus> = {}): FileReviewStatus => ({
    filePath: '/test/file.ts',
    date: '2026-01-14',
    tool: AITool.ClaudeCode,
    reviewQuality: ReviewQuality.None,
    reviewScore: 0,
    isReviewed: false,
    linesGenerated: 100,
    linesAdded: 50,
    linesRemoved: 20,
    charactersCount: 1000,
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
    reviewedInTerminal: false,
    ...overrides
  });

  describe('calculateStatistics', () => {
    it('should return empty stats for empty file list', () => {
      const stats = service.calculateStatistics([]);

      expect(stats.totalFiles).toBe(0);
      expect(stats.totalAdditions).toBe(0);
      expect(stats.totalDeletions).toBe(0);
      expect(stats.reviewProgress).toBe(0);
    });

    it('should calculate correct totals', () => {
      const files = [
        createMockFile({ linesAdded: 100, linesRemoved: 20 }),
        createMockFile({ linesAdded: 50, linesRemoved: 30 }),
        createMockFile({ linesAdded: 25, linesRemoved: 0, isReviewed: true })
      ];

      const stats = service.calculateStatistics(files);

      expect(stats.totalFiles).toBe(3);
      expect(stats.totalAdditions).toBe(175);
      expect(stats.totalDeletions).toBe(50);
      expect(stats.reviewedFiles).toBe(1);
      expect(stats.reviewProgress).toBe(33); // 1/3 = 33%
    });

    it('should handle null/undefined line counts', () => {
      const files = [
        createMockFile({ linesAdded: undefined, linesRemoved: undefined })
      ];

      const stats = service.calculateStatistics(files);

      expect(stats.totalAdditions).toBe(0);
      expect(stats.totalDeletions).toBe(0);
    });
  });

  describe('determineFileStatus', () => {
    it('should return Modified for files with both additions and deletions', () => {
      const file = createMockFile({ linesAdded: 50, linesRemoved: 20 });
      expect(service.determineFileStatus(file)).toBe(FileChangeStatus.Modified);
    });

    it('should return Added for new files with only additions', () => {
      const file = createMockFile({
        linesAdded: 100,
        linesRemoved: 0,
        linesGenerated: 0 // New file indicator
      });
      expect(service.determineFileStatus(file)).toBe(FileChangeStatus.Added);
    });

    it('should return Deleted for files with only deletions and no remaining content', () => {
      const file = createMockFile({
        linesAdded: 0,
        linesRemoved: 100,
        linesGenerated: 0 // File fully deleted
      });
      expect(service.determineFileStatus(file)).toBe(FileChangeStatus.Deleted);
    });

    it('should return Unchanged for files with no changes', () => {
      const file = createMockFile({ linesAdded: 0, linesRemoved: 0 });
      expect(service.determineFileStatus(file)).toBe(FileChangeStatus.Unchanged);
    });
  });

  describe('generateChangeBar', () => {
    it('should calculate correct percentages', () => {
      const bar = service.generateChangeBar(75, 25);

      expect(bar.additionsWidth).toBe(75);
      expect(bar.deletionsWidth).toBe(25);
      expect(bar.totalChanges).toBe(100);
      expect(bar.showBar).toBe(true);
    });

    it('should handle zero changes', () => {
      const bar = service.generateChangeBar(0, 0);

      expect(bar.additionsWidth).toBe(0);
      expect(bar.deletionsWidth).toBe(0);
      expect(bar.showBar).toBe(false);
    });

    it('should handle only additions', () => {
      const bar = service.generateChangeBar(100, 0);

      expect(bar.additionsWidth).toBe(100);
      expect(bar.deletionsWidth).toBe(0);
    });

    it('should handle only deletions', () => {
      const bar = service.generateChangeBar(0, 50);

      expect(bar.additionsWidth).toBe(0);
      expect(bar.deletionsWidth).toBe(100);
    });

    it('should handle negative numbers gracefully', () => {
      const bar = service.generateChangeBar(-10, -5);

      expect(bar.showBar).toBe(false);
    });
  });

  describe('groupByDirectory', () => {
    it('should group files by parent directory', () => {
      const files = [
        createMockFile({ filePath: '/src/components/Button.tsx' }),
        createMockFile({ filePath: '/src/components/Input.tsx' }),
        createMockFile({ filePath: '/src/utils/helpers.ts' })
      ];

      const grouped = service.groupByDirectory(files);

      expect(grouped.size).toBe(2);
      expect(grouped.get('/src/components')?.length).toBe(2);
      expect(grouped.get('/src/utils')?.length).toBe(1);
    });

    it('should handle root files', () => {
      const files = [
        createMockFile({ filePath: 'README.md' })
      ];

      const grouped = service.groupByDirectory(files);

      expect(grouped.get('.')?.length).toBe(1);
    });
  });

  describe('formatLineCount', () => {
    it('should format small numbers as-is', () => {
      expect(service.formatLineCount(500)).toBe('500');
    });

    it('should format thousands with K suffix', () => {
      expect(service.formatLineCount(1500)).toBe('1.5K');
    });

    it('should format large numbers', () => {
      expect(service.formatLineCount(15000)).toBe('15.0K');
    });
  });
});
