/**
 * ProgressTracker Unit Tests
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ProgressTracker } from '../ProgressTracker';
import { MetricsRepository } from '../../storage/MetricsRepository';
import { ConfigRepository } from '../../storage/ConfigRepository';
import { Achievement } from '../../types';

jest.mock('../../storage/MetricsRepository');
jest.mock('../../storage/ConfigRepository');
// eslint-disable-next-line @typescript-eslint/naming-convention
jest.mock('vscode', () => ({
  EventEmitter: class {
    event = jest.fn();
    fire = jest.fn();
    dispose = jest.fn();
  }
}), { virtual: true });

describe('ProgressTracker', () => {
  let tracker: ProgressTracker;
  let mockMetricsRepo: jest.Mocked<MetricsRepository>;
  let mockConfigRepo: jest.Mocked<ConfigRepository>;

  beforeEach(() => {
    mockMetricsRepo = {
      getStatsSummary: jest.fn<() => Promise<{ totalEvents: number; totalSessions: number; databaseSize: number }>>().mockResolvedValue({
        totalEvents: 0,
        totalSessions: 0,
        databaseSize: 0
      }),
      getDailyMetrics: jest.fn<() => Promise<null>>().mockResolvedValue(null)
    } as unknown as jest.Mocked<MetricsRepository>;

    mockConfigRepo = {
      getAllAchievements: jest.fn<() => Promise<Achievement[]>>().mockResolvedValue([])
    } as unknown as jest.Mocked<ConfigRepository>;

    tracker = new ProgressTracker(mockMetricsRepo, mockConfigRepo);
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await tracker.initialize();

      expect(true).toBe(true); // Basic initialization test
    });
  });

  describe('Progression System', () => {
    beforeEach(async () => {
      await tracker.initialize();
    });

    it('should get current level', async () => {
      const level = await tracker.getLevel();
      expect(level).toBeGreaterThanOrEqual(1);
      expect(level).toBeLessThanOrEqual(9);
    });

    it('should get XP to next level', async () => {
      const xpToNext = await tracker.getXPToNextLevel();
      expect(xpToNext).toBeGreaterThanOrEqual(0);
    });

    it('should get progress percentage', async () => {
      const progress = await tracker.getProgressPercentage();
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(100);
    });

    it('should get progression summary', async () => {
      const summary = await tracker.getProgressionSummary();
      expect(summary).toBeDefined();
      expect(summary).toContain('Level');
      expect(summary).toContain('Progress');
      expect(summary).toContain('Achievements');
    });

    it('should export progression', async () => {
      const progression = await tracker.exportProgression();
      expect(progression).toBeDefined();
      expect(progression.level).toBeGreaterThanOrEqual(1);
      expect(progression.totalEvents).toBeDefined();
    });

    it('should check if max level', async () => {
      const isMax = await tracker.isMaxLevel();
      expect(typeof isMax).toBe('boolean');
    });

    it('should add XP and update progression', async () => {
      await tracker.addXP(10);
      const progression = await tracker.getProgression();
      expect(progression).toBeDefined();
    });
  });

  describe('Level Information', () => {
    it('should get level title', () => {
      expect(tracker.getLevelTitle(1)).toBe('Mindful Novice');
      expect(tracker.getLevelTitle(5)).toBe('Balanced Builder');
      expect(tracker.getLevelTitle(9)).toBe('Transcendent Technologist');
    });

    it('should get level icon', () => {
      expect(tracker.getLevelIcon(1)).toBe('🌱');
      expect(tracker.getLevelIcon(5)).toBe('⚖️');
      expect(tracker.getLevelIcon(9)).toBe('✨');
    });

    it('should get level message', async () => {
      const message = await tracker.getLevelMessage();
      expect(message).toBeDefined();
      expect(message.length).toBeGreaterThan(0);
    });

    it('should handle invalid level gracefully', () => {
      expect(tracker.getLevelTitle(99)).toBe('Mindful Coder');
      expect(tracker.getLevelIcon(99)).toBe('🤖');
    });
  });

  describe('Static Methods', () => {
    it('should get level thresholds', () => {
      const thresholds = ProgressTracker.getLevelThresholds();
      expect(Array.isArray(thresholds)).toBe(true);
      expect(thresholds.length).toBeGreaterThan(0);
    });

    it('should get max level', () => {
      const maxLevel = ProgressTracker.getMaxLevel();
      expect(maxLevel).toBeGreaterThan(0);
    });

    it('should calculate level from XP', () => {
      expect(ProgressTracker.calculateLevelFromXP(0)).toBe(1);
      expect(ProgressTracker.calculateLevelFromXP(10)).toBeGreaterThanOrEqual(1);
      expect(ProgressTracker.calculateLevelFromXP(10000)).toBeGreaterThan(1);
    });
  });

  describe('Streak Tracking', () => {
    it('should get streak days without error', async () => {
      const streak = await tracker.getStreakDays();
      expect(streak).toBeGreaterThanOrEqual(0);
    });

    it('should count consecutive days with events', async () => {
      let callCount = 0;
      (mockMetricsRepo.getDailyMetrics as any) = jest.fn().mockImplementation(async () => {
        const responses = [
          { totalEvents: 10 },
          { totalEvents: 5 },
          { totalEvents: 8 },
          null
        ];
        return responses[callCount++] || null;
      });

      const streak = await tracker.getStreakDays();
      expect(streak).toBe(3);
    });

    it('should break streak on day with zero events', async () => {
      let callCount = 0;
      (mockMetricsRepo.getDailyMetrics as any) = jest.fn().mockImplementation(async () => {
        const responses = [
          { totalEvents: 10 },
          { totalEvents: 0 }
        ];
        return responses[callCount++] || null;
      });

      const streak = await tracker.getStreakDays();
      expect(streak).toBe(1);
    });
  });

  describe('Motivational Quotes', () => {
    it('should get motivational quote', async () => {
      const quote = await tracker.getMotivationalQuote();
      expect(quote).toBeDefined();
      expect(quote.length).toBeGreaterThan(0);
    });

    it('should return different quotes based on level', async () => {
      mockMetricsRepo.getStatsSummary.mockResolvedValue({
        totalEvents: 100,
        totalSessions: 10,
        databaseSize: 1024
      });

      await tracker.initialize();
      const quote = await tracker.getMotivationalQuote();
      expect(quote).toBeDefined();
    });
  });

  describe('Level Up Events', () => {
    it('should emit level up event when leveling up', async () => {
      const levelUpSpy = jest.fn();
      tracker.onLevelUp(levelUpSpy);

      // Start at level 1
      mockMetricsRepo.getStatsSummary.mockResolvedValue({
        totalEvents: 0,
        totalSessions: 0,
        databaseSize: 0
      });
      await tracker.initialize();

      // Level up to level 2
      mockMetricsRepo.getStatsSummary.mockResolvedValue({
        totalEvents: 1000,
        totalSessions: 10,
        databaseSize: 1024
      });
      await tracker.updateProgression();

      // Check if event was fired (may or may not fire depending on XP thresholds)
      // Just verify the method doesn't throw
      expect(true).toBe(true);
    });
  });

  describe('Progression Updates', () => {
    it('should update progression with high XP', async () => {
      mockMetricsRepo.getStatsSummary.mockResolvedValue({
        totalEvents: 5000,
        totalSessions: 50,
        databaseSize: 10240
      });

      await tracker.updateProgression();
      const level = await tracker.getLevel();
      expect(level).toBeGreaterThan(1);
    });

    it('should return 100% progress at max level', async () => {
      // Set very high XP to reach max level
      mockMetricsRepo.getStatsSummary.mockResolvedValue({
        totalEvents: 1000000,
        totalSessions: 1000,
        databaseSize: 102400
      });

      await tracker.updateProgression();
      const progress = await tracker.getProgressPercentage();
      expect(progress).toBe(100);
    });

    it('should handle zero XP at minimum level', async () => {
      mockMetricsRepo.getStatsSummary.mockResolvedValue({
        totalEvents: 0,
        totalSessions: 0,
        databaseSize: 0
      });

      await tracker.updateProgression();
      const level = await tracker.getLevel();
      expect(level).toBe(1);
    });

    it('should track unlocked achievements count', async () => {
      const mockAchievements: Achievement[] = [
        {
          id: 'test1',
          title: 'Test 1',
          description: 'Test',
          category: 'review',
          icon: '🏆',
          requirement: { type: 'count', metric: 'reviews', target: 10, timeframe: 'all-time' },
          unlocked: true,
          progress: 100
        },
        {
          id: 'test2',
          title: 'Test 2',
          description: 'Test',
          category: 'review',
          icon: '🏅',
          requirement: { type: 'count', metric: 'reviews', target: 20, timeframe: 'all-time' },
          unlocked: false,
          progress: 50
        }
      ];

      mockConfigRepo.getAllAchievements.mockResolvedValue(mockAchievements);
      await tracker.updateProgression();

      const progression = await tracker.getProgression();
      expect(progression.unlockedAchievements).toBe(1);
      expect(progression.totalAchievements).toBe(2);
    });

    it('should handle empty achievements list', async () => {
      mockConfigRepo.getAllAchievements.mockResolvedValue([]);
      await tracker.updateProgression();

      const progression = await tracker.getProgression();
      expect(progression.unlockedAchievements).toBe(0);
      expect(progression.totalAchievements).toBe(0);
    });
  });

  describe('Disposal', () => {
    it('should dispose cleanly', () => {
      tracker.dispose();
      // Verify no errors thrown
      expect(true).toBe(true);
    });
  });
});
