/**
 * MetricsRepository
 * High-level repository for metrics data operations
 */

import { DatabaseManager } from './DatabaseManager';
import {
  TrackingEvent,
  DailyMetrics,
  ToolMetrics,
  CodingSession,
  AITool,
  EventType
} from '../types';

export class MetricsRepository {
  constructor(private db: DatabaseManager) {}

  async recordEvent(event: TrackingEvent): Promise<number> {
    return await this.db.insertEvent(event);
  }

  async getDailyMetrics(date: string): Promise<DailyMetrics | null> {
    return await this.db.getDailyMetrics(date);
  }

  async getTodayMetrics(): Promise<DailyMetrics | null> {
    const today = this.getTodayString();
    return await this.getDailyMetrics(today);
  }

  async getLastNDaysMetrics(days: number): Promise<DailyMetrics[]> {
    const endDate = this.getTodayString();
    const startDate = this.getDateStringDaysAgo(days);
    return await this.db.getDailyMetricsRange(startDate, endDate);
  }

  async calculateDailyMetrics(date: string): Promise<DailyMetrics> {
    const startOfDay = new Date(date).setHours(0, 0, 0, 0);
    const endOfDay = new Date(date).setHours(23, 59, 59, 999);

    const events = await this.db.getEvents(
      new Date(startOfDay).toISOString().split('T')[0],
      new Date(endOfDay).toISOString().split('T')[0]
    );

    // Calculate metrics from events
    const metrics = await this.calculateMetricsFromEvents(date, events);

    // Store calculated metrics
    await this.db.insertOrUpdateDailyMetrics(metrics);

    return metrics;
  }

  private async calculateMetricsFromEvents(date: string, events: TrackingEvent[]): Promise<DailyMetrics> {
    let totalAILines = 0;
    let totalManualLines = 0; // Changed from const to let - we need to track manual lines!
    let totalReviewTime = 0;
    let reviewTimeCount = 0;

    const toolBreakdown: Record<AITool, ToolMetrics> = {
      [AITool.Copilot]: this.createEmptyToolMetrics(AITool.Copilot),
      [AITool.Cursor]: this.createEmptyToolMetrics(AITool.Cursor),
      [AITool.ClaudeCode]: this.createEmptyToolMetrics(AITool.ClaudeCode)
    };

    // Track unique suggestion IDs to avoid double-counting
    const seenSuggestionIds = new Set<string>();

    // Filter out scanner/historical events - they shouldn't count toward stats
    // BUT: Allow scanner events if they're recent (within last hour) and have proper event types
    // This handles cases where the scanner catches real-time activity
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    const realTimeEvents = events.filter(event => {
      const metadata = event.metadata as any;

      // Always exclude old scanner events (historical scanning)
      if (metadata?.scanner && event.timestamp < oneHourAgo) {
        return false;
      }

      // Allow recent scanner events if they have proper event types (real-time activity caught by scanner)
      if (metadata?.scanner && event.timestamp >= oneHourAgo) {
        // Allow if it's a proper event type (not just file detection)
        return event.eventType === EventType.SuggestionAccepted ||
               event.eventType === EventType.SuggestionDisplayed ||
               event.eventType === EventType.CodeGenerated;
      }

      // Allow file creation events - these ARE valid AI usage!
      // File creation represents AI generating new files, which should be tracked.
      // Only exclude file creation events if they're from an old historical scan
      // (detected after the file was created, not in real-time)
      if (metadata?.fileCreation && metadata?.historicalScan) {
        return false;
      }

      // Allow closed file modifications - these are still user activity (AI modified closed files)
      // They represent real AI usage, just detected differently
      // We'll include them in metrics

      // Include all other events (including file creations)
      return true;
    });


    for (const event of realTimeEvents) {
      // PHASE 2 FIX: Handle unified 'ai' tool from UnifiedAITracker
      // Map 'ai' to 'claude-code' for tool breakdown (generic AI category)
      const toolName = (event.tool === 'ai' as any) ? AITool.ClaudeCode : event.tool;
      const toolMetrics = toolBreakdown[toolName];

      // Safety check: if tool is still not recognized, skip this event
      if (!toolMetrics) {
        console.warn(`[MetricsRepository] Unknown tool: ${event.tool}, skipping event`);
        continue;
      }

      const metadata = event.metadata as any;
      const suggestionId = metadata?.suggestionId;

      switch (event.eventType) {
        case EventType.SuggestionDisplayed:
          // Only count unique suggestions to avoid double-counting (Displayed + Accepted)
          if (suggestionId && !seenSuggestionIds.has(suggestionId)) {
            toolMetrics.suggestionCount++;
            seenSuggestionIds.add(suggestionId);
          } else if (!suggestionId) {
            // No ID provided, count it anyway (fallback)
            toolMetrics.suggestionCount++;
          }
          break;

        case EventType.SuggestionAccepted: {
          toolMetrics.acceptedCount++;

          // BUG FIX #8: For inline completion pattern detection, we only know about
          // the suggestion AFTER it's accepted (no separate "displayed" event).
          // Count it as a suggestion to populate AI Suggestions metric.
          // CRITICAL: Check event.detectionMethod (database column), NOT metadata.detectionMethod
          if (event.detectionMethod === 'inline-completion-api') {
            // Check if we already counted this as displayed
            if (suggestionId && !seenSuggestionIds.has(suggestionId)) {
              toolMetrics.suggestionCount++;
              seenSuggestionIds.add(suggestionId);
            } else if (!suggestionId) {
              // No ID - count as new suggestion
              toolMetrics.suggestionCount++;
            }
          }

          if (event.linesOfCode) {
            // Check if this is manual code or AI-generated
            if (metadata?.manual) {
              // Manual code - count separately
              totalManualLines += event.linesOfCode;
            } else {
              // AI-generated code
              totalAILines += event.linesOfCode;
              toolMetrics.linesGenerated += event.linesOfCode;
            }
          }

          // CRITICAL FIX: Skip blind approval check for file creation
          // File creation happens AFTER terminal acceptance, so we cannot measure
          // the actual review time that happened in the terminal
          // Industry best practice: Only track measurable in-editor review times
          const isFileCreation = metadata?.source === 'file-creation-accepted' ||
                                  !!metadata?.closedFileModification || // Truthy check (handles 1 or true)
                                  !!metadata?.newFile || // Truthy check
                                  !!metadata?.fileCreation; // Truthy check

          if (event.acceptanceTimeDelta !== undefined && event.acceptanceTimeDelta !== null && !isFileCreation) {
            // Validate acceptanceTimeDelta - should be reasonable (0 to 5 minutes max)
            const MAX_REASONABLE_REVIEW_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds
            const MIN_REASONABLE_REVIEW_TIME = 0;

            // Only process if acceptanceTimeDelta is defined (not undefined/null)
            if (event.acceptanceTimeDelta !== undefined && event.acceptanceTimeDelta !== null &&
                event.acceptanceTimeDelta >= MIN_REASONABLE_REVIEW_TIME &&
                event.acceptanceTimeDelta <= MAX_REASONABLE_REVIEW_TIME) {
              totalReviewTime += event.acceptanceTimeDelta;
              reviewTimeCount++;

              // Note: Blind approval detection logic removed
              // Detection still happens in BlindApprovalDetector for AlertEngine
            } else if (event.acceptanceTimeDelta !== undefined && event.acceptanceTimeDelta !== null) {
              // Log invalid values for debugging (but not undefined values)
              console.log(`[MetricsRepository] Invalid acceptanceTimeDelta: ${event.acceptanceTimeDelta}ms`);
            }
          }
          break;
        }

        case EventType.SuggestionRejected:
          toolMetrics.rejectedCount++;
          break;

        case EventType.CodeGenerated:
          if (event.linesOfCode) {
            // Check if this is manual code or AI-generated
            if (metadata?.manual) {
              // Manual code written by user
              totalManualLines += event.linesOfCode;
            } else {
              // AI-generated code
              totalAILines += event.linesOfCode;
              toolMetrics.linesGenerated += event.linesOfCode;
            }
          }
          break;
      }
    }

    // Add file review times to average calculation
    // Get all reviewed files for this day and include their review times
    const reviewedFilesForAvg = await this.getFileReviewsForDate(date);
    const reviewedFilesWithTime = reviewedFilesForAvg.filter(f => f.isReviewed && f.totalReviewTime > 0);

    for (const file of reviewedFilesWithTime) {
      totalReviewTime += file.totalReviewTime;
      reviewTimeCount++;
    }

    // Calculate average review time - includes both inline completions AND file reviews
    // If reviewTimeCount is 0 or totalReviewTime is invalid, default to 0
    let averageReviewTime = 0;
    if (reviewTimeCount > 0 && totalReviewTime >= 0) {
      averageReviewTime = totalReviewTime / reviewTimeCount;
      
      // Sanity check: if average is unreasonably high (> 1 hour), something is wrong
      const MAX_REASONABLE_AVG = 60 * 60 * 1000; // 1 hour in milliseconds
      if (averageReviewTime > MAX_REASONABLE_AVG) {
        console.error(`[MetricsRepository] WARNING: Invalid average review time: ${averageReviewTime}ms (${(averageReviewTime/1000).toFixed(1)}s). Review time count: ${reviewTimeCount}, Total: ${totalReviewTime}ms`);
        // Reset to 0 to prevent display of invalid data
        averageReviewTime = 0;
      }
    }
    
    const totalLines = totalAILines + totalManualLines;
    const aiPercentage = totalLines > 0 ? (totalAILines / totalLines) * 100 : 0;

    // Calculate tool-specific averages
    for (const tool of Object.values(AITool)) {
      const metrics = toolBreakdown[tool];
      const toolAcceptedCount = metrics.acceptedCount;

      if (toolAcceptedCount > 0) {
        // Calculate average review time for this tool (only real-time events)
        const toolEvents = realTimeEvents.filter(
          e => e.tool === tool && e.eventType === EventType.SuggestionAccepted
        );

        // Calculate average review time only for events with valid timeDelta
        const MAX_REASONABLE_REVIEW_TIME = 5 * 60 * 1000; // 5 minutes
        const validToolEvents = toolEvents.filter(
          e => e.acceptanceTimeDelta !== undefined && 
               e.acceptanceTimeDelta !== null &&
               e.acceptanceTimeDelta >= 0 &&
               e.acceptanceTimeDelta <= MAX_REASONABLE_REVIEW_TIME
        );

        if (validToolEvents.length > 0) {
          const totalToolReviewTime = validToolEvents.reduce(
            (sum, e) => sum + (e.acceptanceTimeDelta ?? 0),
            0
          );
          metrics.averageReviewTime = totalToolReviewTime / validToolEvents.length;
        } else {
          metrics.averageReviewTime = 0;
        }
      }
    }

    // Calculate review quality metrics
    const fileReviews = await this.getFileReviewsForDate(date);

    // OPTION 2: Only calculate score from files with measurable review data
    // Terminal files (reviewedInTerminal=true) with score=0 are excluded
    // They haven't been opened in editor yet, so we can't measure their quality
    const measurableFiles = fileReviews.filter(file => {
      // Include file if:
      // 1. NOT from terminal workflow, OR
      // 2. FROM terminal but has been opened and reviewed in editor (score > 0)
      return !file.reviewedInTerminal || file.reviewScore > 0;
    });

    let totalReviewScore = 0;
    let unreviewedLines = 0;
    let totalGeneratedLines = 0;

    for (const file of measurableFiles) {
      totalGeneratedLines += file.linesGenerated || 0;

      // Count ALL files with review scores (even if poorly reviewed)
      totalReviewScore += file.reviewScore || 0;

      // Only track "unreviewed lines" for files that truly have NO review (score = 0)
      if (!file.reviewScore || file.reviewScore === 0) {
        unreviewedLines += file.linesGenerated || 0;
      }
    }

    // If no measurable files, return undefined (N/A)
    // Don't calculate score from terminal files that haven't been opened yet
    const reviewQualityScore = measurableFiles.length === 0
      ? undefined  // No measurable files = N/A
      : Math.round(totalReviewScore / measurableFiles.length);  // Average of measurable files only

    const unreviewedPercentage = fileReviews.length === 0
      ? undefined  // No AI files = N/A
      : (totalGeneratedLines > 0
          ? Math.round((unreviewedLines / totalGeneratedLines) * 100)
          : 0);

    // Count unique AI suggestions (not total events)
    // toolMetrics.suggestionCount already has deduplication logic using suggestionId
    // This prevents counting both SuggestionDisplayed AND SuggestionAccepted as 2 suggestions
    const totalAISuggestions = Object.values(toolBreakdown).reduce(
      (sum, tool) => sum + tool.suggestionCount,
      0
    );

    return {
      date,
      totalEvents: realTimeEvents.length, // Total activity (AI + manual)
      totalAISuggestions, // Unique AI suggestions (deduplicated)
      totalAILines,
      totalManualLines,
      aiPercentage,
      averageReviewTime,
      sessionCount: 0, // Will be calculated separately
      toolBreakdown,
      reviewQualityScore,
      unreviewedLines: fileReviews.length === 0 ? undefined : unreviewedLines,
      unreviewedPercentage
    };
  }

  private createEmptyToolMetrics(tool: AITool): ToolMetrics {
    return {
      tool,
      suggestionCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      linesGenerated: 0,
      averageReviewTime: 0
    };
  }

  async getRecentEvents(limit: number = 100): Promise<TrackingEvent[]> {
    return await this.db.getRecentEvents(limit);
  }

  async getEventsForDateRange(startDate: string, endDate: string): Promise<TrackingEvent[]> {
    return await this.db.getEvents(startDate, endDate);
  }

  async saveSession(session: CodingSession): Promise<void> {
    await this.db.insertOrUpdateSession(session);
  }

  async getSession(sessionId: string): Promise<CodingSession | null> {
    return await this.db.getSession(sessionId);
  }

  async getRecentSessions(limit: number = 10): Promise<CodingSession[]> {
    return await this.db.getRecentSessions(limit);
  }

  async getSessionEvents(sessionId: string): Promise<TrackingEvent[]> {
    return await this.db.getSessionEvents(sessionId);
  }

  async getStatsSummary(): Promise<{
    totalEvents: number;
    totalSessions: number;
    databaseSize: number;
  }> {
    return await this.db.getStats();
  }

  async getRealUserEventCount(): Promise<number> {
    const allEvents = await this.db.getRecentEvents(10000);
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    const realEvents = allEvents.filter(event => {
      const metadata = event.metadata as any;

      if (metadata?.scanner && event.timestamp < oneHourAgo) {
        return false;
      }

      if (metadata?.fileCreation) {
        return false;
      }

      // Only count accepted or rejected suggestions - these are actual reviews
      // Displayed suggestions don't count as reviews until the user makes a decision
      return event.eventType === EventType.SuggestionAccepted ||
             event.eventType === EventType.SuggestionRejected;
    });

    return realEvents.length;
  }

  // Note: getBlindApprovalStats removed - blind approval tracking is no longer displayed in dashboard
  // Blind approval detection still happens in AlertEngine for notifications

  /**
   * ENHANCED: Get unreviewed files for a specific date
   * Used by dashboard to show files that need review
   */
  async getUnreviewedFiles(date: string): Promise<any[]> {
    return await this.db.getUnreviewedFiles(date);
  }

  /**
   * Get terminal-reviewed files for a specific date
   * These are files reviewed in the terminal (CLI workflow)
   */
  async getTerminalReviewedFiles(date: string): Promise<any[]> {
    return await this.db.getTerminalReviewedFiles(date);
  }

  async getFileReviewsForDate(date: string): Promise<any[]> {
    return await this.db.getFileReviewsForDate(date);
  }

  async saveFileReviewStatus(status: any): Promise<void> {
    return await this.db.insertOrUpdateFileReviewStatus(status);
  }

  /**
   * ENHANCED: Get recent agent sessions
   * Used by dashboard to show agent activity
   */
  async getRecentAgentSessions(limit: number = 5): Promise<any[]> {
    return await this.db.getRecentAgentSessions(limit);
  }

  /**
   * Manually mark a file as reviewed
   */
  async markFileAsReviewed(filePath: string, tool: string, date: string, developerLevel?: string): Promise<void> {
    return await this.db.markFileAsReviewed(filePath, tool, date, developerLevel);
  }

  /**
   * NEW UX: Get core metrics for improved dashboard
   * Returns the 3 core metrics: Authorship Balance, Code Ownership, Skill Health
   */
  async getCoreMetrics(developerLevel: 'junior' | 'mid' | 'senior', threshold: any): Promise<any> {
    const today = await this.getTodayMetrics();
    const last7Days = await this.getLastNDaysMetrics(7);

    if (!today) {
      return this.getEmptyCoreMetrics(threshold);
    }

    // Core Metric 1: Code Authorship Balance
    const authorship = {
      aiPercentage: today.aiPercentage,
      manualPercentage: 100 - today.aiPercentage,
      aiLines: today.totalAILines,
      manualLines: today.totalManualLines,
      status: this.getAuthorshipStatus(today.aiPercentage, threshold.maxAIPercentage),
      target: threshold.maxAIPercentage
    };

    // Core Metric 2: Code Ownership Score
    const fileReviews = await this.getFileReviewsForDate(this.getTodayString());
    const unreviewedFiles = fileReviews.filter((f: any) => !f.isReviewed && f.reviewScore < 70);
    const totalUnreviewedLines = unreviewedFiles.reduce((sum: number, f: any) => sum + (f.linesOfCode || 0), 0);

    const ownership = {
      score: today.reviewQualityScore || 0,
      category: this.getOwnershipCategory(today.reviewQualityScore || 0),
      unreviewedPercentage: today.unreviewedPercentage || 0,
      unreviewedLines: totalUnreviewedLines,
      filesNeedingReview: unreviewedFiles.length
    };

    // Core Metric 3: Skill Development Health
    const skillHealth = await this.calculateSkillHealth(last7Days, developerLevel, threshold);

    return {
      authorship,
      ownership,
      skillHealth
    };
  }

  /**
   * Calculate Skill Development Health over last 7 days
   */
  private async calculateSkillHealth(
    last7Days: any[],
    _developerLevel: 'junior' | 'mid' | 'senior',
    threshold: any
  ): Promise<any> {
    if (last7Days.length === 0) {
      return {
        status: 'good',
        score: 50,
        aiBalanceScore: 50,
        reviewQualityScore: 50,
        consistencyScore: 0,
        trend: 'stable',
        daysWithActivity: 0
      };
    }

    // Calculate component scores
    const avgAIPercent = this.average(last7Days.map((d: any) => d.aiPercentage));
    const aiBalanceScore = this.calculateAIBalanceScore(avgAIPercent, threshold.maxAIPercentage);

    const avgReviewScore = this.average(last7Days.map((d: any) => d.reviewQualityScore || 0));

    const daysWithActivity = last7Days.filter((d: any) => d.totalEvents > 0).length;
    const consistencyScore = (daysWithActivity / 7) * 100;

    // Combined score (weighted)
    const score = (aiBalanceScore * 0.4) + (avgReviewScore * 0.4) + (consistencyScore * 0.2);

    // Determine status
    let status = 'good';
    if (score >= 75 && avgAIPercent < 50 && avgReviewScore >= 70) {
      status = 'excellent';
    } else if (avgAIPercent > 70 || avgReviewScore < 40 || daysWithActivity < 3) {
      status = 'needs-attention';
    }

    // Calculate trend
    const firstHalf = last7Days.slice(0, 3);
    const secondHalf = last7Days.slice(4, 7);
    const firstHalfScore = this.average(firstHalf.map((d: any) =>
      (this.calculateAIBalanceScore(d.aiPercentage, threshold.maxAIPercentage) * 0.5) +
      ((d.reviewQualityScore || 0) * 0.5)
    ));
    const secondHalfScore = this.average(secondHalf.map((d: any) =>
      (this.calculateAIBalanceScore(d.aiPercentage, threshold.maxAIPercentage) * 0.5) +
      ((d.reviewQualityScore || 0) * 0.5)
    ));

    let trend = 'stable';
    if (secondHalfScore > firstHalfScore + 10) {
      trend = 'improving';
    } else if (secondHalfScore < firstHalfScore - 10) {
      trend = 'declining';
    }

    return {
      status,
      score: Math.round(score),
      aiBalanceScore: Math.round(aiBalanceScore),
      reviewQualityScore: Math.round(avgReviewScore),
      consistencyScore: Math.round(consistencyScore),
      trend,
      daysWithActivity
    };
  }

  /**
   * Calculate AI Balance Score (0-100)
   * Higher score = better balance
   */
  private calculateAIBalanceScore(aiPercent: number, target: number): number {
    if (aiPercent <= target) {
      return 100;
    }
    if (aiPercent <= target + 20) {
      return 100 - ((aiPercent - target) * 2);
    }
    return Math.max(0, 60 - ((aiPercent - target - 20) * 1.5));
  }

  /**
   * Get authorship status indicator
   */
  private getAuthorshipStatus(aiPercent: number, target: number): 'good' | 'warning' | 'over-threshold' {
    if (aiPercent <= target) {
      return 'good';
    }
    if (aiPercent <= target + 10) {
      return 'warning';
    }
    return 'over-threshold';
  }

  /**
   * Get ownership category based on review score
   */
  private getOwnershipCategory(score: number): 'thorough' | 'light' | 'rushed' | 'none' {
    if (score >= 70) {
      return 'thorough';
    }
    if (score >= 40) {
      return 'light';
    }
    if (score > 0) {
      return 'rushed';
    }
    return 'none';
  }

  /**
   * Get empty core metrics (for when there's no data)
   */
  private getEmptyCoreMetrics(threshold: any): any {
    return {
      authorship: {
        aiPercentage: 0,
        manualPercentage: 0,
        aiLines: 0,
        manualLines: 0,
        status: 'good',
        target: threshold.maxAIPercentage
      },
      ownership: {
        score: 0,
        category: 'none',
        unreviewedPercentage: 0,
        unreviewedLines: 0,
        filesNeedingReview: 0
      },
      skillHealth: {
        status: 'good',
        score: 50,
        aiBalanceScore: 50,
        reviewQualityScore: 50,
        consistencyScore: 0,
        trend: 'stable',
        daysWithActivity: 0
      }
    };
  }

  /**
   * Calculate average of an array of numbers
   */
  private average(numbers: number[]): number {
    if (numbers.length === 0) {
      return 0;
    }
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  }

  private getTodayString(): string {
    return new Date().toISOString().split('T')[0];
  }

  private getDateStringDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  }
}
