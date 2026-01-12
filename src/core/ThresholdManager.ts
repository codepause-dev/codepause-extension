/**
 * ThresholdManager
 * Manages threshold configurations based on developer experience level
 */

import {
  DeveloperLevel,
  ThresholdConfig,
  DEFAULT_THRESHOLDS,
  DailyMetrics
} from '../types';

export class ThresholdManager {
  private currentConfig: ThresholdConfig;

  constructor(level: DeveloperLevel) {
    this.currentConfig = { ...DEFAULT_THRESHOLDS[level] };
  }

  getConfig(): ThresholdConfig {
    return { ...this.currentConfig };
  }

  setLevel(level: DeveloperLevel): void {
    this.currentConfig = { ...DEFAULT_THRESHOLDS[level] };
  }

  getBlindApprovalTime(): number {
    return this.currentConfig.blindApprovalTime;
  }

  getMaxAIPercentage(): number {
    return this.currentConfig.maxAIPercentage;
  }

  getMinReviewTime(): number {
    return this.currentConfig.minReviewTime;
  }

  getStreakThreshold(): number {
    return this.currentConfig.streakThreshold;
  }

  setBlindApprovalTime(ms: number): void {
    this.currentConfig.blindApprovalTime = Math.max(500, Math.min(ms, 10000));
  }

  setMaxAIPercentage(percentage: number): void {
    this.currentConfig.maxAIPercentage = Math.max(20, Math.min(percentage, 100));
  }

  setMinReviewTime(ms: number): void {
    this.currentConfig.minReviewTime = Math.max(500, Math.min(ms, 10000));
  }

  setStreakThreshold(count: number): void {
    this.currentConfig.streakThreshold = Math.max(2, Math.min(count, 10));
  }

  isAIPercentageExceeded(percentage: number): boolean {
    return percentage > this.currentConfig.maxAIPercentage;
  }

  isReviewTimeBelowThreshold(ms: number): boolean {
    return ms < this.currentConfig.minReviewTime;
  }

  checkMetrics(metrics: DailyMetrics): {
    aiPercentageExceeded: boolean;
    reviewTimeLow: boolean;
    blindApprovalsHigh: boolean;
  } {
    return {
      aiPercentageExceeded: this.isAIPercentageExceeded(metrics.aiPercentage),
      reviewTimeLow: this.isReviewTimeBelowThreshold(metrics.averageReviewTime),
      blindApprovalsHigh: false  // Disabled - no longer tracked
    };
  }

  static getRecommendedThresholds(level: DeveloperLevel): ThresholdConfig {
    return { ...DEFAULT_THRESHOLDS[level] };
  }

  static getAllLevelThresholds(): Record<DeveloperLevel, ThresholdConfig> {
    return {
      [DeveloperLevel.Junior]: { ...DEFAULT_THRESHOLDS[DeveloperLevel.Junior] },
      [DeveloperLevel.Mid]: { ...DEFAULT_THRESHOLDS[DeveloperLevel.Mid] },
      [DeveloperLevel.Senior]: { ...DEFAULT_THRESHOLDS[DeveloperLevel.Senior] }
    };
  }

  suggestAdaptiveThreshold(recentMetrics: DailyMetrics[]): {
    blindApprovalTime: number;
    reasoning: string;
  } {
    if (recentMetrics.length === 0) {
      return {
        blindApprovalTime: this.currentConfig.blindApprovalTime,
        reasoning: 'Not enough data for adaptive suggestion'
      };
    }

    // Calculate average review time
    const avgReviewTime =
      recentMetrics.reduce((sum, m) => sum + m.averageReviewTime, 0) / recentMetrics.length;

    // Note: Blind approval tracking disabled

    // If review time is consistently high, can be more lenient
    if (avgReviewTime > this.currentConfig.minReviewTime * 2) {
      return {
        blindApprovalTime: Math.min(
          this.currentConfig.blindApprovalTime + 500,
          this.currentConfig.blindApprovalTime * 1.5
        ),
        reasoning:
          'Your review times are consistently high - you can afford slightly faster reviews'
      };
    }

    // Note: Blind approval threshold suggestion disabled

    return {
      blindApprovalTime: this.currentConfig.blindApprovalTime,
      reasoning: 'Current threshold seems appropriate for your review patterns'
    };
  }

  export(): ThresholdConfig {
    return { ...this.currentConfig };
  }

  import(config: ThresholdConfig): void {
    this.currentConfig = { ...config };
  }
}
