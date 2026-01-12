/**
 * BlindApprovalDetector
 * Multi-signal approach to detect when developers accept AI suggestions without proper review
 */

import {
  TrackingEvent,
  BlindApprovalDetection,
  BlindApprovalConfidence,
  ThresholdConfig,
  EventType
} from '../types';

export class BlindApprovalDetector {
  private recentAcceptances: TrackingEvent[] = [];
  private readonly recentWindow = 10; // Last 10 acceptances

  constructor(private thresholds: ThresholdConfig) {}

  updateThresholds(thresholds: ThresholdConfig): void {
    this.thresholds = thresholds;
  }

  detect(event: TrackingEvent): BlindApprovalDetection {
    if (event.eventType !== EventType.SuggestionAccepted) {
      return this.createNegativeDetection();
    }

    // Track this acceptance
    this.recentAcceptances.push(event);
    if (this.recentAcceptances.length > this.recentWindow) {
      this.recentAcceptances.shift();
    }

    // Multi-signal detection
    const signals = {
      timeBased: this.detectTimeBasedBlindApproval(event),
      patternBased: this.detectPatternBasedBlindApproval(),
      complexityBased: this.detectComplexityBasedBlindApproval(event)
    };

    // Count triggered signals
    const triggeredCount = Object.values(signals).filter(Boolean).length;

    // Determine confidence
    let confidence: BlindApprovalConfidence;
    if (triggeredCount === 0) {
      return this.createNegativeDetection();
    } else if (triggeredCount === 1) {
      confidence = BlindApprovalConfidence.Low;
    } else if (triggeredCount === 2) {
      confidence = BlindApprovalConfidence.Medium;
    } else {
      confidence = BlindApprovalConfidence.High;
    }

    return {
      isBlindApproval: true,
      confidence,
      timeDelta: event.acceptanceTimeDelta || 0,
      threshold: this.thresholds.blindApprovalTime,
      signals
    };
  }

  /**
   * Signal 1: Time-based detection
   * Accept time < configured threshold
   */
  private detectTimeBasedBlindApproval(event: TrackingEvent): boolean {
    if (!event.acceptanceTimeDelta) {
      return false;
    }

    return event.acceptanceTimeDelta < this.thresholds.blindApprovalTime;
  }

  /**
   * Signal 2: Pattern-based detection
   * 3+ rapid acceptances in last 10 acceptances
   */
  private detectPatternBasedBlindApproval(): boolean {
    if (this.recentAcceptances.length < 3) {
      return false;
    }

    // Count rapid acceptances (< threshold)
    const rapidCount = this.recentAcceptances.filter(
      e => (e.acceptanceTimeDelta || Infinity) < this.thresholds.blindApprovalTime
    ).length;

    return rapidCount >= 3;
  }

  /**
   * Signal 3: Complexity-based detection
   * Review time insufficient for code complexity
   */
  private detectComplexityBasedBlindApproval(event: TrackingEvent): boolean {
    if (!event.acceptanceTimeDelta || !event.linesOfCode) {
      return false;
    }

    // Calculate minimum expected review time based on complexity
    const minReviewTime = this.calculateMinimumReviewTime(event);

    return event.acceptanceTimeDelta < minReviewTime;
  }

  private calculateMinimumReviewTime(event: TrackingEvent): number {
    const lines = event.linesOfCode || 0;

    // Base time: 500ms per line of code (reading speed)
    let minTime = lines * 500;

    // Adjust for language complexity
    const complexLanguages = ['typescript', 'javascript', 'python', 'java', 'cpp', 'rust'];
    if (event.language && complexLanguages.includes(event.language.toLowerCase())) {
      minTime *= 1.5; // 50% more time for complex languages
    }

    // Minimum floor based on experience level
    const floor = this.thresholds.minReviewTime;

    return Math.max(minTime, floor);
  }

  getStats(): {
    recentCount: number;
    recentRapidCount: number;
    averageReviewTime: number;
  } {
    const recentCount = this.recentAcceptances.length;
    const recentRapidCount = this.recentAcceptances.filter(
      e => (e.acceptanceTimeDelta || Infinity) < this.thresholds.blindApprovalTime
    ).length;

    const totalReviewTime = this.recentAcceptances.reduce(
      (sum, e) => sum + (e.acceptanceTimeDelta || 0),
      0
    );
    const averageReviewTime = recentCount > 0 ? totalReviewTime / recentCount : 0;

    return {
      recentCount,
      recentRapidCount,
      averageReviewTime
    };
  }

  isInStreak(): boolean {
    if (this.recentAcceptances.length < this.thresholds.streakThreshold) {
      return false;
    }

    // Check last N acceptances
    const lastN = this.recentAcceptances.slice(-this.thresholds.streakThreshold);

    // All must be rapid acceptances
    return lastN.every(
      e => (e.acceptanceTimeDelta || Infinity) < this.thresholds.blindApprovalTime
    );
  }

  getStreakLength(): number {
    let streak = 0;

    // Count from most recent backwards
    for (let i = this.recentAcceptances.length - 1; i >= 0; i--) {
      const event = this.recentAcceptances[i];

      if ((event.acceptanceTimeDelta || Infinity) < this.thresholds.blindApprovalTime) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }

  reset(): void {
    this.recentAcceptances = [];
  }

  private createNegativeDetection(): BlindApprovalDetection {
    return {
      isBlindApproval: false,
      confidence: BlindApprovalConfidence.Low,
      timeDelta: 0,
      threshold: this.thresholds.blindApprovalTime,
      signals: {
        timeBased: false,
        patternBased: false,
        complexityBased: false
      }
    };
  }
}
