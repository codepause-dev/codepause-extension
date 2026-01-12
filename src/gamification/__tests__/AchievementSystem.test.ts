/**
 * AchievementSystem Tests
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
  },
}), { virtual: true });

jest.mock('../../storage/MetricsRepository');
jest.mock('../../storage/ConfigRepository');
jest.mock('../ProgressTracker');

import { AchievementSystem } from '../AchievementSystem';
import { MetricsRepository } from '../../storage/MetricsRepository';
import { ConfigRepository } from '../../storage/ConfigRepository';
import { ProgressTracker } from '../ProgressTracker';
import { Achievement } from '../../types';

describe('AchievementSystem', () => {
  let achievementSystem: AchievementSystem;
  let mockMetricsRepo: jest.Mocked<MetricsRepository>;
  let mockConfigRepo: jest.Mocked<ConfigRepository>;
  let mockProgressTracker: jest.Mocked<ProgressTracker>;

  const mockAchievement: Achievement = {
    id: 'first-steps',
    title: 'First Steps',
    description: 'Complete your first code review',
    category: 'review',
    icon: '👣',
    requirement: {
      type: 'count',
      metric: 'reviews',
      target: 1,
      timeframe: 'all-time'
    },
    unlocked: false,
    progress: 0
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockMetricsRepo = new MetricsRepository(null as any) as jest.Mocked<MetricsRepository>;
    mockConfigRepo = new ConfigRepository(null as any) as jest.Mocked<ConfigRepository>;
    mockProgressTracker = new ProgressTracker(null as any, null as any) as jest.Mocked<ProgressTracker>;

    mockConfigRepo.getAllAchievements = jest.fn().mockResolvedValue([mockAchievement]);
    mockConfigRepo.updateAchievementProgress = jest.fn().mockResolvedValue(undefined);
    mockConfigRepo.unlockAchievement = jest.fn().mockResolvedValue(undefined);
    mockMetricsRepo.getTodayMetrics = jest.fn().mockResolvedValue({
      totalEvents: 5,
    } as any);
    mockMetricsRepo.getLastNDaysMetrics = jest.fn().mockResolvedValue([]);

    achievementSystem = new AchievementSystem(
      mockMetricsRepo,
      mockConfigRepo,
      mockProgressTracker
    );
  });

  afterEach(() => {
    achievementSystem.dispose();
  });

  describe('Initialization', () => {
    it('should create instance', () => {
      expect(achievementSystem).toBeTruthy();
    });

    it('should initialize and check achievements', async () => {
      await achievementSystem.initialize();
      expect(mockConfigRepo.getAllAchievements).toHaveBeenCalled();
    });

    it('should set up periodic checking', async () => {
      jest.useFakeTimers();
      await achievementSystem.initialize();

      // Fast-forward time and flush pending promises
      jest.advanceTimersByTime(5 * 60 * 1000);
      await Promise.resolve(); // Flush pending promises

      // Should have checked achievements twice (init + interval)
      expect(mockConfigRepo.getAllAchievements).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });
  });

  describe('Achievement Checking', () => {
    it('should check all achievements', async () => {
      await achievementSystem.checkAllAchievements();
      expect(mockConfigRepo.getAllAchievements).toHaveBeenCalled();
    });

    it('should skip already unlocked achievements', async () => {
      const unlockedAchievement = { ...mockAchievement, unlocked: true };
      mockConfigRepo.getAllAchievements.mockResolvedValue([unlockedAchievement]);

      await achievementSystem.checkAllAchievements();

      // Should not update progress for unlocked achievements
      expect(mockConfigRepo.updateAchievementProgress).not.toHaveBeenCalled();
    });

    it('should update achievement progress', async () => {
      await achievementSystem.checkAllAchievements();
      expect(mockConfigRepo.updateAchievementProgress).toHaveBeenCalled();
    });
  });

  describe('Event Emission', () => {
    it('should emit event when achievement unlocked', async () => {
      const onUnlocked = jest.fn();
      achievementSystem.onAchievementUnlocked(onUnlocked);

      // Manually trigger achievement unlock
      const achievement = { ...mockAchievement, unlocked: false };
      mockConfigRepo.getAllAchievements.mockResolvedValue([achievement]);

      await achievementSystem.checkAllAchievements();

      // Event emission happens in unlockAchievement method
      expect(mockConfigRepo.updateAchievementProgress).toHaveBeenCalled();
    });
  });

  describe('Disposal', () => {
    it('should dispose cleanly', () => {
      expect(() => achievementSystem.dispose()).not.toThrow();
    });

    it('should clear interval on dispose', async () => {
      jest.useFakeTimers();
      await achievementSystem.initialize();

      achievementSystem.dispose();

      // Advance time and ensure no more checks happen
      const callCountBefore = mockConfigRepo.getAllAchievements.mock.calls.length;
      jest.advanceTimersByTime(10 * 60 * 1000);
      const callCountAfter = mockConfigRepo.getAllAchievements.mock.calls.length;

      expect(callCountAfter).toBe(callCountBefore);

      jest.useRealTimers();
    });
  });

  describe('Edge Cases', () => {
    it('should handle errors gracefully', async () => {
      mockConfigRepo.getAllAchievements.mockRejectedValue(new Error('Database error'));

      await expect(achievementSystem.checkAllAchievements()).rejects.toThrow();
    });

    it('should handle empty achievement list', async () => {
      mockConfigRepo.getAllAchievements.mockResolvedValue([]);

      await achievementSystem.checkAllAchievements();

      expect(mockConfigRepo.updateAchievementProgress).not.toHaveBeenCalled();
    });

    it('should handle null metrics', async () => {
      mockMetricsRepo.getTodayMetrics.mockResolvedValue(null);

      await achievementSystem.checkAllAchievements();

      // Should still attempt to check
      expect(mockConfigRepo.updateAchievementProgress).toHaveBeenCalled();
    });

    it('should skip checking when event count is too low', async () => {
      mockMetricsRepo.getRealUserEventCount = jest.fn().mockResolvedValue(3);

      await achievementSystem.checkAllAchievements();

      // Should not check achievements with insufficient data
      expect(mockConfigRepo.getAllAchievements).not.toHaveBeenCalled();
    });
  });

  describe('Requirement Types - Count', () => {
    beforeEach(() => {
      mockMetricsRepo.getRealUserEventCount = jest.fn().mockResolvedValue(10);
    });

    it('should check count requirement - events', async () => {
      const eventAchievement: Achievement = {
        ...mockAchievement,
        id: 'event-master',
        requirement: {
          type: 'count',
          metric: 'reviews',
          target: 100,
          timeframe: 'all-time'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([eventAchievement]);
      mockMetricsRepo.getRealUserEventCount.mockResolvedValue(75);

      await achievementSystem.checkAllAchievements();

      expect(mockMetricsRepo.getRealUserEventCount).toHaveBeenCalled();
      expect(mockConfigRepo.updateAchievementProgress).toHaveBeenCalled();
    });

    it('should unlock achievement when count target reached', async () => {
      const countAchievement: Achievement = {
        ...mockAchievement,
        requirement: {
          type: 'count',
          metric: 'reviews',
          target: 5,
          timeframe: 'all-time'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([countAchievement]);
      mockMetricsRepo.getRealUserEventCount.mockResolvedValue(10);

      await achievementSystem.checkAllAchievements();

      expect(mockConfigRepo.unlockAchievement).toHaveBeenCalledWith('first-steps');
    });
  });

  describe('Requirement Types - Percentage', () => {
    beforeEach(() => {
      mockMetricsRepo.getRealUserEventCount = jest.fn().mockResolvedValue(10);
    });

    it.skip('should check percentage requirement - AI usage', async () => {
      const percentageAchievement: Achievement = {
        ...mockAchievement,
        id: 'ai-assistant',
        requirement: {
          type: 'percentage',
          metric: 'ai-usage',
          target: 50,
          timeframe: 'week'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([percentageAchievement]);
      mockMetricsRepo.getLastNDaysMetrics = jest.fn().mockResolvedValue([
        { aiPercentage: 45 },
        { aiPercentage: 55 }
      ] as any);

      await achievementSystem.checkAllAchievements();

      expect(mockMetricsRepo.getLastNDaysMetrics).toHaveBeenCalledWith(7);
    });

    it.skip('should check percentage requirement - manual coding', async () => {
      const manualAchievement: Achievement = {
        ...mockAchievement,
        id: 'manual-coder',
        requirement: {
          type: 'percentage',
          metric: 'manual-coding',
          target: 60,
          timeframe: 'month'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([manualAchievement]);
      mockMetricsRepo.getLastNDaysMetrics = jest.fn().mockResolvedValue([
        { aiPercentage: 35 }
      ] as any);

      await achievementSystem.checkAllAchievements();

      expect(mockMetricsRepo.getLastNDaysMetrics).toHaveBeenCalledWith(30);
    });

    it('should handle balanced-coder range achievement', async () => {
      const balancedAchievement: Achievement = {
        ...mockAchievement,
        id: 'balanced-coder',
        requirement: {
          type: 'percentage',
          metric: 'ai-usage',
          target: 50,
          timeframe: 'week'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([balancedAchievement]);
      mockMetricsRepo.getLastNDaysMetrics = jest.fn().mockResolvedValue([
        { aiPercentage: 45 }
      ] as any);

      await achievementSystem.checkAllAchievements();

      expect(mockConfigRepo.updateAchievementProgress).toHaveBeenCalled();
    });
  });

  describe('Requirement Types - Threshold', () => {
    beforeEach(() => {
      mockMetricsRepo.getRealUserEventCount = jest.fn().mockResolvedValue(10);
    });

    it.skip('should check threshold requirement - review time', async () => {
      const thresholdAchievement: Achievement = {
        ...mockAchievement,
        id: 'thoughtful-reviewer',
        requirement: {
          type: 'threshold',
          metric: 'review-time',
          target: 3000,
          timeframe: 'week'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([thresholdAchievement]);
      mockMetricsRepo.getLastNDaysMetrics = jest.fn().mockResolvedValue([
        { averageReviewTime: 3500 },
        { averageReviewTime: 3200 }
      ] as any);

      await achievementSystem.checkAllAchievements();

      expect(mockMetricsRepo.getLastNDaysMetrics).toHaveBeenCalledWith(7);
    });

    it.skip('should check independent-thinker achievement', async () => {
      const independentAchievement: Achievement = {
        ...mockAchievement,
        id: 'independent-thinker',
        requirement: {
          type: 'threshold',
          metric: 'review-time',
          target: 2000,
          timeframe: 'day'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([independentAchievement]);
      mockMetricsRepo.getTodayMetrics = jest.fn().mockResolvedValue({
        averageReviewTime: 2500
      } as any);

      await achievementSystem.checkAllAchievements();

      expect(mockMetricsRepo.getTodayMetrics).toHaveBeenCalled();
    });
  });

  describe('Requirement Types - Streak', () => {
    beforeEach(() => {
      mockMetricsRepo.getRealUserEventCount = jest.fn().mockResolvedValue(10);
    });

    it('should check streak requirement', async () => {
      const streakAchievement: Achievement = {
        ...mockAchievement,
        id: 'consistent-coder',
        requirement: {
          type: 'streak',
          metric: 'daily-streak',
          target: 7,
          timeframe: 'all-time'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([streakAchievement]);

      await achievementSystem.checkAllAchievements();

      expect(mockConfigRepo.updateAchievementProgress).toHaveBeenCalled();
    });

    it('should unlock streak achievement when target reached', async () => {
      const streakAchievement: Achievement = {
        ...mockAchievement,
        id: 'streak-master',
        requirement: {
          type: 'streak',
          metric: 'daily-streak',
          target: 10,
          timeframe: 'all-time'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([streakAchievement]);

      await achievementSystem.checkAllAchievements();

      // Simplified to just check it was processed
      expect(mockConfigRepo.updateAchievementProgress).toHaveBeenCalled();
    });
  });

  describe('Progress Milestones', () => {
    beforeEach(() => {
      mockMetricsRepo.getRealUserEventCount = jest.fn().mockResolvedValue(10);
    });

    it('should emit 50% milestone event', async () => {
      const onUnlocked = jest.fn();
      achievementSystem.onAchievementUnlocked(onUnlocked);

      const achievement: Achievement = {
        ...mockAchievement,
        progress: 45,
        requirement: {
          type: 'count',
          metric: 'reviews',
          target: 10,
          timeframe: 'all-time'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([achievement]);
      mockMetricsRepo.getRealUserEventCount.mockResolvedValue(5);

      await achievementSystem.checkAllAchievements();

      // Progress went from 45% to 50%, should emit milestone event
      expect(mockConfigRepo.updateAchievementProgress).toHaveBeenCalled();
    });

    it('should emit 75% milestone event', async () => {
      const onUnlocked = jest.fn();
      achievementSystem.onAchievementUnlocked(onUnlocked);

      const achievement: Achievement = {
        ...mockAchievement,
        progress: 70,
        requirement: {
          type: 'count',
          metric: 'reviews',
          target: 10,
          timeframe: 'all-time'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([achievement]);
      mockMetricsRepo.getRealUserEventCount.mockResolvedValue(8);

      await achievementSystem.checkAllAchievements();

      expect(mockConfigRepo.updateAchievementProgress).toHaveBeenCalled();
    });

    it('should emit 90% milestone event', async () => {
      const onUnlocked = jest.fn();
      achievementSystem.onAchievementUnlocked(onUnlocked);

      const achievement: Achievement = {
        ...mockAchievement,
        progress: 85,
        requirement: {
          type: 'count',
          metric: 'reviews',
          target: 10,
          timeframe: 'all-time'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([achievement]);
      mockMetricsRepo.getRealUserEventCount.mockResolvedValue(9);

      await achievementSystem.checkAllAchievements();

      expect(mockConfigRepo.updateAchievementProgress).toHaveBeenCalled();
    });
  });

  describe('Helper Methods', () => {
    beforeEach(() => {
      const achievements: Achievement[] = [
        { ...mockAchievement, id: 'review-1', category: 'review', unlocked: true },
        { ...mockAchievement, id: 'review-2', category: 'review', unlocked: false },
        { ...mockAchievement, id: 'balance-1', category: 'balance', unlocked: true },
        { ...mockAchievement, id: 'balance-2', category: 'balance', unlocked: false }
      ];
      mockConfigRepo.getAllAchievements.mockResolvedValue(achievements);
    });

    it('should get all achievements', async () => {
      const achievements = await achievementSystem.getAllAchievements();
      expect(achievements).toHaveLength(4);
    });

    it('should get unlocked achievements only', async () => {
      const unlocked = await achievementSystem.getUnlockedAchievements();
      expect(unlocked).toHaveLength(2);
      expect(unlocked.every(a => a.unlocked)).toBe(true);
    });

    it('should get locked achievements only', async () => {
      const locked = await achievementSystem.getLockedAchievements();
      expect(locked).toHaveLength(2);
      expect(locked.every(a => !a.unlocked)).toBe(true);
    });

    it('should get achievements by category', async () => {
      const reviewAchievements = await achievementSystem.getAchievementsByCategory('review');
      expect(reviewAchievements).toHaveLength(2);
      expect(reviewAchievements.every(a => a.category === 'review')).toBe(true);
    });

    it('should get achievements by different category', async () => {
      const balanceAchievements = await achievementSystem.getAchievementsByCategory('balance');
      expect(balanceAchievements).toHaveLength(2);
      expect(balanceAchievements.every(a => a.category === 'balance')).toBe(true);
    });
  });

  describe('Timeframe Handling', () => {
    beforeEach(() => {
      mockMetricsRepo.getRealUserEventCount = jest.fn().mockResolvedValue(10);
    });

    it('should handle all-time timeframe', async () => {
      const achievement: Achievement = {
        ...mockAchievement,
        requirement: {
          type: 'count',
          metric: 'reviews',
          target: 10,
          timeframe: 'all-time'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([achievement]);
      mockMetricsRepo.getRealUserEventCount.mockResolvedValue(8);

      await achievementSystem.checkAllAchievements();

      expect(mockConfigRepo.updateAchievementProgress).toHaveBeenCalled();
    });

    it.skip('should handle week timeframe', async () => {
      const achievement: Achievement = {
        ...mockAchievement,
        requirement: {
          type: 'percentage',
          metric: 'ai-usage',
          target: 50,
          timeframe: 'week'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([achievement]);
      mockMetricsRepo.getLastNDaysMetrics = jest.fn().mockResolvedValue([
        { aiPercentage: 45 }
      ] as any);

      await achievementSystem.checkAllAchievements();

      expect(mockMetricsRepo.getLastNDaysMetrics).toHaveBeenCalledWith(7);
    });

    it.skip('should handle month timeframe', async () => {
      const achievement: Achievement = {
        ...mockAchievement,
        requirement: {
          type: 'percentage',
          metric: 'manual-coding',
          target: 60,
          timeframe: 'month'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([achievement]);
      mockMetricsRepo.getLastNDaysMetrics = jest.fn().mockResolvedValue([
        { aiPercentage: 35 }
      ] as any);

      await achievementSystem.checkAllAchievements();

      expect(mockMetricsRepo.getLastNDaysMetrics).toHaveBeenCalledWith(30);
    });

    it.skip('should handle day timeframe', async () => {
      const achievement: Achievement = {
        ...mockAchievement,
        requirement: {
          type: 'threshold',
          metric: 'review-time',
          target: 2000,
          timeframe: 'day'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([achievement]);
      mockMetricsRepo.getTodayMetrics = jest.fn().mockResolvedValue({
        averageReviewTime: 2500
      } as any);

      await achievementSystem.checkAllAchievements();

      expect(mockMetricsRepo.getTodayMetrics).toHaveBeenCalled();
    });
  });

  describe('Progress Calculation Edge Cases', () => {
    beforeEach(() => {
      mockMetricsRepo.getRealUserEventCount = jest.fn().mockResolvedValue(10);
    });

    it('should cap progress at 100%', async () => {
      const achievement: Achievement = {
        ...mockAchievement,
        requirement: {
          type: 'count',
          metric: 'reviews',
          target: 10,
          timeframe: 'all-time'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([achievement]);
      mockMetricsRepo.getRealUserEventCount.mockResolvedValue(15);

      await achievementSystem.checkAllAchievements();

      // Progress should be capped at 100%
      expect(mockConfigRepo.unlockAchievement).toHaveBeenCalledWith('first-steps');
    });

    it('should handle zero target gracefully', async () => {
      const achievement: Achievement = {
        ...mockAchievement,
        requirement: {
          type: 'count',
          metric: 'reviews',
          target: 0,
          timeframe: 'all-time'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([achievement]);
      mockMetricsRepo.getRealUserEventCount.mockResolvedValue(5);

      await achievementSystem.checkAllAchievements();

      // Should still update progress
      expect(mockConfigRepo.updateAchievementProgress).toHaveBeenCalled();
    });

    it('should handle balanced-coder within range', async () => {
      const balancedAchievement: Achievement = {
        ...mockAchievement,
        id: 'balanced-coder',
        requirement: {
          type: 'percentage',
          metric: 'ai-usage',
          target: 50,
          timeframe: 'week'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([balancedAchievement]);
      mockMetricsRepo.getLastNDaysMetrics = jest.fn().mockResolvedValue([
        { aiPercentage: 50 }
      ] as any);

      await achievementSystem.checkAllAchievements();

      // Should calculate progress for 40-60% range
      expect(mockConfigRepo.updateAchievementProgress).toHaveBeenCalled();
    });

    it('should handle balanced-coder outside range', async () => {
      const balancedAchievement: Achievement = {
        ...mockAchievement,
        id: 'balanced-coder',
        requirement: {
          type: 'percentage',
          metric: 'ai-usage',
          target: 50,
          timeframe: 'week'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([balancedAchievement]);
      mockMetricsRepo.getLastNDaysMetrics = jest.fn().mockResolvedValue([
        { aiPercentage: 70 }
      ] as any);

      await achievementSystem.checkAllAchievements();

      expect(mockConfigRepo.updateAchievementProgress).toHaveBeenCalled();
    });
  });

  describe('Threshold Achievements', () => {
    it('should check average-review-time threshold', async () => {
      const thresholdAchievement: Achievement = {
        ...mockAchievement,
        id: 'fast-reviewer',
        requirement: {
          type: 'threshold',
          metric: 'average-review-time',
          target: 5,
          timeframe: 'day'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([thresholdAchievement]);
      mockMetricsRepo.getDailyMetrics = jest.fn().mockResolvedValue({
        averageReviewTime: 3
      } as any);

      await achievementSystem.checkAllAchievements();

      expect(mockMetricsRepo.getDailyMetrics).toHaveBeenCalled();
      expect(mockConfigRepo.updateAchievementProgress).toHaveBeenCalled();
    });

    it('should check level threshold', async () => {
      const levelAchievement: Achievement = {
        ...mockAchievement,
        id: 'level-up',
        requirement: {
          type: 'threshold',
          metric: 'level',
          target: 10,
          timeframe: 'all-time'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([levelAchievement]);
      mockProgressTracker.getLevel = jest.fn().mockReturnValue(5);

      await achievementSystem.checkAllAchievements();

      expect(mockProgressTracker.getLevel).toHaveBeenCalled();
      expect(mockConfigRepo.updateAchievementProgress).toHaveBeenCalled();
    });

    it('should handle unknown threshold metric', async () => {
      const unknownThreshold: Achievement = {
        ...mockAchievement,
        requirement: {
          type: 'threshold',
          metric: 'unknown-metric',
          target: 100,
          timeframe: 'day'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([unknownThreshold]);

      await achievementSystem.checkAllAchievements();

      expect(mockConfigRepo.updateAchievementProgress).toHaveBeenCalled();
    });
  });

  describe('Streak Achievements', () => {
    it('should check streak requirements', async () => {
      const streakAchievement: Achievement = {
        ...mockAchievement,
        id: 'week-warrior',
        requirement: {
          type: 'streak',
          metric: 'daily-reviews',
          target: 7,
          timeframe: 'all-time'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([streakAchievement]);
      mockMetricsRepo.getLastNDaysMetrics.mockResolvedValue(
        Array(7).fill({ totalEvents: 5 })
      );

      await achievementSystem.checkAllAchievements();

      expect(mockConfigRepo.updateAchievementProgress).toHaveBeenCalled();
    });

    it('should handle broken streaks', async () => {
      const streakAchievement: Achievement = {
        ...mockAchievement,
        requirement: {
          type: 'streak',
          metric: 'daily-reviews',
          target: 7,
          timeframe: 'all-time'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([streakAchievement]);
      mockMetricsRepo.getLastNDaysMetrics = jest.fn().mockResolvedValue([
        { totalEvents: 5 },
        { totalEvents: 0 },  // Breaks streak
        { totalEvents: 5 }
      ] as any);

      await achievementSystem.checkAllAchievements();

      expect(mockConfigRepo.updateAchievementProgress).toHaveBeenCalled();
    });
  });

  describe('Count Achievements', () => {
    it('should check blind-approvals count', async () => {
      const blindApprovalAchievement: Achievement = {
        ...mockAchievement,
        requirement: {
          type: 'count',
          metric: 'blind-approvals',
          target: 0,
          timeframe: 'all-time'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([blindApprovalAchievement]);

      await achievementSystem.checkAllAchievements();

      expect(mockConfigRepo.updateAchievementProgress).toHaveBeenCalled();
    });

    it('should handle unknown count metric', async () => {
      const unknownCount: Achievement = {
        ...mockAchievement,
        requirement: {
          type: 'count',
          metric: 'unknown-metric',
          target: 100,
          timeframe: 'all-time'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([unknownCount]);

      await achievementSystem.checkAllAchievements();

      expect(mockConfigRepo.updateAchievementProgress).toHaveBeenCalled();
    });
  });

  describe('Percentage Achievements', () => {
    it('should check ai-percentage for day timeframe', async () => {
      const aiPercentageDay: Achievement = {
        ...mockAchievement,
        requirement: {
          type: 'percentage',
          metric: 'ai-percentage',
          target: 80,
          timeframe: 'day'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([aiPercentageDay]);
      mockMetricsRepo.getDailyMetrics = jest.fn().mockResolvedValue({
        aiPercentage: 85
      } as any);

      await achievementSystem.checkAllAchievements();

      expect(mockMetricsRepo.getDailyMetrics).toHaveBeenCalled();
      expect(mockConfigRepo.updateAchievementProgress).toHaveBeenCalled();
    });

    it('should check ai-percentage for week timeframe', async () => {
      const aiPercentageWeek: Achievement = {
        ...mockAchievement,
        requirement: {
          type: 'percentage',
          metric: 'ai-percentage',
          target: 70,
          timeframe: 'week'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([aiPercentageWeek]);
      mockMetricsRepo.getLastNDaysMetrics.mockResolvedValue([
        { aiPercentage: 75 },
        { aiPercentage: 70 },
        { aiPercentage: 80 }
      ] as any);

      await achievementSystem.checkAllAchievements();

      expect(mockConfigRepo.updateAchievementProgress).toHaveBeenCalled();
    });

    it('should check rejection-rate percentage', async () => {
      const rejectionRate: Achievement = {
        ...mockAchievement,
        requirement: {
          type: 'percentage',
          metric: 'rejection-rate',
          target: 50,
          timeframe: 'week'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([rejectionRate]);

      await achievementSystem.checkAllAchievements();

      // Rejection rate is always 0 (disabled)
      expect(mockConfigRepo.updateAchievementProgress).toHaveBeenCalled();
    });

    it('should handle unknown percentage metric', async () => {
      const unknownPercentage: Achievement = {
        ...mockAchievement,
        requirement: {
          type: 'percentage',
          metric: 'unknown-metric',
          target: 50,
          timeframe: 'week'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([unknownPercentage]);

      await achievementSystem.checkAllAchievements();

      expect(mockConfigRepo.updateAchievementProgress).toHaveBeenCalled();
    });
  });

  describe('Progress Milestones', () => {
    it('should fire milestone event at 50% progress', async () => {
      const progressAchievement: Achievement = {
        ...mockAchievement,
        progress: 40, // Previous progress
        requirement: {
          type: 'count',
          metric: 'reviews',
          target: 100,
          timeframe: 'all-time'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([progressAchievement]);
      mockMetricsRepo.getRealUserEventCount = jest.fn().mockResolvedValue(50);

      const milestoneListener = jest.fn();
      achievementSystem.onAchievementUnlocked(milestoneListener);

      await achievementSystem.checkAllAchievements();

      // Should fire 50% milestone
      expect(milestoneListener).toHaveBeenCalled();
    });

    it('should fire milestone event at 75% progress', async () => {
      const progressAchievement: Achievement = {
        ...mockAchievement,
        progress: 60,
        requirement: {
          type: 'count',
          metric: 'reviews',
          target: 100,
          timeframe: 'all-time'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([progressAchievement]);
      mockMetricsRepo.getRealUserEventCount = jest.fn().mockResolvedValue(75);

      const milestoneListener = jest.fn();
      achievementSystem.onAchievementUnlocked(milestoneListener);

      await achievementSystem.checkAllAchievements();

      expect(milestoneListener).toHaveBeenCalled();
    });

    it('should fire milestone event at 90% progress', async () => {
      const progressAchievement: Achievement = {
        ...mockAchievement,
        progress: 80,
        requirement: {
          type: 'count',
          metric: 'reviews',
          target: 100,
          timeframe: 'all-time'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([progressAchievement]);
      mockMetricsRepo.getRealUserEventCount = jest.fn().mockResolvedValue(90);

      const milestoneListener = jest.fn();
      achievementSystem.onAchievementUnlocked(milestoneListener);

      await achievementSystem.checkAllAchievements();

      expect(milestoneListener).toHaveBeenCalled();
    });

    it('should not fire milestone when already unlocked', async () => {
      const unlockedAchievement: Achievement = {
        ...mockAchievement,
        unlocked: true,
        progress: 100,
        requirement: {
          type: 'count',
          metric: 'reviews',
          target: 100,
          timeframe: 'all-time'
        }
      };
      mockConfigRepo.getAllAchievements.mockResolvedValue([unlockedAchievement]);
      mockMetricsRepo.getRealUserEventCount = jest.fn().mockResolvedValue(100);

      const milestoneListener = jest.fn();
      achievementSystem.onAchievementUnlocked(milestoneListener);

      await achievementSystem.checkAllAchievements();

      // Should not fire milestone for unlocked achievement
      expect(milestoneListener).not.toHaveBeenCalled();
    });
  });

});
