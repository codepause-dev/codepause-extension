/**
 * ThresholdManager Unit Tests
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ThresholdManager } from '../ThresholdManager';
import { DeveloperLevel, DailyMetrics } from '../../types';
import { createMockDailyMetrics } from '../../__tests__/testUtils';

describe('ThresholdManager', () => {
  let manager: ThresholdManager;

  beforeEach(() => {
    manager = new ThresholdManager(DeveloperLevel.Mid);
  });

  describe('Initialization', () => {
    it('should initialize with correct level thresholds', () => {
      const juniorManager = new ThresholdManager(DeveloperLevel.Junior);
      const midManager = new ThresholdManager(DeveloperLevel.Mid);
      const seniorManager = new ThresholdManager(DeveloperLevel.Senior);

      expect(juniorManager.getBlindApprovalTime()).toBe(5000);
      expect(midManager.getBlindApprovalTime()).toBe(3000);
      expect(seniorManager.getBlindApprovalTime()).toBe(2000);
    });

    it('should provide immutable config copy', () => {
      const config1 = manager.getConfig();
      const config2 = manager.getConfig();

      expect(config1).not.toBe(config2); // Different objects
      expect(config1).toEqual(config2); // Same values
    });
  });

  describe('Level Management', () => {
    it('should update thresholds when level changes', () => {
      manager.setLevel(DeveloperLevel.Junior);
      expect(manager.getBlindApprovalTime()).toBe(5000);

      manager.setLevel(DeveloperLevel.Senior);
      expect(manager.getBlindApprovalTime()).toBe(2000);
    });

    it('should reset custom settings when changing level', () => {
      manager.setBlindApprovalTime(5000);
      expect(manager.getBlindApprovalTime()).toBe(5000);

      manager.setLevel(DeveloperLevel.Senior);
      expect(manager.getBlindApprovalTime()).toBe(2000); // Reset to senior default
    });
  });

  describe('Threshold Getters', () => {
    it('should get blind approval time threshold', () => {
      expect(manager.getBlindApprovalTime()).toBe(3000); // Mid level default
    });

    it('should get max AI percentage threshold', () => {
      expect(manager.getMaxAIPercentage()).toBe(60);
    });

    it('should get minimum review time threshold', () => {
      expect(manager.getMinReviewTime()).toBe(3000); // Mid level default
    });

    it('should get streak threshold', () => {
      expect(manager.getStreakThreshold()).toBe(4); // Mid level default
    });
  });

  describe('Custom Threshold Setters', () => {
    it('should set custom blind approval time within bounds', () => {
      manager.setBlindApprovalTime(2500);
      expect(manager.getBlindApprovalTime()).toBe(2500);
    });

    it('should clamp blind approval time to minimum', () => {
      manager.setBlindApprovalTime(100);
      expect(manager.getBlindApprovalTime()).toBe(500); // Min is 500
    });

    it('should clamp blind approval time to maximum', () => {
      manager.setBlindApprovalTime(20000);
      expect(manager.getBlindApprovalTime()).toBe(10000); // Max is 10000
    });

    it('should set custom max AI percentage within bounds', () => {
      manager.setMaxAIPercentage(75);
      expect(manager.getMaxAIPercentage()).toBe(75);
    });

    it('should clamp AI percentage to minimum', () => {
      manager.setMaxAIPercentage(10);
      expect(manager.getMaxAIPercentage()).toBe(20); // Min is 20
    });

    it('should clamp AI percentage to maximum', () => {
      manager.setMaxAIPercentage(150);
      expect(manager.getMaxAIPercentage()).toBe(100); // Max is 100
    });

    it('should set custom minimum review time within bounds', () => {
      manager.setMinReviewTime(1500);
      expect(manager.getMinReviewTime()).toBe(1500);
    });

    it('should set custom streak threshold within bounds', () => {
      manager.setStreakThreshold(5);
      expect(manager.getStreakThreshold()).toBe(5);
    });

    it('should clamp streak threshold to minimum', () => {
      manager.setStreakThreshold(1);
      expect(manager.getStreakThreshold()).toBe(2); // Min is 2
    });

    it('should clamp streak threshold to maximum', () => {
      manager.setStreakThreshold(20);
      expect(manager.getStreakThreshold()).toBe(10); // Max is 10
    });
  });

  describe('Threshold Checks', () => {
    it('should check if AI percentage exceeds threshold', () => {
      expect(manager.isAIPercentageExceeded(65)).toBe(true);
      expect(manager.isAIPercentageExceeded(60)).toBe(false);
      expect(manager.isAIPercentageExceeded(55)).toBe(false);
    });

    it('should check if review time is below threshold', () => {
      expect(manager.isReviewTimeBelowThreshold(2500)).toBe(true); // Below 3000 (mid default)
      expect(manager.isReviewTimeBelowThreshold(3000)).toBe(false);
      expect(manager.isReviewTimeBelowThreshold(3500)).toBe(false);
    });

    it('should check metrics against all thresholds', () => {
      const metrics = createMockDailyMetrics({
        date: '2025-01-15',
        totalEvents: 100,
        totalAILines: 650,
        totalManualLines: 350,
        aiPercentage: 65, // Exceeds 60%
        averageReviewTime: 2500, // Below 3000ms (mid default)
        sessionCount: 3
      });

      const checks = manager.checkMetrics(metrics);

      expect(checks.aiPercentageExceeded).toBe(true);
      expect(checks.reviewTimeLow).toBe(true);
      expect(checks.blindApprovalsHigh).toBe(false); // Always false - blind approval tracking disabled
    });

    it('should pass all checks with good metrics', () => {
      const metrics = createMockDailyMetrics({
        date: '2025-01-15',
        totalEvents: 100,
        totalAILines: 400,
        totalManualLines: 600,
        aiPercentage: 40, // Below 60%
        averageReviewTime: 3500, // Above 3000ms (mid default)
        sessionCount: 3
      });

      const checks = manager.checkMetrics(metrics);

      expect(checks.aiPercentageExceeded).toBe(false);
      expect(checks.reviewTimeLow).toBe(false);
      expect(checks.blindApprovalsHigh).toBe(false);
    });
  });

  describe('Static Methods', () => {
    it('should get recommended thresholds for each level', () => {
      const juniorThresholds = ThresholdManager.getRecommendedThresholds(DeveloperLevel.Junior);
      const midThresholds = ThresholdManager.getRecommendedThresholds(DeveloperLevel.Mid);
      const seniorThresholds = ThresholdManager.getRecommendedThresholds(DeveloperLevel.Senior);

      expect(juniorThresholds.blindApprovalTime).toBe(5000);
      expect(midThresholds.blindApprovalTime).toBe(3000);
      expect(seniorThresholds.blindApprovalTime).toBe(2000);
    });

    it('should get all level thresholds', () => {
      const allThresholds = ThresholdManager.getAllLevelThresholds();

      expect(allThresholds[DeveloperLevel.Junior]).toBeDefined();
      expect(allThresholds[DeveloperLevel.Mid]).toBeDefined();
      expect(allThresholds[DeveloperLevel.Senior]).toBeDefined();

      expect(allThresholds[DeveloperLevel.Junior].blindApprovalTime).toBe(5000);
      expect(allThresholds[DeveloperLevel.Mid].blindApprovalTime).toBe(3000);
      expect(allThresholds[DeveloperLevel.Senior].blindApprovalTime).toBe(2000);
    });
  });

  describe('Adaptive Threshold Suggestions', () => {
    it('should suggest more lenient threshold for consistently careful reviews', () => {
      const metrics: DailyMetrics[] = [
        createMockDailyMetrics({
          date: '2025-01-10',
          totalEvents: 50,
          totalAILines: 200,
          totalManualLines: 200,
          aiPercentage: 50,
          averageReviewTime: 7000, // High review time (> minReviewTime * 2 = 6000)
          sessionCount: 2
        }),
        createMockDailyMetrics({
          date: '2025-01-11',
          totalEvents: 60,
          totalAILines: 250,
          totalManualLines: 250,
          aiPercentage: 50,
          averageReviewTime: 7500, // High review time
          sessionCount: 2
        })
      ];

      const suggestion = manager.suggestAdaptiveThreshold(metrics);

      expect(suggestion.blindApprovalTime).toBeGreaterThan(manager.getBlindApprovalTime());
      expect(suggestion.reasoning).toContain('high');
    });

    it('should keep current threshold when review patterns are not consistently high', () => {
      const metrics: DailyMetrics[] = [
        createMockDailyMetrics({
          date: '2025-01-10',
          totalEvents: 50,
          totalAILines: 300,
          totalManualLines: 100,
          aiPercentage: 75,
          averageReviewTime: 1200, // Below threshold but not consistently high
          sessionCount: 2
        }),
        createMockDailyMetrics({
          date: '2025-01-11',
          totalEvents: 60,
          totalAILines: 350,
          totalManualLines: 150,
          aiPercentage: 70,
          averageReviewTime: 1100, // Below threshold but not consistently high
          sessionCount: 2
        })
      ];

      const suggestion = manager.suggestAdaptiveThreshold(metrics);

      // Should keep current threshold since review time is not consistently high (> minReviewTime * 2)
      expect(suggestion.blindApprovalTime).toBe(manager.getBlindApprovalTime());
      expect(suggestion.reasoning).toContain('appropriate');
    });

    it('should keep current threshold when patterns are balanced', () => {
      const metrics: DailyMetrics[] = [
        createMockDailyMetrics({
          date: '2025-01-10',
          totalEvents: 50,
          totalAILines: 250,
          totalManualLines: 250,
          aiPercentage: 50,
          averageReviewTime: 2000,
          sessionCount: 2
        })
      ];

      const suggestion = manager.suggestAdaptiveThreshold(metrics);

      expect(suggestion.blindApprovalTime).toBe(manager.getBlindApprovalTime());
      expect(suggestion.reasoning).toContain('appropriate');
    });

    it('should handle empty metrics array', () => {
      const suggestion = manager.suggestAdaptiveThreshold([]);

      expect(suggestion.blindApprovalTime).toBe(manager.getBlindApprovalTime());
      expect(suggestion.reasoning).toContain('Not enough data');
    });
  });

  describe('Import/Export', () => {
    it('should export current configuration', () => {
      manager.setBlindApprovalTime(2500);
      manager.setMaxAIPercentage(70);

      const exported = manager.export();

      expect(exported.blindApprovalTime).toBe(2500);
      expect(exported.maxAIPercentage).toBe(70);
    });

    it('should import configuration', () => {
      const importedConfig = {
        level: DeveloperLevel.Mid,
        blindApprovalTime: 1800,
        minReviewTime: 900,
        maxAIPercentage: 55,
        streakThreshold: 4
      };

      manager.import(importedConfig);

      expect(manager.getBlindApprovalTime()).toBe(1800);
      expect(manager.getMinReviewTime()).toBe(900);
      expect(manager.getMaxAIPercentage()).toBe(55);
      expect(manager.getStreakThreshold()).toBe(4);
    });

    it('should create independent copies on export', () => {
      const exported1 = manager.export();
      const exported2 = manager.export();

      expect(exported1).not.toBe(exported2); // Different object references
      expect(exported1).toEqual(exported2); // Same values
    });
  });

  describe('Edge Cases', () => {
    it('should handle boundary values for AI percentage', () => {
      manager.setMaxAIPercentage(60);

      expect(manager.isAIPercentageExceeded(60.0)).toBe(false);
      expect(manager.isAIPercentageExceeded(60.01)).toBe(true);
      expect(manager.isAIPercentageExceeded(59.99)).toBe(false);
    });

    it('should handle boundary values for review time', () => {
      manager.setMinReviewTime(1000);

      expect(manager.isReviewTimeBelowThreshold(1000)).toBe(false);
      expect(manager.isReviewTimeBelowThreshold(999)).toBe(true);
      expect(manager.isReviewTimeBelowThreshold(1001)).toBe(false);
    });

    it('should maintain threshold integrity across operations', () => {
      manager.setBlindApprovalTime(2500);

      manager.setMaxAIPercentage(70);
      const config2 = manager.getConfig();

      expect(config2.blindApprovalTime).toBe(2500); // Previous setting preserved
      expect(config2.maxAIPercentage).toBe(70);
    });
  });
});
