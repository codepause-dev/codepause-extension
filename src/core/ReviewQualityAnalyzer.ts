/**
 * ReviewQualityAnalyzer
 * Calculates review quality scores using a 4-factor weighted algorithm
 */

import {
  TrackingEvent,
  ReviewQuality,
  ThresholdConfig
} from '../types';

/**
 * Review quality analysis result
 */
export interface ReviewQualityAnalysis {
  score: number; // 0-100
  category: ReviewQuality;
  factors: {
    timeScore: number; // 0-100
    complexityScore: number; // 0-100
    patternScore: number; // 0-100
    contextScore: number; // 0-100
  };
  expectedReviewTime: number; // milliseconds
  actualReviewTime: number; // milliseconds
  insights: string[];
}

/**
 * Language complexity multipliers for code review time calculations
 *
 * These multipliers adjust expected review time based on programming language complexity.
 * Higher multiplier = More review time needed per line of code.
 *
 * Example: Rust (2.0x) requires twice the review time compared to baseline (1.0x)
 *
 * Multipliers are based on empirical research across 6 factors:
 * - Memory safety (CISA 2024: 70% of C/C++ CVEs are memory-related)
 * - Cyclomatic complexity (TIOBE 2024: 1.5B LOC analyzed)
 * - Bug density (Ray et al. 2014, Reproduction 2019)
 * - Learning curve & cognitive load (ICSE 2020, ACM 2024)
 * - Type system complexity (TypeScript, Rust, Scala studies)
 * - Error handling patterns (Go Survey 2024)
 *
 * 📖 Full research, methodology, and citations: /LANGUAGE_COMPLEXITY.md
 */
const LANGUAGE_COMPLEXITY: Record<string, number> = {
  // HIGHEST COMPLEXITY (1.7-2.0x)
  rust: 2.0,     // Memory safety + steep learning curve + borrow checker complexity
  cpp: 1.8,      // Manual memory management + 70% of vulnerabilities + legacy complexity
  c: 1.7,        // Manual memory management + buffer overflow risks + position 2 in cyclomatic complexity
  scala: 1.7,    // Steep learning curve + advanced FP + complex type system + low defect rate

  // HIGH COMPLEXITY (1.4-1.6x)
  java: 1.6,     // Verbose + mean cyclomatic complexity 4.11 + well-established patterns
  typescript: 1.5, // Structural typing + 15-19% type-related bugs in JS + added complexity layer
  javascript: 1.5, // Poor overall quality + dynamic typing + inconsistent patterns
  csharp: 1.5,   // Similar to Java + unified type system + .NET complexity
  swift: 1.4,    // Multi-paradigm + complex language + similarities to Scala/Haskell
  kotlin: 1.4,   // Modern features + different from Java despite similarity
  python: 1.4,   // Easy to learn but dynamic typing hides issues + higher defect rates
  go: 1.4,       // Error handling verbosity (13% cite as biggest challenge) + explicit patterns

  // MODERATE COMPLEXITY (1.2-1.3x)
  ruby: 1.3,     // Mixed learning curve + lower defect rates + dynamic typing
  php: 1.2,      // Simple syntax + easy to learn + beginner-friendly

  // BASELINE
  default: 1.0   // Unknown or emerging languages use baseline multiplier
};

/**
 * Review time per line of code (milliseconds)
 */
const BASE_REVIEW_TIME_PER_LINE = 500; // 500ms per line

/**
 * Weights for each factor in final score calculation
 */
const WEIGHTS = {
  time: 0.40,       // 40%
  complexity: 0.30, // 30%
  pattern: 0.20,    // 20%
  context: 0.10     // 10%
};

/**
 * Score thresholds for review quality categories
 */
const CATEGORY_THRESHOLDS = {
  thorough: 70,  // 70-100: Thorough review
  light: 40      // 40-69: Light review, 0-39: None
};

export class ReviewQualityAnalyzer {
  private recentAcceptances: TrackingEvent[] = [];
  private readonly recentWindow = 10; // Last 10 acceptances

  constructor(private thresholds: ThresholdConfig) {}

  updateThresholds(thresholds: ThresholdConfig): void {
    this.thresholds = thresholds;
  }

  /**
   * Analyze review quality for a suggestion acceptance event
   */
  analyze(event: TrackingEvent, context?: {
    fileWasOpen?: boolean;
    isAgentMode?: boolean;
    agentSessionId?: string;
  }): ReviewQualityAnalysis {
    // Track this acceptance
    this.recentAcceptances.push(event);
    if (this.recentAcceptances.length > this.recentWindow) {
      this.recentAcceptances.shift();
    }

    // Calculate expected review time
    const expectedReviewTime = this.calculateExpectedReviewTime(event);
    const actualReviewTime = event.acceptanceTimeDelta ?? 0;

    // Calculate individual factor scores
    const timeScore = this.calculateTimeScore(actualReviewTime, expectedReviewTime);
    const complexityScore = this.calculateComplexityScore(event, actualReviewTime);
    const patternScore = this.calculatePatternScore();
    const contextScore = this.calculateContextScore(context);

    // Calculate weighted final score
    const score = Math.round(
      timeScore * WEIGHTS.time +
      complexityScore * WEIGHTS.complexity +
      patternScore * WEIGHTS.pattern +
      contextScore * WEIGHTS.context
    );

    // Determine category
    const category = this.determineCategory(score);

    // Generate insights
    const insights = this.generateInsights({
      score,
      category,
      timeScore,
      complexityScore,
      patternScore,
      contextScore,
      expectedReviewTime,
      actualReviewTime,
      event,
      context
    });

    return {
      score,
      category,
      factors: {
        timeScore,
        complexityScore,
        patternScore,
        contextScore
      },
      expectedReviewTime,
      actualReviewTime,
      insights
    };
  }

  /**
   * Factor 1: Time Score (40%)
   * Sigmoid function to score based on actual vs expected review time
   */
  private calculateTimeScore(actualTime: number, expectedTime: number): number {
    // If review time is unknown (0 or missing), return neutral score instead of 0
    // This is better than penalizing users when we simply don't have the data
    if (actualTime <= 0 || expectedTime <= 0) {
      return 50; // Neutral score - "unknown, benefit of the doubt"
    }

    // Ratio of actual to expected time
    const ratio = actualTime / expectedTime;

    // Sigmoid function: 100 / (1 + e^(-k(x-1)))
    // This gives:
    // - ratio = 1.0 → score ≈ 50
    // - ratio > 1.0 → score increases (more time = better)
    // - ratio < 1.0 → score decreases (less time = worse)
    const k = 3; // Steepness of sigmoid curve
    const score = 100 / (1 + Math.exp(-k * (ratio - 1)));

    return Math.min(100, Math.max(0, Math.round(score)));
  }

  /**
   * Factor 2: Complexity Score (30%)
   * Score based on whether review time matches code complexity
   */
  private calculateComplexityScore(event: TrackingEvent, actualTime: number): number {
    const lines = event.linesOfCode ?? 0;
    if (lines === 0) {
      return 50; // Neutral score for unknown lines
    }

    if (actualTime <= 0) {
      // No review time data - use heuristic based on file size
      // Small files (< 20 lines) are easier to review, large files harder
      if (lines < 20) {
        return 70; // Likely reviewed (small change)
      } else if (lines < 50) {
        return 50; // Uncertain (medium change)
      } else {
        return 30; // Likely not thoroughly reviewed (large change)
      }
    }

    // Minimum review time based on complexity
    const minReviewTime = this.calculateMinimumReviewTime(event);

    // If actual time meets or exceeds minimum, score is high
    if (actualTime >= minReviewTime) {
      return 100;
    }

    // Otherwise, score proportional to how much of minimum was met
    const score = (actualTime / minReviewTime) * 100;
    return Math.round(Math.min(100, score));
  }

  /**
   * Factor 3: Pattern Score (20%)
   * Score based on recent review patterns (are they consistently reviewing?)
   */
  private calculatePatternScore(): number {
    if (this.recentAcceptances.length < 3) {
      return 50; // Neutral score, not enough data
    }

    // Count how many recent acceptances had adequate review time
    const adequateReviews = this.recentAcceptances.filter(e => {
      const expectedTime = this.calculateExpectedReviewTime(e);
      const actualTime = e.acceptanceTimeDelta ?? 0;
      return actualTime >= expectedTime * 0.5; // At least 50% of expected
    }).length;

    // Score based on percentage of adequate reviews
    const percentage = adequateReviews / this.recentAcceptances.length;
    return Math.round(percentage * 100);
  }

  /**
   * Factor 4: Context Score (10%)
   * Score based on file open/closed status and agent mode
   */
  private calculateContextScore(context?: {
    fileWasOpen?: boolean;
    isAgentMode?: boolean;
    agentSessionId?: string;
  }): number {
    if (!context) {
      return 50; // Neutral score, no context available
    }

    let score = 50; // Start neutral

    // File was open = better (developer saw the code in editor)
    if (context.fileWasOpen === true) {
      score += 30;
    } else if (context.fileWasOpen === false) {
      score -= 30;
    }

    // Agent mode = worse (auto-accepted without immediate review)
    if (context.isAgentMode === true) {
      score -= 40;
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Calculate expected review time based on code characteristics
   */
  private calculateExpectedReviewTime(event: TrackingEvent): number {
    const lines = event.linesOfCode ?? 1;
    const language = event.language?.toLowerCase() ?? 'default';

    // Base time: 500ms per line
    let expectedTime = lines * BASE_REVIEW_TIME_PER_LINE;

    // Apply language complexity multiplier
    const multiplier = LANGUAGE_COMPLEXITY[language] ?? LANGUAGE_COMPLEXITY.default;
    expectedTime *= multiplier;

    // Minimum floor based on experience level
    const minTime = this.thresholds.minReviewTime;

    return Math.max(expectedTime, minTime);
  }

  /**
   * Calculate minimum review time considering complexity
   */
  private calculateMinimumReviewTime(event: TrackingEvent): number {
    const lines = event.linesOfCode ?? 1;
    const language = event.language?.toLowerCase() ?? 'default';

    // Base time: 500ms per line
    let minTime = lines * BASE_REVIEW_TIME_PER_LINE;

    // Apply language complexity multiplier
    const complexLanguages = ['typescript', 'javascript', 'python', 'java', 'cpp', 'rust'];
    if (language && complexLanguages.includes(language)) {
      minTime *= 1.5; // 50% more time for complex languages
    }

    // Absolute minimum based on experience level
    const floor = this.thresholds.minReviewTime;

    return Math.max(minTime, floor);
  }

  /**
   * Determine review quality category based on score
   */
  private determineCategory(score: number): ReviewQuality {
    if (score >= CATEGORY_THRESHOLDS.thorough) {
      return ReviewQuality.Thorough;
    } else if (score >= CATEGORY_THRESHOLDS.light) {
      return ReviewQuality.Light;
    } else {
      return ReviewQuality.None;
    }
  }

  /**
   * Generate human-readable insights about the review quality
   */
  private generateInsights(params: {
    score: number;
    category: ReviewQuality;
    timeScore: number;
    complexityScore: number;
    patternScore: number;
    contextScore: number;
    expectedReviewTime: number;
    actualReviewTime: number;
    event: TrackingEvent;
    context?: {
      fileWasOpen?: boolean;
      isAgentMode?: boolean;
      agentSessionId?: string;
    };
  }): string[] {
    const insights: string[] = [];

    const {
      category,
      timeScore,
      complexityScore,
      patternScore,
      expectedReviewTime,
      actualReviewTime,
      event,
      context
    } = params;

    // Overall assessment
    if (category === ReviewQuality.Thorough) {
      insights.push('✅ Thorough review - code ownership maintained');
    } else if (category === ReviewQuality.Light) {
      insights.push('⚠️ Light review - minimal review, some risk');
    } else {
      insights.push('🚨 No review - ownership shifted to AI');
    }

    // Time factor insights
    if (timeScore < 40) {
      const seconds = Math.round(expectedReviewTime / 1000);
      insights.push(`⏱️ Insufficient review time (expected ~${seconds}s)`);
    } else if (timeScore > 80) {
      insights.push('⏱️ Adequate time spent reviewing');
    }

    // Complexity factor insights
    if (complexityScore < 40) {
      insights.push(`🔍 Review time didn't match code complexity (${event.linesOfCode ?? 0} lines)`);
    }

    // Pattern factor insights
    if (patternScore < 40) {
      insights.push('📊 Pattern of rapid acceptances detected');
    } else if (patternScore > 80) {
      insights.push('📊 Consistent review pattern maintained');
    }

    // Context factor insights
    if (context?.isAgentMode) {
      insights.push('🤖 Agent mode - code auto-accepted without immediate review');
    }

    if (context?.fileWasOpen === false) {
      insights.push('📄 File was closed during acceptance');
    }

    // Lines of code insight
    const lines = event.linesOfCode ?? 0;
    if (lines > 50 && actualReviewTime < 10000) {
      insights.push(`⚠️ Large code change (${lines} lines) reviewed very quickly`);
    }

    return insights;
  }

  /**
   * Get statistics about recent review patterns
   */
  getStats(): {
    recentCount: number;
    averageScore: number;
    thoroughCount: number;
    lightCount: number;
    noneCount: number;
  } {
    const recentCount = this.recentAcceptances.length;

    if (recentCount === 0) {
      return {
        recentCount: 0,
        averageScore: 0,
        thoroughCount: 0,
        lightCount: 0,
        noneCount: 0
      };
    }

    let totalScore = 0;
    let thoroughCount = 0;
    let lightCount = 0;
    let noneCount = 0;

    for (const event of this.recentAcceptances) {
      const analysis = this.analyze(event);
      totalScore += analysis.score;

      if (analysis.category === ReviewQuality.Thorough) {
        thoroughCount++;
      } else if (analysis.category === ReviewQuality.Light) {
        lightCount++;
      } else {
        noneCount++;
      }
    }

    return {
      recentCount,
      averageScore: Math.round(totalScore / recentCount),
      thoroughCount,
      lightCount,
      noneCount
    };
  }

  /**
   * Reset the analyzer (clear recent acceptances)
   */
  reset(): void {
    this.recentAcceptances = [];
  }
}
