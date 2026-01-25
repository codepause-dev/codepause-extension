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
  EventType,
  CodeSource
} from '../types';

export class MetricsRepository {
  // BUG #3 FIX: Add caching to prevent excessive database queries
  private dailyMetricsCache: {
    date: string;
    data: DailyMetrics | null;
    timestamp: number;
  } | null = null;
  private readonly CACHE_DURATION_MS = 3000; // 3 seconds cache

  constructor(private db: DatabaseManager) {}

  async recordEvent(event: TrackingEvent): Promise<number> {
    return await this.db.insertEvent(event);
  }

  async getDailyMetrics(date: string): Promise<DailyMetrics | null> {
    // BUG #3 FIX: Check cache first
    if (this.dailyMetricsCache &&
        this.dailyMetricsCache.date === date &&
        Date.now() - this.dailyMetricsCache.timestamp < this.CACHE_DURATION_MS) {
      return this.dailyMetricsCache.data;
    }

    // Cache miss - fetch from database
    const data = await this.db.getDailyMetrics(date);

    // Update cache
    this.dailyMetricsCache = {
      date,
      data,
      timestamp: Date.now()
    };

    return data;
  }

  async getTodayMetrics(): Promise<DailyMetrics | null> {
    const today = this.getTodayString();
    return await this.getDailyMetrics(today);
  }

  /**
   * Get yesterday's metrics for continuity display
   * Returns null if no data available (e.g., first day, weekend gap)
   */
  async getYesterdayMetrics(): Promise<DailyMetrics | null> {
    try {
      const yesterday = this.getDateStringDaysAgo(1);
      const metrics = await this.getDailyMetrics(yesterday);

      // Check if yesterday actually had activity
      // (getDailyMetrics returns empty metrics if no events)
      if (!metrics || (metrics.totalAILines === 0 && metrics.totalManualLines === 0)) {
        return null; // No activity yesterday
      }

      return metrics;
    } catch (error) {
      console.error('[MetricsRepository] Failed to fetch yesterday metrics:', error);
      return null; // Graceful degradation
    }
  }

  async getLastNDaysMetrics(days: number): Promise<DailyMetrics[]> {
    const endDate = this.getTodayString();
    const startDate = this.getDateStringDaysAgo(days);
    return await this.db.getDailyMetricsRange(startDate, endDate);
  }

  /**
   * Calculate current streak of balanced AI usage
   * A "balanced day" is defined as:
   * - Junior: < 60% AI
   * - Mid: < 50% AI
   * - Senior: < 40% AI
   *
   * Streak counts consecutive days of balanced usage
   */
  async calculateStreakDays(experienceLevel: 'junior' | 'mid' | 'senior'): Promise<number> {
    try {
      const threshold = experienceLevel === 'junior' ? 60 :
                        experienceLevel === 'mid' ? 50 : 40;

      let streak = 0;
      const checkDate = new Date();

      // Go backwards from today, counting consecutive balanced days
      for (let i = 0; i < 90; i++) { // Check up to 90 days back
        const dateString = checkDate.toISOString().split('T')[0];
        const metrics = await this.getDailyMetrics(dateString);

        // Check if this day had activity and was balanced
        const hadActivity = metrics && (metrics.totalAILines > 0 || metrics.totalManualLines > 0);
        const wasBalanced = metrics && metrics.aiPercentage < threshold;

        if (hadActivity && wasBalanced) {
          streak++;
        } else if (hadActivity && !wasBalanced) {
          // Streak broken - unbalanced day
          break;
        }
        // No activity = skip (weekends/days off don't break streak)

        // Move to previous day
        checkDate.setDate(checkDate.getDate() - 1);
      }

      return streak;
    } catch (error) {
      console.error('[MetricsRepository] Failed to calculate streak:', error);
      return 0;
    }
  }

  async calculateDailyMetrics(date: string): Promise<DailyMetrics> {
    // FIX: Use proper timestamp range to avoid timezone issues
    // Parse date as UTC to ensure consistent behavior across timezones
    const dateObj = new Date(date + 'T00:00:00.000Z');
    const startOfDay = dateObj.getTime();
    const endOfDay = startOfDay + (24 * 60 * 60 * 1000) - 1; // 86399999ms = 23:59:59.999


    // Use getEventsByDateRange which takes timestamps directly
    const events = await this.db.getEventsByDateRange(startOfDay, endOfDay);


    // Calculate metrics from events
    const metrics = await this.calculateMetricsFromEvents(date, events);

    // Store calculated metrics
    await this.db.insertOrUpdateDailyMetrics(metrics);

    // Invalidate cache after calculating new metrics
    this.invalidateCache();

    return metrics;
  }

  // BUG #3 FIX: Invalidate cache when data changes
  public invalidateCache(): void {
    this.dailyMetricsCache = null;
  }

  private async calculateMetricsFromEvents(date: string, events: TrackingEvent[]): Promise<DailyMetrics> {

    // CRITICAL FIX: Filter events to ONLY include the exact date
    // This prevents timezone issues from including events from adjacent days
    const targetDate = date; // YYYY-MM-DD format
    const dateFilteredEvents = events.filter(event => {
      const eventDate = new Date(event.timestamp).toISOString().split('T')[0];
      const matches = eventDate === targetDate;
      return matches;
    });

    // BUG #1 FIX: Use file-level totals instead of event-based totals
    // Events can be duplicated (inline-completion-api + external-file-change for same edit)
    // File-level data in file_review_status table is the source of truth

    // AUTHORSHIP FIX: Query ALL files for authorship calculation (both reviewed and unreviewed)
    // Authorship balance should reflect all code written today, not just unreviewed code
    const allFilesForAuthorship = await this.db.getAllFilesForDate(date);

    // Calculate total AI lines from ALL files with changes today (reviewed or not)
    // Filter: has changes AND timestamp is within this date
    const dayStart = new Date(date + 'T00:00:00.000Z').getTime();
    const dayEnd = dayStart + 86399999;

    const totalAILines = allFilesForAuthorship.reduce((sum: number, file) => {
      const hasChanges = (file.linesAdded || 0) > 0 || (file.linesRemoved || 0) > 0;
      const timestamp = file.firstGeneratedAt || 0;
      const isFromThisDate = timestamp >= dayStart && timestamp <= dayEnd;
      // Count TOTAL AI activity: additions + deletions (both are AI changes)
      return sum + (hasChanges && isFromThisDate ? ((file.linesAdded || 0) + (file.linesRemoved || 0)) : 0);
    }, 0);


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

    const realTimeEvents = dateFilteredEvents.filter(event => {
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

      if (!toolMetrics) {
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

          // Count lines: use linesChanged (includes both additions and deletions) or fallback to linesOfCode + linesRemoved
          const totalLinesChanged = event.linesChanged ?? ((event.linesOfCode ?? 0) + (event.linesRemoved ?? 0));

          if (totalLinesChanged > 0) {
            // Check if this is manual code or AI-generated
            // CRITICAL: Check BOTH event.source AND metadata.manual
            // - event.source: Unified source (CodeSource.AI vs CodeSource.Manual)
            // - metadata.manual: Manual detection override
            const isManualCode = event.source === CodeSource.Manual || metadata?.manual === true;

            if (isManualCode) {
              // Manual code - count separately
              totalManualLines += totalLinesChanged;
            } else {
              // BUG #1 FIX: Don't sum totalAILines from events (causes duplicate counting)
              // AI lines are now calculated from file-level data above
              // totalAILines += totalLinesChanged;  // REMOVED - causes overcounting

              // Still track tool-level metrics for breakdown
              toolMetrics.linesGenerated += totalLinesChanged;
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

          // AVG QUICK REVIEW FIX: Exclude agent mode from quick review calculation
          // Quick review should only measure inline autocomplete and copy/paste, not agent-generated files
          // Agent mode indicators:
          // 1. isAgentMode flag explicitly set
          // 2. external-file-change detection (file modified while closed)
          // 3. File was closed during modification (fileWasOpen === false)
          // 4. Closed file modifications or file creation events
          // 5. isAgentGenerated flag (Claude/agent generated the code)
          const isAgentMode = event.isAgentMode === true ||
                             event.detectionMethod === 'external-file-change' ||
                             metadata?.isAgentMode === true ||
                             event.fileWasOpen === false ||
                             metadata?.closedFileModification === true ||
                             metadata?.fileCreation === true ||
                             (event as any).isAgentGenerated === true ||
                             metadata?.isAgentGenerated === true;

          if (event.acceptanceTimeDelta !== undefined && event.acceptanceTimeDelta !== null &&
              !isFileCreation && !isAgentMode) {
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
            }
          }
          break;
        }

        case EventType.SuggestionRejected:
          toolMetrics.rejectedCount++;
          break;

        case EventType.CodeGenerated: {
          // Count lines: use linesChanged (includes both additions and deletions) or fallback
          const codeGenLinesChanged = event.linesChanged ?? ((event.linesOfCode ?? 0) + (event.linesRemoved ?? 0));

          if (codeGenLinesChanged > 0) {
            // Check if this is manual code or AI-generated
            // CRITICAL: Check BOTH event.source AND metadata.manual
            // - event.source: Unified source (CodeSource.AI vs CodeSource.Manual)
            // - metadata.manual: Manual detection override
            const isManualCode = event.source === CodeSource.Manual || metadata?.manual === true;

            if (isManualCode) {
              // Manual code written by user
              totalManualLines += codeGenLinesChanged;
            } else {
              // BUG #1 FIX: Don't sum totalAILines from events (causes duplicate counting)
              // AI lines are now calculated from file-level data above
              // totalAILines += codeGenLinesChanged;  // REMOVED - causes overcounting

              // Still track tool-level metrics for breakdown
              toolMetrics.linesGenerated += codeGenLinesChanged;

              // CRITICAL FIX: CodeGenerated events should also count as AI suggestions
              // Agent mode generates entire files/blocks - these ARE AI suggestions
              if (!suggestionId || !seenSuggestionIds.has(suggestionId)) {
                // Count as a suggestion if we haven't seen this file/session
                toolMetrics.suggestionCount++;
                if (suggestionId) {
                  seenSuggestionIds.add(suggestionId);
                }
              }
            }
          }
          break;
        }
      }
    }

    // Separate inline completion review time from file review time
    let averageReviewTime = 0;
    if (reviewTimeCount > 0 && totalReviewTime >= 0) {
      averageReviewTime = totalReviewTime / reviewTimeCount;

      // Sanity check: if average is unreasonably high (> 5 minutes), reset
      const MAX_REASONABLE_INLINE_AVG = 5 * 60 * 1000;
      if (averageReviewTime > MAX_REASONABLE_INLINE_AVG) {
        averageReviewTime = 0;
      }
    }

    // Calculate file review time separately
    // CRITICAL FIX: Include files with review time regardless of current isReviewed status
    // A file may have been reviewed previously and now needs re-review after new AI code
    // The time already spent reviewing should still count toward the average
    const reviewedFilesForAvg = await this.getFileReviewsForDate(date);
    const reviewedFilesWithTime = reviewedFilesForAvg.filter(f => f.totalReviewTime > 0);

    let totalFileReviewTime = 0;
    let fileReviewCount = 0;
    let averageFileReviewTime = 0;

    for (const file of reviewedFilesWithTime) {
      totalFileReviewTime += file.totalReviewTime;
      fileReviewCount++;
    }

    if (fileReviewCount > 0) {
      averageFileReviewTime = totalFileReviewTime / fileReviewCount;

      // Sanity check: if average is unreasonably high (> 1 hour), reset
      const MAX_REASONABLE_FILE_AVG = 60 * 60 * 1000;
      if (averageFileReviewTime > MAX_REASONABLE_FILE_AVG) {
        averageFileReviewTime = 0;
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

      // CRITICAL FIX: Use linesSinceReview for unreviewed lines calculation
      // This correctly tracks NEW unreviewed lines after modifications
      // linesSinceReview = lines added since last review (0 if fully reviewed)
      const fileUnreviewedLines = file.linesSinceReview || 0;
      unreviewedLines += fileUnreviewedLines;

      // Calculate effective review score based on reviewed portion
      // If file has new unreviewed lines, adjust the score proportionally
      const fileGeneratedLines = file.linesGenerated || 0;
      if (fileGeneratedLines > 0) {
        // BUG FIX: Clamp reviewedLines to prevent negative values
        // This can happen if linesSinceReview > linesGenerated due to tracking bugs
        const reviewedLines = Math.max(0, fileGeneratedLines - fileUnreviewedLines);
        // Clamp reviewedPortion to [0, 1] range for safety
        const reviewedPortion = Math.min(1, Math.max(0, reviewedLines / fileGeneratedLines));
        // Effective score = original score * reviewed portion
        // e.g., If 100% score but only 60% reviewed, effective = 60%
        const effectiveScore = (file.reviewScore || 0) * reviewedPortion;
        totalReviewScore += effectiveScore;
      } else {
        totalReviewScore += file.reviewScore || 0;
      }
    }

    // If no measurable files, return undefined (N/A)
    // Don't calculate score from terminal files that haven't been opened yet
    // BUG FIX: Clamp final score to [0, 100] range to prevent negative ownership scores
    const reviewQualityScore = measurableFiles.length === 0
      ? undefined  // No measurable files = N/A
      : Math.max(0, Math.min(100, Math.round(totalReviewScore / measurableFiles.length)));

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
      averageReviewTime, // Inline completion review time only
      sessionCount: 0, // Will be calculated separately
      toolBreakdown,
      reviewQualityScore,
      unreviewedLines: fileReviews.length === 0 ? undefined : unreviewedLines,
      unreviewedPercentage,
      // NEW: Separate file review time metric
      averageFileReviewTime: fileReviewCount > 0 ? averageFileReviewTime : undefined,
      reviewedFilesCount: fileReviewCount > 0 ? fileReviewCount : undefined
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

  async getFileReviewStatus(filePath: string, tool: string, date: string): Promise<any | null> {
    const allReviews = await this.db.getFileReviewsForDate(date);
    return allReviews.find((r: any) => r.filePath === filePath && r.tool === tool) || null;
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
   * @param reviewMethod - 'manual' (user clicked button) or 'automatic' (system detected proper review)
   * @param actualReviewTime - Actual time spent reviewing (from FileReviewSessionTracker), if not provided calculates expected time
   */
  async markFileAsReviewed(filePath: string, tool: string, date: string, developerLevel?: string, reviewMethod: 'manual' | 'automatic' = 'manual', actualReviewTime?: number): Promise<void> {
    return await this.db.markFileAsReviewed(filePath, tool, date, developerLevel, reviewMethod, actualReviewTime);
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
    const totalUnreviewedLines = unreviewedFiles.reduce((sum: number, f: any) => sum + (f.linesSinceReview || 0), 0);

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

    // Only include days with actual AI activity for review score average
    const daysWithAIActivity = last7Days.filter((d: any) => d.totalAILines > 0);
    const reviewScores = daysWithAIActivity
      .map((d: any) => d.reviewQualityScore)
      .filter((score: any) => score !== undefined && score !== null);

    // Calculate component scores
    const avgAIPercent = this.average(last7Days.map((d: any) => d.aiPercentage));
    const aiBalanceScore = this.calculateAIBalanceScore(avgAIPercent, threshold.maxAIPercentage);

    // Only average days that had AI activity with review scores
    const avgReviewScore = reviewScores.length > 0
      ? this.average(reviewScores)
      : 50; // Neutral score if no AI activity to review

    const daysWithActivity = last7Days.filter((d: any) => d.totalEvents > 0).length;
    const consistencyScore = (daysWithActivity / 7) * 100;

    // Combined score (weighted: 40% AI balance + 40% review + 20% consistency)
    const score = (aiBalanceScore * 0.4) + (avgReviewScore * 0.4) + (consistencyScore * 0.2);

    // Determine status - detect extreme swings and unhealthy patterns
    let status = 'good';
    const issues: string[] = [];

    // Check for extreme AI days (>80% AI on any single day)
    const extremeAIDays = last7Days.filter((d: any) => d.aiPercentage > 80 && d.totalAILines > 0);

    // Check for high variance (extreme swings between days)
    const aiPercentages = last7Days.filter((d: any) => d.totalEvents > 0).map((d: any) => d.aiPercentage);
    const variance = aiPercentages.length > 1 ? this.calculateVariance(aiPercentages) : 0;
    const hasHighVariance = variance > 1000;

    // Determine status with comprehensive checks
    if (score >= 75 && avgAIPercent < 50 && avgReviewScore >= 70 && extremeAIDays.length === 0) {
      status = 'excellent';
    } else if (
      avgAIPercent > 70 ||
      extremeAIDays.length > 0 ||
      hasHighVariance ||
      (reviewScores.length > 0 && avgReviewScore < 40) ||
      daysWithActivity < 3
    ) {
      status = 'needs-attention';

      if (avgAIPercent > 70) {
        issues.push(`High average AI usage (${avgAIPercent.toFixed(1)}% - target <50%)`);
      }
      if (extremeAIDays.length > 0) {
        issues.push(`${extremeAIDays.length} day${extremeAIDays.length > 1 ? 's' : ''} with >80% AI (AI dependency risk)`);
      }
      if (hasHighVariance) {
        issues.push('Inconsistent AI usage pattern (extreme swings between days)');
      }
      if (reviewScores.length > 0 && avgReviewScore < 40) {
        issues.push(`Low review quality (${avgReviewScore.toFixed(1)}/100 - improve code review)`);
      }
      if (daysWithActivity < 3) {
        issues.push(`Low activity (${daysWithActivity}/7 days - code more regularly)`);
      }
    }

    // Calculate trend
    const firstHalf = last7Days.slice(0, 3);
    const secondHalf = last7Days.slice(4, 7);
    const firstHalfScore = this.average(firstHalf.map((d: any) =>
      (this.calculateAIBalanceScore(d.aiPercentage, threshold.maxAIPercentage) * 0.5) +
      ((d.reviewQualityScore !== undefined ? d.reviewQualityScore : 50) * 0.5)
    ));
    const secondHalfScore = this.average(secondHalf.map((d: any) =>
      (this.calculateAIBalanceScore(d.aiPercentage, threshold.maxAIPercentage) * 0.5) +
      ((d.reviewQualityScore !== undefined ? d.reviewQualityScore : 50) * 0.5)
    ));

    let trend = 'stable';
    if (secondHalfScore > firstHalfScore + 10) {
      trend = 'improving';
    } else if (secondHalfScore < firstHalfScore - 10) {
      trend = 'declining';
    }

    // Generate actionable recommendations based on issues
    const recommendations: string[] = [];
    if (avgAIPercent > 70) {
      recommendations.push('Write more manual code to practice fundamentals and maintain skills');
    }
    if (extremeAIDays.length > 0) {
      recommendations.push('Aim for 30-50% AI assistance - avoid over-reliance on AI tools');
    }
    if (hasHighVariance) {
      recommendations.push('Maintain consistent AI usage patterns for better skill development');
    }
    if (reviewScores.length > 0 && avgReviewScore < 40) {
      recommendations.push('Spend more time reviewing AI code before accepting changes');
    }
    if (daysWithActivity < 3) {
      recommendations.push('Code at least 3-4 days per week to maintain consistency');
    }

    return {
      status,
      score: Math.round(score),
      aiBalanceScore: Math.round(aiBalanceScore),
      reviewQualityScore: Math.round(avgReviewScore),
      consistencyScore: Math.round(consistencyScore),
      trend,
      daysWithActivity,
      // NEW: Detailed issues and recommendations
      issues: issues.length > 0 ? issues : undefined,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
      extremeAIDays: extremeAIDays.length,
      variance: Math.round(variance)
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

  /**
   * Calculate variance of an array of numbers
   * Used to detect inconsistent/extreme swings in AI usage
   */
  private calculateVariance(numbers: number[]): number {
    if (numbers.length === 0) {
      return 0;
    }
    const avg = this.average(numbers);
    const squaredDiffs = numbers.map(n => Math.pow(n - avg, 2));
    return this.average(squaredDiffs);
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
