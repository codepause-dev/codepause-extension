/**
 * AlertEngine
 * Decision engine for when and what alerts to show to users
 */

import {
  Alert,
  AlertType,
  AlertFrequency,
  BlindApprovalDetection,
  DailyMetrics,
  ALERT_RATE_LIMITS
} from '../types';
import { ConfigRepository } from '../storage/ConfigRepository';

export class AlertEngine {
  private educationalTips: string[] = [
    'Taking time to review AI suggestions helps you learn and spot potential issues.',
    'Try modifying AI suggestions to fit your coding style - it\'s a great learning opportunity.',
    'Reading through AI-generated code helps you understand different approaches to problems.',
    'Quick reviews might miss edge cases or security vulnerabilities in the code.',
    'The best developers use AI as a tool, not a replacement for critical thinking.',
    'Consider why the AI suggested this code - understanding helps you grow as a developer.'
  ];

  constructor(private configRepo: ConfigRepository) {}

  async shouldShowBlindApprovalAlert(detection: BlindApprovalDetection): Promise<boolean> {
    // Only high confidence detections trigger alerts
    if (detection.confidence !== 'high') {
      return false;
    }

    // Check if alerts are snoozed
    if (await this.configRepo.isSnoozed()) {
      return false;
    }

    // Check rate limiting
    const canShow = await this.configRepo.canShowAlert(
      AlertType.GentleNudge,
      ALERT_RATE_LIMITS[AlertType.GentleNudge]
    );
    
    return canShow;
  }

  /**
   * Convert milliseconds to user-friendly time string
   */
  private formatTime(ms: number): string {
    if (ms < 1000) {
      return 'under 1 second';
    } else if (ms < 2000) {
      return '1 second';
    } else if (ms < 60000) {
      return `${Math.round(ms / 1000)} seconds`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.round((ms % 60000) / 1000);
      return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes} minutes`;
    }
  }

  /**
   * Create blind approval alert
   * Uses consistent message format to enable deduplication
   */
  createBlindApprovalAlert(detection: BlindApprovalDetection): Alert {
    const timeStr = this.formatTime(detection.timeDelta);
    const thresholdStr = this.formatTime(detection.threshold);

    // More actionable message with specific guidance
    const message = `You reviewed that in ${timeStr}. Try taking at least ${thresholdStr} to spot bugs and understand the code.`;

    // Generate ID that includes detection details to ensure uniqueness per actual event
    const alertId = `blind-approval-${detection.timeDelta}-${detection.confidence}-${Date.now()}`;

    return {
      id: alertId,
      type: AlertType.GentleNudge,
      title: 'Quick Review Detected',
      message,
      timestamp: Date.now(),
      actions: [
        { label: 'Got It', action: 'dismiss' },
        { label: 'Snooze', action: 'snooze' }
      ],
      metadata: {
        detection,
        confidence: detection.confidence
      }
    };
  }

  async shouldShowEducationalMoment(): Promise<boolean> {
    if (await this.configRepo.isSnoozed()) {
      return false;
    }

    // Random chance (20%) and rate limited
    if (Math.random() > 0.2) {
      return false;
    }

    return await this.configRepo.canShowAlert(
      AlertType.EducationalMoment,
      ALERT_RATE_LIMITS[AlertType.EducationalMoment]
    );
  }

  createEducationalMoment(): Alert {
    const tip = this.educationalTips[Math.floor(Math.random() * this.educationalTips.length)];

    return {
      id: this.generateAlertId(),
      type: AlertType.EducationalMoment,
      title: 'Coding Tip',
      message: tip,
      timestamp: Date.now(),
      autoClose: 6,
      actions: [
        { label: 'Got It', action: 'dismiss' },
        { label: 'Learn More', action: 'learn-more' }
      ],
      metadata: {
        tipIndex: this.educationalTips.indexOf(tip)
      }
    };
  }

  async shouldShowStreakWarning(streakLength: number, threshold: number): Promise<boolean> {
    if (streakLength < threshold) {
      return false;
    }

    if (await this.configRepo.isSnoozed()) {
      return false;
    }

    return await this.configRepo.canShowAlert(
      AlertType.StreakWarning,
      ALERT_RATE_LIMITS[AlertType.StreakWarning]
    );
  }

  createStreakWarning(streakLength: number): Alert {
    return {
      id: this.generateAlertId(),
      type: AlertType.StreakWarning,
      title: 'Review Pattern Notice',
      message: `You've quickly accepted ${streakLength} suggestions in a row. Slow down and review each suggestion for at least 3-5 seconds to catch bugs.`,
      timestamp: Date.now(),
      actions: [
        { label: 'Got It', action: 'dismiss' },
        { label: 'Snooze', action: 'snooze' }
      ],
      metadata: {
        streakLength
      }
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async shouldShowThresholdAlert(_metrics: DailyMetrics, _thresholdType: string): Promise<boolean> {
    if (await this.configRepo.isSnoozed()) {
      return false;
    }

    // Use gentle nudge rate limit for threshold alerts
    return await this.configRepo.canShowAlert(
      AlertType.GentleNudge,
      ALERT_RATE_LIMITS[AlertType.GentleNudge]
    );
  }

  createThresholdAlert(metrics: DailyMetrics, thresholdType: string, threshold: number): Alert | null {
    // Don't create alerts with insufficient data
    // Require at least 50 lines of code to make percentage meaningful
    const totalLines = metrics.totalAILines + metrics.totalManualLines;
    if (totalLines < 50) {
      return null;
    }

    let message = '';
    let title = '';

    switch (thresholdType) {
      case 'aiPercentage': {
        const current = Math.round(metrics.aiPercentage);
        const diff = current - threshold;
        title = 'AI Usage Above Target';
        message = `You're at ${current}% AI-generated code today (${diff}% above your ${threshold}% target). Try writing more code manually to build your skills.`;
        break;
      }
      case 'blindApprovals':
        // Note: Blind approval alerts disabled as blindApprovalCount is no longer tracked in daily metrics
        // Blind approval detection still happens for event tracking but not shown in alerts
        title = 'Quick Acceptances Today';
        message = 'Quick acceptance tracking is currently disabled.';
        break;
      case 'reviewTime': {
        const avgSeconds = Math.round(metrics.averageReviewTime / 1000);
        const targetSeconds = Math.round(threshold / 1000);
        title = 'Review Time Below Target';
        message = `Your average review time is ${avgSeconds} seconds (target: ${targetSeconds}+ seconds). Take more time to understand the AI suggestions.`;
        break;
      }
      default:
        title = 'Usage Pattern Notice';
        message = 'Your coding patterns might benefit from more mindful AI usage. Check your dashboard for details.';
    }

    return {
      id: this.generateAlertId(),
      type: AlertType.GentleNudge,
      title,
      message,
      timestamp: Date.now(),
      actions: [
        { label: 'Got It', action: 'dismiss' },
        { label: 'Dashboard', action: 'open-dashboard' },
        { label: 'Snooze', action: 'snooze' }
      ],
      metadata: {
        thresholdType,
        threshold,
        currentValue:
          thresholdType === 'aiPercentage'
            ? metrics.aiPercentage
            : thresholdType === 'blindApprovals'
              ? 0  // Disabled - no longer tracked
              : metrics.averageReviewTime
      }
    };
  }

  getFrequencyMultiplier(frequency: AlertFrequency): number {
    switch (frequency) {
      case AlertFrequency.Low:
        return 2.0; // Show alerts half as often
      case AlertFrequency.Medium:
        return 1.0; // Default frequency
      case AlertFrequency.High:
        return 0.5; // Show alerts twice as often
      default:
        return 1.0;
    }
  }

  async recordAlertShown(alert: Alert): Promise<void> {
    await this.configRepo.recordAlertShown(alert.type);
  }

  async getAlertStats(alertType: AlertType): Promise<{
    lastShown: number;
    count: number;
    canShow: boolean;
  } | null> {
    const history = await this.configRepo.getAlertHistory(alertType);

    if (!history) {
      return {
        lastShown: 0,
        count: 0,
        canShow: true
      };
    }

    const rateLimit = ALERT_RATE_LIMITS[alertType];
    const canShow = await this.configRepo.canShowAlert(alertType, rateLimit);

    return {
      lastShown: history.lastShown,
      count: history.count,
      canShow
    };
  }

  private generateAlertId(): string {
    // Use high-resolution time and random to ensure uniqueness
    const hrTime = process.hrtime.bigint();
    const random = Math.random().toString(36).substring(2, 11);
    return `alert-${hrTime}-${random}`;
  }

  // ========== NEW: Review Quality Alert Types ==========

  /**
   * Alert 1: Review Reminder (after agent session ends)
   * Shown when: Agent session ends + 50+ lines OR 3+ files + avg review score <40
   */
  async shouldShowReviewReminder(
    fileCount: number,
    totalLines: number,
    averageReviewScore: number
  ): Promise<boolean> {
    // Check criteria
    const meetsThreshold =
      (totalLines >= 50 || fileCount >= 3) &&
      averageReviewScore < 40;

    if (!meetsThreshold) {
      return false;
    }

    if (await this.configRepo.isSnoozed()) {
      return false;
    }

    return await this.configRepo.canShowAlert(
      AlertType.ReviewReminder,
      ALERT_RATE_LIMITS[AlertType.ReviewReminder]
    );
  }

  createReviewReminderAlert(
    fileCount: number,
    totalLines: number,
    filesAffected: string[]
  ): Alert {
    const fileWord = fileCount === 1 ? 'file' : 'files';
    const lineWord = totalLines === 1 ? 'line' : 'lines';

    // Show up to 5 files in the message
    const fileList = filesAffected.slice(0, 5).map(f => {
      const parts = f.split('/');
      return parts[parts.length - 1]; // Just filename
    }).join(', ');

    const moreFiles = filesAffected.length > 5 ? ` and ${filesAffected.length - 5} more` : '';

    const message =
      `AI just modified ${fileCount} ${fileWord} (${totalLines} ${lineWord}). ` +
      `Take a few minutes to review the changes and ensure you understand what was generated.\n\n` +
      `Files: ${fileList}${moreFiles}`;

    return {
      id: this.generateAlertId(),
      type: AlertType.ReviewReminder,
      title: 'Review Your AI-Generated Code',
      message,
      timestamp: Date.now(),
      actions: [
        { label: 'Review Now', action: 'review-files' },
        { label: 'Mark Reviewed', action: 'mark-reviewed' },
        { label: 'Dismiss', action: 'dismiss' }
      ],
      metadata: {
        fileCount,
        totalLines,
        filesAffected
      }
    };
  }

  /**
   * Alert 2: Excessive Unreviewed Code (daily threshold exceeded)
   * Shown when: Daily unreviewed % > threshold (Junior: 30%, Mid: 40%, Senior: 50%)
   */
  async shouldShowExcessiveUnreviewedAlert(
    unreviewedPercentage: number,
    threshold: number
  ): Promise<boolean> {
    if (unreviewedPercentage <= threshold) {
      return false;
    }

    if (await this.configRepo.isSnoozed()) {
      return false;
    }

    return await this.configRepo.canShowAlert(
      AlertType.ExcessiveUnreviewed,
      ALERT_RATE_LIMITS[AlertType.ExcessiveUnreviewed]
    );
  }

  createExcessiveUnreviewedAlert(
    unreviewedPercentage: number,
    unreviewedLines: number,
    unreviewedFileCount: number,
    threshold: number
  ): Alert {
    const current = Math.round(unreviewedPercentage);
    const excess = current - threshold;

    const fileWord = unreviewedFileCount === 1 ? 'file' : 'files';
    const lineWord = unreviewedLines === 1 ? 'line' : 'lines';

    const message =
      `You have ${current}% of today's AI code unreviewed ` +
      `(${excess}% above your ${threshold}% threshold). ` +
      `That's ${unreviewedLines} ${lineWord} across ${unreviewedFileCount} ${fileWord}.\n\n` +
      `Review code to maintain ownership and catch potential issues.`;

    return {
      id: this.generateAlertId(),
      type: AlertType.ExcessiveUnreviewed,
      title: '⚠️ High Unreviewed Code',
      message,
      timestamp: Date.now(),
      actions: [
        { label: 'Review Now', action: 'review-files' },
        { label: 'Dashboard', action: 'open-dashboard' },
        { label: 'Dismiss', action: 'dismiss' }
      ],
      metadata: {
        unreviewedPercentage,
        unreviewedLines,
        unreviewedFileCount,
        threshold
      }
    };
  }

  /**
   * Alert 3: Code Ownership Shift (multi-day pattern)
   * Shown when: 3+ consecutive days >60% unreviewed OR 5+ days >70%
   */
  async shouldShowOwnershipShiftAlert(
    consecutiveDays: number,
    averageUnreviewedPercentage: number
  ): Promise<boolean> {
    // Criteria: 3+ days >60% OR 5+ days >70%
    const meetsThreshold =
      (consecutiveDays >= 3 && averageUnreviewedPercentage > 60) ||
      (consecutiveDays >= 5 && averageUnreviewedPercentage > 70);

    if (!meetsThreshold) {
      return false;
    }

    if (await this.configRepo.isSnoozed()) {
      return false;
    }

    return await this.configRepo.canShowAlert(
      AlertType.OwnershipShift,
      ALERT_RATE_LIMITS[AlertType.OwnershipShift]
    );
  }

  createOwnershipShiftAlert(
    consecutiveDays: number,
    averageUnreviewedPercentage: number,
    totalUnreviewedLines: number
  ): Alert {
    const dayWord = consecutiveDays === 1 ? 'day' : 'days';
    const avg = Math.round(averageUnreviewedPercentage);

    const message =
      `⚠️ You've accepted AI code without review for ${consecutiveDays} ${dayWord} straight ` +
      `(avg ${avg}% unreviewed, ${totalUnreviewedLines} lines). ` +
      `This shifts code ownership to the AI and increases risk of bugs and security issues.\n\n` +
      `Take time to review and understand the code you're accepting.`;

    return {
      id: this.generateAlertId(),
      type: AlertType.OwnershipShift,
      title: '🚨 Code Ownership Alert',
      message,
      timestamp: Date.now(),
      severity: 'high',
      actions: [
        { label: 'Review Now', action: 'review-files' },
        { label: 'Learn More', action: 'learn-ownership' },
        { label: 'Dismiss', action: 'dismiss' }
      ],
      metadata: {
        consecutiveDays,
        averageUnreviewedPercentage,
        totalUnreviewedLines
      }
    };
  }
}
