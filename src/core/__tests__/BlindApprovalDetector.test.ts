/**
 * BlindApprovalDetector Unit Tests
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { BlindApprovalDetector } from '../BlindApprovalDetector';
import { TrackingEvent, ThresholdConfig, EventType, BlindApprovalConfidence, AITool } from '../../types';

describe('BlindApprovalDetector', () => {
  let detector: BlindApprovalDetector;
  let defaultThresholds: ThresholdConfig;

  beforeEach(() => {
    defaultThresholds = {
      level: 'mid' as any,
      blindApprovalTime: 2000, // 2 seconds
      minReviewTime: 1000,
      maxAIPercentage: 60,
      streakThreshold: 3
    };

    detector = new BlindApprovalDetector(defaultThresholds);
  });

  describe('Time-Based Detection', () => {
    it('should detect blind approval when acceptance time is below threshold', () => {
      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        acceptanceTimeDelta: 1500, // Below 2000ms threshold
        linesOfCode: 3
      };

      const detection = detector.detect(event);

      expect(detection.isBlindApproval).toBe(true);
      expect(detection.signals.timeBased).toBe(true);
      expect(detection.confidence).toBe(BlindApprovalConfidence.Low); // Only 1 signal
    });

    it('should not detect blind approval when acceptance time is above threshold', () => {
      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        acceptanceTimeDelta: 3000, // Above 2000ms threshold
        linesOfCode: 3
      };

      const detection = detector.detect(event);

      expect(detection.isBlindApproval).toBe(false);
      expect(detection.signals.timeBased).toBe(false);
    });

    it('should handle events without acceptance time delta', () => {
      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        linesOfCode: 3
      };

      const detection = detector.detect(event);

      expect(detection.isBlindApproval).toBe(false);
      expect(detection.signals.timeBased).toBe(false);
    });
  });

  describe('Pattern-Based Detection', () => {
    it('should detect pattern when 3+ rapid acceptances in recent history', () => {
      // Add 3 rapid acceptances
      for (let i = 0; i < 3; i++) {
        detector.detect({
          timestamp: Date.now() + i * 1000,
          tool: AITool.Copilot,
          eventType: EventType.SuggestionAccepted,
          acceptanceTimeDelta: 1000, // Rapid
          linesOfCode: 2
        });
      }

      // The 4th acceptance should trigger pattern detection
      const detection = detector.detect({
        timestamp: Date.now() + 3000,
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        acceptanceTimeDelta: 1500,
        linesOfCode: 2
      });

      expect(detection.signals.patternBased).toBe(true);
    });

    it('should not detect pattern with fewer than 3 acceptances', () => {
      // Add only 2 acceptances
      detector.detect({
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        acceptanceTimeDelta: 1000,
        linesOfCode: 2
      });

      const detection = detector.detect({
        timestamp: Date.now() + 1000,
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        acceptanceTimeDelta: 1000,
        linesOfCode: 2
      });

      expect(detection.signals.patternBased).toBe(false);
    });

    it('should not detect pattern when acceptances are not rapid', () => {
      // Add 5 slow acceptances
      for (let i = 0; i < 5; i++) {
        detector.detect({
          timestamp: Date.now() + i * 1000,
          tool: AITool.Copilot,
          eventType: EventType.SuggestionAccepted,
          acceptanceTimeDelta: 4000, // Slow - above threshold
          linesOfCode: 2
        });
      }

      const detection = detector.detect({
        timestamp: Date.now() + 5000,
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        acceptanceTimeDelta: 4000,
        linesOfCode: 2
      });

      expect(detection.signals.patternBased).toBe(false);
    });
  });

  describe('Complexity-Based Detection', () => {
    it('should detect when review time is insufficient for code size', () => {
      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        acceptanceTimeDelta: 1200, // Too fast for 5 lines
        linesOfCode: 5, // 5 lines requires ~2500ms (5 * 500ms)
        language: 'typescript'
      };

      const detection = detector.detect(event);

      expect(detection.signals.complexityBased).toBe(true);
    });

    it('should account for complex language multiplier', () => {
      const simpleEvent: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        acceptanceTimeDelta: 2200,
        linesOfCode: 4, // 4 * 500 = 2000ms
        language: 'plaintext' // Simple language
      };

      const complexEvent: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        acceptanceTimeDelta: 2200,
        linesOfCode: 4, // 4 * 500 * 1.5 = 3000ms (for complex language)
        language: 'typescript' // Complex language
      };

      const simpleDetection = detector.detect(simpleEvent);
      const complexDetection = detector.detect(complexEvent);

      expect(simpleDetection.signals.complexityBased).toBe(false);
      expect(complexDetection.signals.complexityBased).toBe(true);
    });

    it('should respect minimum review time floor', () => {
      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        acceptanceTimeDelta: 800, // Below minimum floor of 1000ms
        linesOfCode: 1, // Would calculate to 500ms, but floor is 1000ms
        language: 'javascript'
      };

      const detection = detector.detect(event);

      expect(detection.signals.complexityBased).toBe(true);
    });

    it('should not detect without sufficient data', () => {
      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        acceptanceTimeDelta: 500
        // No linesOfCode
      };

      const detection = detector.detect(event);

      expect(detection.signals.complexityBased).toBe(false);
    });
  });

  describe('Confidence Scoring', () => {
    it('should return low confidence with 1 triggered signal', () => {
      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        acceptanceTimeDelta: 1500, // Triggers time-based only
        linesOfCode: 1 // Not enough for complexity
      };

      const detection = detector.detect(event);

      expect(detection.isBlindApproval).toBe(true);
      expect(detection.confidence).toBe(BlindApprovalConfidence.Low);
    });

    it('should return medium confidence with 2 triggered signals', () => {
      // Build up pattern (3+ rapid acceptances)
      for (let i = 0; i < 3; i++) {
        detector.detect({
          timestamp: Date.now() + i * 100,
          tool: AITool.Copilot,
          eventType: EventType.SuggestionAccepted,
          acceptanceTimeDelta: 1000,
          linesOfCode: 1
        });
      }

      const event: TrackingEvent = {
        timestamp: Date.now() + 300,
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        acceptanceTimeDelta: 1500, // Triggers time-based and pattern-based
        linesOfCode: 1
      };

      const detection = detector.detect(event);

      expect(detection.isBlindApproval).toBe(true);
      expect(detection.confidence).toBe(BlindApprovalConfidence.Medium);
    });

    it('should return high confidence with 3 triggered signals', () => {
      // Build up pattern
      for (let i = 0; i < 3; i++) {
        detector.detect({
          timestamp: Date.now() + i * 100,
          tool: AITool.Copilot,
          eventType: EventType.SuggestionAccepted,
          acceptanceTimeDelta: 1000,
          linesOfCode: 5
        });
      }

      const event: TrackingEvent = {
        timestamp: Date.now() + 300,
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        acceptanceTimeDelta: 1000, // Triggers all 3 signals
        linesOfCode: 10, // Requires more time
        language: 'typescript'
      };

      const detection = detector.detect(event);

      expect(detection.isBlindApproval).toBe(true);
      expect(detection.confidence).toBe(BlindApprovalConfidence.High);
      expect(detection.signals.timeBased).toBe(true);
      expect(detection.signals.patternBased).toBe(true);
      expect(detection.signals.complexityBased).toBe(true);
    });
  });

  describe('Non-Acceptance Events', () => {
    it('should return negative detection for non-acceptance events', () => {
      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionDisplayed
      };

      const detection = detector.detect(event);

      expect(detection.isBlindApproval).toBe(false);
    });

    it('should return negative detection for rejected events', () => {
      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionRejected
      };

      const detection = detector.detect(event);

      expect(detection.isBlindApproval).toBe(false);
    });
  });

  describe('Streak Detection', () => {
    it('should detect streak when consecutive blind approvals meet threshold', () => {
      // Add 3 consecutive rapid acceptances (default streak threshold)
      for (let i = 0; i < 3; i++) {
        detector.detect({
          timestamp: Date.now() + i * 1000,
          tool: AITool.Copilot,
          eventType: EventType.SuggestionAccepted,
          acceptanceTimeDelta: 1000, // Rapid
          linesOfCode: 2
        });
      }

      expect(detector.isInStreak()).toBe(true);
    });

    it('should not detect streak with insufficient acceptances', () => {
      // Add only 2 rapid acceptances
      for (let i = 0; i < 2; i++) {
        detector.detect({
          timestamp: Date.now() + i * 1000,
          tool: AITool.Copilot,
          eventType: EventType.SuggestionAccepted,
          acceptanceTimeDelta: 1000,
          linesOfCode: 2
        });
      }

      expect(detector.isInStreak()).toBe(false);
    });

    it('should break streak with a slow acceptance', () => {
      // Add 3 rapid acceptances
      for (let i = 0; i < 3; i++) {
        detector.detect({
          timestamp: Date.now() + i * 1000,
          tool: AITool.Copilot,
          eventType: EventType.SuggestionAccepted,
          acceptanceTimeDelta: 1000,
          linesOfCode: 2
        });
      }

      expect(detector.isInStreak()).toBe(true);

      // Add a slow acceptance
      detector.detect({
        timestamp: Date.now() + 3000,
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        acceptanceTimeDelta: 5000, // Slow
        linesOfCode: 2
      });

      expect(detector.isInStreak()).toBe(false);
    });

    it('should calculate correct streak length', () => {
      // Add mixed acceptances: 2 slow, then 4 rapid
      detector.detect({
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        acceptanceTimeDelta: 4000,
        linesOfCode: 2
      });

      detector.detect({
        timestamp: Date.now() + 1000,
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        acceptanceTimeDelta: 4000,
        linesOfCode: 2
      });

      // Now 4 rapid ones
      for (let i = 0; i < 4; i++) {
        detector.detect({
          timestamp: Date.now() + 2000 + i * 100,
          tool: AITool.Copilot,
          eventType: EventType.SuggestionAccepted,
          acceptanceTimeDelta: 1000,
          linesOfCode: 2
        });
      }

      expect(detector.getStreakLength()).toBe(4);
    });
  });

  describe('Statistics', () => {
    it('should track recent acceptance count', () => {
      for (let i = 0; i < 5; i++) {
        detector.detect({
          timestamp: Date.now() + i * 1000,
          tool: AITool.Copilot,
          eventType: EventType.SuggestionAccepted,
          acceptanceTimeDelta: 2500,
          linesOfCode: 2
        });
      }

      const stats = detector.getStats();
      expect(stats.recentCount).toBe(5);
    });

    it('should track rapid acceptance count', () => {
      // Add 3 rapid and 2 slow
      for (let i = 0; i < 3; i++) {
        detector.detect({
          timestamp: Date.now() + i * 1000,
          tool: AITool.Copilot,
          eventType: EventType.SuggestionAccepted,
          acceptanceTimeDelta: 1000, // Rapid
          linesOfCode: 2
        });
      }

      for (let i = 0; i < 2; i++) {
        detector.detect({
          timestamp: Date.now() + 3000 + i * 1000,
          tool: AITool.Copilot,
          eventType: EventType.SuggestionAccepted,
          acceptanceTimeDelta: 3000, // Slow
          linesOfCode: 2
        });
      }

      const stats = detector.getStats();
      expect(stats.recentCount).toBe(5);
      expect(stats.recentRapidCount).toBe(3);
    });

    it('should calculate average review time', () => {
      detector.detect({
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        acceptanceTimeDelta: 1000,
        linesOfCode: 2
      });

      detector.detect({
        timestamp: Date.now() + 1000,
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        acceptanceTimeDelta: 3000,
        linesOfCode: 2
      });

      const stats = detector.getStats();
      expect(stats.averageReviewTime).toBe(2000); // (1000 + 3000) / 2
    });

    it('should maintain window of last 10 acceptances', () => {
      // Add 15 acceptances
      for (let i = 0; i < 15; i++) {
        detector.detect({
          timestamp: Date.now() + i * 1000,
          tool: AITool.Copilot,
          eventType: EventType.SuggestionAccepted,
          acceptanceTimeDelta: 2000,
          linesOfCode: 2
        });
      }

      const stats = detector.getStats();
      expect(stats.recentCount).toBe(10); // Should cap at 10
    });
  });

  describe('Threshold Updates', () => {
    it('should update thresholds', () => {
      const newThresholds: ThresholdConfig = {
        level: 'senior' as any,
        blindApprovalTime: 1500, // Stricter
        minReviewTime: 800,
        maxAIPercentage: 50,
        streakThreshold: 5
      };

      detector.updateThresholds(newThresholds);

      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        acceptanceTimeDelta: 1800, // Would be OK with old threshold (2000), not with new (1500)
        linesOfCode: 2
      };

      const detection = detector.detect(event);

      expect(detection.isBlindApproval).toBe(false);
      expect(detection.threshold).toBe(1500);
    });

    it('should apply new thresholds to detection', () => {
      detector.updateThresholds({
        level: 'junior' as any,
        blindApprovalTime: 3000, // More lenient
        minReviewTime: 500,
        maxAIPercentage: 70,
        streakThreshold: 4
      });

      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        acceptanceTimeDelta: 3500, // Above new threshold, so not blind
        linesOfCode: 1
      };

      const detection = detector.detect(event);

      expect(detection.isBlindApproval).toBe(false); // Not blind with new threshold
    });
  });

  describe('Reset Functionality', () => {
    it('should clear all tracking data', () => {
      // Add some acceptances
      for (let i = 0; i < 5; i++) {
        detector.detect({
          timestamp: Date.now() + i * 1000,
          tool: AITool.Copilot,
          eventType: EventType.SuggestionAccepted,
          acceptanceTimeDelta: 1000,
          linesOfCode: 2
        });
      }

      let stats = detector.getStats();
      expect(stats.recentCount).toBe(5);

      detector.reset();

      stats = detector.getStats();
      expect(stats.recentCount).toBe(0);
      expect(stats.recentRapidCount).toBe(0);
      expect(stats.averageReviewTime).toBe(0);
    });

    it('should reset streak detection', () => {
      // Build up a streak
      for (let i = 0; i < 4; i++) {
        detector.detect({
          timestamp: Date.now() + i * 1000,
          tool: AITool.Copilot,
          eventType: EventType.SuggestionAccepted,
          acceptanceTimeDelta: 1000,
          linesOfCode: 2
        });
      }

      expect(detector.isInStreak()).toBe(true);
      expect(detector.getStreakLength()).toBe(4);

      detector.reset();

      expect(detector.isInStreak()).toBe(false);
      expect(detector.getStreakLength()).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero lines of code', () => {
      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        acceptanceTimeDelta: 500,
        linesOfCode: 0
      };

      const detection = detector.detect(event);

      // With 0 lines, minReviewTime (1000ms) is the floor, 500ms < 1000ms = complexity signal triggered
      // But without linesOfCode, complexityBased requires both acceptanceTimeDelta AND linesOfCode
      // So it should be false
      expect(detection.signals.complexityBased).toBe(false);
    });

    it('should handle missing metadata gracefully', () => {
      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted
      };

      const detection = detector.detect(event);

      expect(detection).toBeDefined();
      expect(detection.isBlindApproval).toBe(false);
    });

    it('should handle complex language identification', () => {
      const complexLanguages = ['typescript', 'javascript', 'python', 'java', 'cpp', 'rust'];

      complexLanguages.forEach(lang => {
        const event: TrackingEvent = {
          timestamp: Date.now(),
          tool: AITool.Copilot,
          eventType: EventType.SuggestionAccepted,
          acceptanceTimeDelta: 2200,
          linesOfCode: 3, // 3 * 500 * 1.5 = 2250ms needed
          language: lang
        };

        const detection = detector.detect(event);
        expect(detection.signals.complexityBased).toBe(true);
      });
    });
  });
});
