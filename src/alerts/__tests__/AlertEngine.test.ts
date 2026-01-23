/**
 * AlertEngine Tests
 * Tests for alert decision engine and rate limiting
 */

import { AlertEngine } from '../AlertEngine';
import { ConfigRepository } from '../../storage/ConfigRepository';
import { AlertType, BlindApprovalDetection, DailyMetrics, AITool, ToolMetrics, AlertFrequency, BlindApprovalConfidence } from '../../types';

jest.mock('../../storage/ConfigRepository');

describe('AlertEngine', () => {
  let alertEngine: AlertEngine;
  let mockConfigRepo: jest.Mocked<ConfigRepository>;

  beforeEach(() => {
    mockConfigRepo = new ConfigRepository(null as any) as jest.Mocked<ConfigRepository>;
    alertEngine = new AlertEngine(mockConfigRepo);
  });

  describe('Blind Approval Alerts', () => {
    it('should show alert for high confidence detection', async () => {
      mockConfigRepo.isSnoozed.mockResolvedValue(false);
      mockConfigRepo.canShowAlert.mockResolvedValue(true);

      const detection: BlindApprovalDetection = {
        timeDelta: 500,
        confidence: BlindApprovalConfidence.High,
        threshold: 2000,
        isBlindApproval: true,
        signals: { timeBased: true, patternBased: false, complexityBased: false }
      };

      const shouldShow = await alertEngine.shouldShowBlindApprovalAlert(detection);
      expect(shouldShow).toBe(true);
    });

    it('should not show alert for medium confidence', async () => {
      const detection: BlindApprovalDetection = {
        timeDelta: 1000,
        confidence: BlindApprovalConfidence.Medium,
        threshold: 2000,
        isBlindApproval: true,
        signals: { timeBased: true, patternBased: false, complexityBased: false }
      };

      const shouldShow = await alertEngine.shouldShowBlindApprovalAlert(detection);
      expect(shouldShow).toBe(false);
    });

    it('should not show alert for low confidence', async () => {
      const detection: BlindApprovalDetection = {
        timeDelta: 1500,
        confidence: BlindApprovalConfidence.Low,
        threshold: 2000,
        isBlindApproval: false,
        signals: { timeBased: false, patternBased: false, complexityBased: false }
      };

      const shouldShow = await alertEngine.shouldShowBlindApprovalAlert(detection);
      expect(shouldShow).toBe(false);
    });

    it('should respect snooze state', async () => {
      mockConfigRepo.isSnoozed.mockResolvedValue(true);

      const detection: BlindApprovalDetection = {
        timeDelta: 500,
        confidence: BlindApprovalConfidence.High,
        threshold: 2000,
        isBlindApproval: true,
        signals: { timeBased: true, patternBased: false, complexityBased: false }
      };

      const shouldShow = await alertEngine.shouldShowBlindApprovalAlert(detection);
      expect(shouldShow).toBe(false);
    });

    it('should respect rate limiting', async () => {
      mockConfigRepo.isSnoozed.mockResolvedValue(false);
      mockConfigRepo.canShowAlert.mockResolvedValue(false);

      const detection: BlindApprovalDetection = {
        timeDelta: 500,
        confidence: BlindApprovalConfidence.High,
        threshold: 2000,
        isBlindApproval: true,
        signals: { timeBased: true, patternBased: false, complexityBased: false }
      };

      const shouldShow = await alertEngine.shouldShowBlindApprovalAlert(detection);
      expect(shouldShow).toBe(false);
    });

    it('should create alert with correct format', () => {
      const detection: BlindApprovalDetection = {
        timeDelta: 750,
        confidence: BlindApprovalConfidence.High,
        threshold: 2000,
        isBlindApproval: true,
        signals: { timeBased: true, patternBased: false, complexityBased: false }
      };

      const alert = alertEngine.createBlindApprovalAlert(detection);

      expect(alert.type).toBe(AlertType.GentleNudge);
      expect(alert.title).toBe('Quick Review Detected');
      expect(alert.message).toContain('under 1 second');
      expect(alert.message).toContain('2 seconds');
      expect(alert.actions).toHaveLength(2);
      expect(alert.metadata?.detection).toEqual(detection);
    });

    it('should create alert IDs with detection details', () => {
      const detection: BlindApprovalDetection = {
        timeDelta: 500,
        confidence: BlindApprovalConfidence.High,
        threshold: 2000,
        isBlindApproval: true,
        signals: { timeBased: true, patternBased: false, complexityBased: false }
      };

      const alert1 = alertEngine.createBlindApprovalAlert(detection);

      // ID should include detection details
      expect(alert1.id).toContain('blind-approval');
      expect(alert1.id).toContain('500');
      expect(alert1.id).toContain('high');
    });
  });

  describe('Educational Moments', () => {
    it('should show educational moment when not snoozed and random passes', async () => {
      mockConfigRepo.isSnoozed.mockResolvedValue(false);
      mockConfigRepo.canShowAlert.mockResolvedValue(true);

      // Mock Math.random to return 0.1 (< 0.2, so should show)
      jest.spyOn(Math, 'random').mockReturnValue(0.1);

      const shouldShow = await alertEngine.shouldShowEducationalMoment();
      expect(shouldShow).toBe(true);
    });

    it('should not show when random check fails', async () => {
      mockConfigRepo.isSnoozed.mockResolvedValue(false);

      // Mock Math.random to return 0.5 (> 0.2, so should not show)
      jest.spyOn(Math, 'random').mockReturnValue(0.5);

      const shouldShow = await alertEngine.shouldShowEducationalMoment();
      expect(shouldShow).toBe(false);
    });

    it('should not show when snoozed', async () => {
      mockConfigRepo.isSnoozed.mockResolvedValue(true);

      const shouldShow = await alertEngine.shouldShowEducationalMoment();
      expect(shouldShow).toBe(false);
    });

    it('should create educational alert with random tip', () => {
      const alert1 = alertEngine.createEducationalMoment();
      const alert2 = alertEngine.createEducationalMoment();

      expect(alert1.type).toBe(AlertType.EducationalMoment);
      expect(alert1.title).toBe('Coding Tip');
      expect(alert1.autoClose).toBe(6);
      expect(alert1.message).toBeTruthy();

      // Tips may be different (random)
      expect(typeof alert1.message).toBe('string');
      expect(typeof alert2.message).toBe('string');
    });
  });

  describe('Streak Warnings', () => {
    it('should show warning when streak exceeds threshold', async () => {
      mockConfigRepo.isSnoozed.mockResolvedValue(false);
      mockConfigRepo.canShowAlert.mockResolvedValue(true);

      const shouldShow = await alertEngine.shouldShowStreakWarning(5, 3);
      expect(shouldShow).toBe(true);
    });

    it('should not show when streak below threshold', async () => {
      const shouldShow = await alertEngine.shouldShowStreakWarning(2, 5);
      expect(shouldShow).toBe(false);
    });

    it('should not show when snoozed', async () => {
      mockConfigRepo.isSnoozed.mockResolvedValue(true);

      const shouldShow = await alertEngine.shouldShowStreakWarning(10, 3);
      expect(shouldShow).toBe(false);
    });

    it('should create streak warning with correct count', () => {
      const alert = alertEngine.createStreakWarning(7);

      expect(alert.type).toBe(AlertType.StreakWarning);
      expect(alert.title).toBe('Review Pattern Notice');
      expect(alert.message).toContain('7');
      expect(alert.actions).toHaveLength(2);
      expect(alert.metadata?.streakLength).toBe(7);
    });
  });

  describe('Threshold Alerts', () => {
    const mockMetrics: DailyMetrics = {
      date: '2024-01-01',
      totalEvents: 100,
      totalAISuggestions: 80,
      totalAILines: 800,
      totalManualLines: 200,
      aiPercentage: 80,
      averageReviewTime: 500,
      sessionCount: 3,
      toolBreakdown: {} as Record<AITool, ToolMetrics>,
    };

    it('should check snooze state for threshold alerts', async () => {
      mockConfigRepo.isSnoozed.mockResolvedValue(true);

      const shouldShow = await alertEngine.shouldShowThresholdAlert(mockMetrics, 'aiPercentage');
      expect(shouldShow).toBe(false);
    });

    it('should check rate limiting', async () => {
      mockConfigRepo.isSnoozed.mockResolvedValue(false);
      mockConfigRepo.canShowAlert.mockResolvedValue(true);

      const shouldShow = await alertEngine.shouldShowThresholdAlert(mockMetrics, 'aiPercentage');
      expect(shouldShow).toBe(true);
    });

    it('should create AI percentage threshold alert', () => {
      const alert = alertEngine.createThresholdAlert(mockMetrics, 'aiPercentage', 70);

      expect(alert).not.toBeNull();
      expect(alert!.type).toBe(AlertType.GentleNudge);
      expect(alert!.title).toBe('AI Usage Above Target');
      expect(alert!.message).toContain('80%');
      expect(alert!.message).toContain('70%');
      expect(alert!.actions).toHaveLength(3);
    });

    it('should create blind approval threshold alert with disabled message', () => {
      const alert = alertEngine.createThresholdAlert(mockMetrics, 'blindApprovals', 10);

      expect(alert).not.toBeNull();
      expect(alert!.title).toBe('Quick Acceptances Today');
      expect(alert!.message).toContain('Quick acceptance tracking is currently disabled');
      expect(alert!.metadata?.thresholdType).toBe('blindApprovals');
    });

    it('should create review time threshold alert', () => {
      const alert = alertEngine.createThresholdAlert(mockMetrics, 'reviewTime', 1000);

      expect(alert).not.toBeNull();
      expect(alert!.title).toBe('Review Time Below Target');
      expect(alert!.message).toContain('1 seconds');
      expect(alert!.message).toContain('1+ seconds');
      expect(alert!.metadata?.thresholdType).toBe('reviewTime');
    });

    it('should handle unknown threshold type', () => {
      const alert = alertEngine.createThresholdAlert(mockMetrics, 'unknown', 100);

      expect(alert).not.toBeNull();
      expect(alert!.message).toContain('mindful AI usage');
    });
  });

  describe('Frequency Multiplier', () => {
    it('should return 2.0 for low frequency', () => {
      const multiplier = alertEngine.getFrequencyMultiplier(AlertFrequency.Low);
      expect(multiplier).toBe(2.0);
    });

    it('should return 1.0 for medium frequency', () => {
      const multiplier = alertEngine.getFrequencyMultiplier(AlertFrequency.Medium);
      expect(multiplier).toBe(1.0);
    });

    it('should return 0.5 for high frequency', () => {
      const multiplier = alertEngine.getFrequencyMultiplier(AlertFrequency.High);
      expect(multiplier).toBe(0.5);
    });

    it('should return 1.0 for unknown frequency', () => {
      const multiplier = alertEngine.getFrequencyMultiplier('unknown' as AlertFrequency);
      expect(multiplier).toBe(1.0);
    });
  });

  describe('Alert Recording', () => {
    it('should record alert shown', async () => {
      const alert = {
        id: 'test-alert',
        type: AlertType.GentleNudge,
        title: 'Test',
        message: 'Test message',
        timestamp: Date.now(),
        actions: [],
      };

      await alertEngine.recordAlertShown(alert);

      expect(mockConfigRepo.recordAlertShown).toHaveBeenCalledWith(AlertType.GentleNudge);
    });
  });

  describe('Alert Statistics', () => {
    it('should return stats when history exists', async () => {
      mockConfigRepo.getAlertHistory.mockResolvedValue({
        alertType: AlertType.GentleNudge,
        lastShown: 1000000,
        count: 5,
      });
      mockConfigRepo.canShowAlert.mockResolvedValue(true);

      const stats = await alertEngine.getAlertStats(AlertType.GentleNudge);

      expect(stats).toEqual({
        lastShown: 1000000,
        count: 5,
        canShow: true,
      });
    });

    it('should return default stats when no history', async () => {
      mockConfigRepo.getAlertHistory.mockResolvedValue(null);

      const stats = await alertEngine.getAlertStats(AlertType.GentleNudge);

      expect(stats).toEqual({
        lastShown: 0,
        count: 0,
        canShow: true,
      });
    });
  });

  describe('Alert Actions', () => {
    it('should include dismiss action in blind approval alerts', () => {
      const detection: BlindApprovalDetection = {
        timeDelta: 500,
        confidence: BlindApprovalConfidence.High,
        threshold: 2000,
        isBlindApproval: true,
        signals: { timeBased: true, patternBased: false, complexityBased: false }
      };

      const alert = alertEngine.createBlindApprovalAlert(detection);

      const dismissAction = alert.actions?.find((a) => a.action === 'dismiss');
      expect(dismissAction).toBeDefined();
      expect(dismissAction?.label).toBe('Got It');
    });

    it('should include snooze action in alerts', () => {
      const detection: BlindApprovalDetection = {
        timeDelta: 500,
        confidence: BlindApprovalConfidence.High,
        threshold: 2000,
        isBlindApproval: true,
        signals: { timeBased: true, patternBased: false, complexityBased: false }
      };

      const alert = alertEngine.createBlindApprovalAlert(detection);

      const snoozeAction = alert.actions?.find((a) => a.action === 'snooze');
      expect(snoozeAction).toBeDefined();
      expect(snoozeAction?.label).toContain('Snooze');
    });

    it('should include dashboard action in threshold alerts', () => {
      const metrics: DailyMetrics = {
        date: '2024-01-01',
        totalEvents: 100,
        totalAISuggestions: 80,
        totalAILines: 800,
        totalManualLines: 200,
        aiPercentage: 80,
        averageReviewTime: 500,
        sessionCount: 3,
        toolBreakdown: {} as Record<AITool, ToolMetrics>,
      };

      const alert = alertEngine.createThresholdAlert(metrics, 'aiPercentage', 70);

      expect(alert).not.toBeNull();
      const dashboardAction = alert!.actions?.find((a) => a.action === 'open-dashboard');
      expect(dashboardAction).toBeDefined();
      expect(dashboardAction?.label).toContain('Dashboard');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero streak length', async () => {
      const shouldShow = await alertEngine.shouldShowStreakWarning(0, 5);
      expect(shouldShow).toBe(false);
    });

    it('should handle negative threshold', async () => {
      mockConfigRepo.isSnoozed.mockResolvedValue(false);
      mockConfigRepo.canShowAlert.mockResolvedValue(true);

      const shouldShow = await alertEngine.shouldShowStreakWarning(5, -1);
      expect(shouldShow).toBe(true); // 5 > -1
    });

    it('should handle streak equal to threshold', async () => {
      mockConfigRepo.isSnoozed.mockResolvedValue(false);
      mockConfigRepo.canShowAlert.mockResolvedValue(true);

      const shouldShow = await alertEngine.shouldShowStreakWarning(5, 5);
      expect(shouldShow).toBe(true); // >= threshold
    });

    it('should handle very fast acceptance time', () => {
      const detection: BlindApprovalDetection = {
        timeDelta: 1,
        confidence: BlindApprovalConfidence.High,
        threshold: 2000,
        isBlindApproval: true,
        signals: { timeBased: true, patternBased: false, complexityBased: false }
      };

      const alert = alertEngine.createBlindApprovalAlert(detection);
      expect(alert.message).toContain('under 1 second');
    });

    it('should handle rate limiting with history', async () => {
      mockConfigRepo.isSnoozed.mockResolvedValue(false);
      mockConfigRepo.canShowAlert.mockResolvedValue(false);
      mockConfigRepo.getAlertHistory.mockResolvedValue({
        alertType: AlertType.GentleNudge,
        lastShown: Date.now() - 5000,
        count: 3
      });

      const detection: BlindApprovalDetection = {
        timeDelta: 500,
        confidence: BlindApprovalConfidence.High,
        threshold: 2000,
        isBlindApproval: true,
        signals: { timeBased: true, patternBased: false, complexityBased: false }
      };

      const shouldShow = await alertEngine.shouldShowBlindApprovalAlert(detection);
      expect(shouldShow).toBe(false);
      // Rate limiting handled internally by canShowAlert
    });

    it('should handle time formatting for minutes with seconds', () => {
      const detection: BlindApprovalDetection = {
        timeDelta: 125000, // 2 minutes 5 seconds
        confidence: BlindApprovalConfidence.High,
        threshold: 2000,
        isBlindApproval: true,
        signals: { timeBased: true, patternBased: false, complexityBased: false }
      };

      const alert = alertEngine.createBlindApprovalAlert(detection);
      expect(alert.message).toContain('2m 5s');
    });

    it('should handle time formatting for exact minutes', () => {
      const detection: BlindApprovalDetection = {
        timeDelta: 120000, // Exactly 2 minutes
        confidence: BlindApprovalConfidence.High,
        threshold: 2000,
        isBlindApproval: true,
        signals: { timeBased: true, patternBased: false, complexityBased: false }
      };

      const alert = alertEngine.createBlindApprovalAlert(detection);
      expect(alert.message).toContain('2 minutes');
    });

    it('should handle 1 second time formatting', () => {
      const detection: BlindApprovalDetection = {
        timeDelta: 1500, // 1.5 seconds
        confidence: BlindApprovalConfidence.High,
        threshold: 2000,
        isBlindApproval: true,
        signals: { timeBased: true, patternBased: false, complexityBased: false }
      };

      const alert = alertEngine.createBlindApprovalAlert(detection);
      expect(alert.message).toContain('1 second');
    });

    it('should return null for threshold alert with insufficient data', () => {
      const metrics: DailyMetrics = {
        date: '2024-01-01',
        totalEvents: 10,
        totalAISuggestions: 5,
        totalAILines: 20,
        totalManualLines: 10,
        aiPercentage: 67,
        averageReviewTime: 500,
        sessionCount: 1,
        toolBreakdown: {} as Record<AITool, ToolMetrics>,
      };

      const alert = alertEngine.createThresholdAlert(metrics, 'aiPercentage', 50);
      expect(alert).toBeNull();
    });
  });

  describe('Review Reminder Alerts', () => {
    it('should show review reminder when threshold met', async () => {
      mockConfigRepo.isSnoozed.mockResolvedValue(false);
      mockConfigRepo.canShowAlert.mockResolvedValue(true);

      const shouldShow = await alertEngine.shouldShowReviewReminder(5, 100, 25);
      expect(shouldShow).toBe(true);
    });

    it('should not show when lines below threshold and file count below threshold', async () => {
      const shouldShow = await alertEngine.shouldShowReviewReminder(1, 10, 25);
      expect(shouldShow).toBe(false);
    });

    it('should not show when review score is high', async () => {
      const shouldShow = await alertEngine.shouldShowReviewReminder(5, 100, 80);
      expect(shouldShow).toBe(false);
    });

    it('should show when file count threshold met', async () => {
      mockConfigRepo.isSnoozed.mockResolvedValue(false);
      mockConfigRepo.canShowAlert.mockResolvedValue(true);

      const shouldShow = await alertEngine.shouldShowReviewReminder(3, 30, 25);
      expect(shouldShow).toBe(true);
    });

    it('should not show when snoozed', async () => {
      mockConfigRepo.isSnoozed.mockResolvedValue(true);

      const shouldShow = await alertEngine.shouldShowReviewReminder(5, 100, 25);
      expect(shouldShow).toBe(false);
    });

    it('should create review reminder alert with correct format', () => {
      const files = ['/path/to/file1.ts', '/path/to/file2.ts'];
      const alert = alertEngine.createReviewReminderAlert(2, 150, files);

      expect(alert.type).toBe(AlertType.ReviewReminder);
      expect(alert.title).toBe('Review Your AI-Generated Code');
      expect(alert.message).toContain('2 files');
      expect(alert.message).toContain('150 lines');
      expect(alert.message).toContain('file1.ts');
      expect(alert.message).toContain('file2.ts');
      expect(alert.actions).toHaveLength(3);
    });

    it('should handle single file in review reminder', () => {
      const files = ['/path/to/single.ts'];
      const alert = alertEngine.createReviewReminderAlert(1, 1, files);

      expect(alert.message).toContain('1 file');
      expect(alert.message).toContain('1 line');
    });

    it('should truncate file list to 5 files', () => {
      const files = [
        '/f1.ts', '/f2.ts', '/f3.ts', '/f4.ts', '/f5.ts',
        '/f6.ts', '/f7.ts', '/f8.ts'
      ];
      const alert = alertEngine.createReviewReminderAlert(8, 200, files);

      expect(alert.message).toContain('and 3 more');
      expect(alert.metadata?.filesAffected).toHaveLength(8);
    });
  });

  describe('Excessive Unreviewed Alerts', () => {
    it('should show when unreviewed percentage exceeds threshold', async () => {
      mockConfigRepo.isSnoozed.mockResolvedValue(false);
      mockConfigRepo.canShowAlert.mockResolvedValue(true);

      const shouldShow = await alertEngine.shouldShowExcessiveUnreviewedAlert(55, 40);
      expect(shouldShow).toBe(true);
    });

    it('should not show when below threshold', async () => {
      const shouldShow = await alertEngine.shouldShowExcessiveUnreviewedAlert(30, 40);
      expect(shouldShow).toBe(false);
    });

    it('should not show when equal to threshold', async () => {
      const shouldShow = await alertEngine.shouldShowExcessiveUnreviewedAlert(40, 40);
      expect(shouldShow).toBe(false);
    });

    it('should not show when snoozed', async () => {
      mockConfigRepo.isSnoozed.mockResolvedValue(true);

      const shouldShow = await alertEngine.shouldShowExcessiveUnreviewedAlert(55, 40);
      expect(shouldShow).toBe(false);
    });

    it('should create excessive unreviewed alert with correct format', () => {
      const alert = alertEngine.createExcessiveUnreviewedAlert(60, 500, 10, 40);

      expect(alert.type).toBe(AlertType.ExcessiveUnreviewed);
      expect(alert.title).toBe('⚠️ High Unreviewed Code');
      expect(alert.message).toContain('60%');
      expect(alert.message).toContain('20% above');
      expect(alert.message).toContain('500 lines');
      expect(alert.message).toContain('10 files');
      expect(alert.actions).toHaveLength(3);
    });

    it('should handle singular forms in excessive unreviewed alert', () => {
      const alert = alertEngine.createExcessiveUnreviewedAlert(50, 1, 1, 40);

      expect(alert.message).toContain('1 line');
      expect(alert.message).toContain('1 file');
    });
  });

  describe('Ownership Shift Alerts', () => {
    it('should show when 3+ days >60% unreviewed', async () => {
      mockConfigRepo.isSnoozed.mockResolvedValue(false);
      mockConfigRepo.canShowAlert.mockResolvedValue(true);

      const shouldShow = await alertEngine.shouldShowOwnershipShiftAlert(3, 65);
      expect(shouldShow).toBe(true);
    });

    it('should show when 5+ days >70% unreviewed', async () => {
      mockConfigRepo.isSnoozed.mockResolvedValue(false);
      mockConfigRepo.canShowAlert.mockResolvedValue(true);

      const shouldShow = await alertEngine.shouldShowOwnershipShiftAlert(5, 75);
      expect(shouldShow).toBe(true);
    });

    it('should not show when below thresholds', async () => {
      const shouldShow1 = await alertEngine.shouldShowOwnershipShiftAlert(2, 65);
      expect(shouldShow1).toBe(false);

      const shouldShow2 = await alertEngine.shouldShowOwnershipShiftAlert(3, 55);
      expect(shouldShow2).toBe(false);

      const shouldShow3 = await alertEngine.shouldShowOwnershipShiftAlert(4, 55);
      expect(shouldShow3).toBe(false);

      const shouldShow4 = await alertEngine.shouldShowOwnershipShiftAlert(2, 75);
      expect(shouldShow4).toBe(false);
    });

    it('should not show when snoozed', async () => {
      mockConfigRepo.isSnoozed.mockResolvedValue(true);

      const shouldShow = await alertEngine.shouldShowOwnershipShiftAlert(3, 65);
      expect(shouldShow).toBe(false);
    });

    it('should create ownership shift alert with correct format', () => {
      const alert = alertEngine.createOwnershipShiftAlert(5, 72, 1500);

      expect(alert.type).toBe(AlertType.OwnershipShift);
      expect(alert.title).toBe('🚨 Code Ownership Alert');
      expect(alert.message).toContain('5 days');
      expect(alert.message).toContain('72%');
      expect(alert.message).toContain('1500 lines');
      expect(alert.severity).toBe('high');
      expect(alert.actions).toHaveLength(3);
    });

    it('should handle singular day in ownership shift alert', () => {
      const alert = alertEngine.createOwnershipShiftAlert(1, 80, 200);

      expect(alert.message).toContain('1 day');
    });
  });

  describe('Educational Moment Actions', () => {
    it('should include learn more action', () => {
      const alert = alertEngine.createEducationalMoment();

      const learnMoreAction = alert.actions?.find((a) => a.action === 'learn-more');
      expect(learnMoreAction).toBeDefined();
      expect(learnMoreAction?.label).toBe('Learn More');
    });
  });
});
