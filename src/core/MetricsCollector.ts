/**
 * MetricsCollector
 * Central hub for collecting and aggregating metrics from all trackers
 */

import { ManualCodeTracker } from '../trackers/ManualCodeTracker';
import { UnifiedAITracker } from '../trackers/UnifiedAITracker';
import { MetricsRepository } from '../storage/MetricsRepository';
import { ConfigManager } from '../config/ConfigManager';
import { ReviewQualityAnalyzer } from './ReviewQualityAnalyzer';
import { AgentSessionDetector } from './AgentSessionDetector';
import { FileReviewTracker } from './FileReviewTracker';
import { FileReviewSessionTracker } from './FileReviewSessionTracker';
import { EventDeduplicator } from '../tracking/EventDeduplicator';
import { TelemetryService } from '../telemetry/TelemetryService';
import {
  TrackingEvent,
  PendingSuggestion,
  CodingSession,
  IMetricsCollector,
  DailyMetrics,
  AITool,
  EventType,
  ReviewQuality,
  EVENT_DEBOUNCE_MS,
  SESSION_IDLE_TIMEOUT_MS,
  DEFAULT_THRESHOLDS
} from '../types';

export class MetricsCollector implements IMetricsCollector {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private trackers: Map<AITool, any> = new Map();
  private manualTracker: ManualCodeTracker | null = null;
  private unifiedAITracker: UnifiedAITracker | null = null;
  private pendingSuggestions: Map<string, PendingSuggestion> = new Map();
  private currentSession: CodingSession | null = null;
  private sessionIdleTimer: NodeJS.Timeout | null = null;
  private aggregationInterval: NodeJS.Timeout | null = null;
  private eventBuffer: TrackingEvent[] = [];
  private isInitialized: boolean = false;
  private eventHandlers: Array<(event: TrackingEvent) => void> = [];

  // Phase 2: Event deduplication using EventDeduplicator (99.99% accurate, tested)
  private eventDeduplicator: EventDeduplicator;

  // New review quality tracking components
  private reviewQualityAnalyzer: ReviewQualityAnalyzer;
  private agentSessionDetector: AgentSessionDetector;
  private fileReviewTracker: FileReviewTracker;
  private fileReviewSessionTracker: FileReviewSessionTracker;
  private telemetryService?: TelemetryService;

  constructor(
    private metricsRepo: MetricsRepository,
    private configManager: ConfigManager,
    telemetryService?: TelemetryService
  ) {
    this.telemetryService = telemetryService;
    // Initialize new components
    const config = this.configManager.getConfig();
    const thresholds = DEFAULT_THRESHOLDS[config.experienceLevel];
    this.reviewQualityAnalyzer = new ReviewQualityAnalyzer(thresholds);
    this.agentSessionDetector = new AgentSessionDetector();
    this.fileReviewTracker = new FileReviewTracker();

    // IMPORTANT: Pass developer level for customized review time thresholds
    this.fileReviewSessionTracker = new FileReviewSessionTracker(config.experienceLevel);

    // Initialize EventDeduplicator (99.99% accurate, tested in Phase 1)
    this.eventDeduplicator = new EventDeduplicator();
  }

  public onEvent(handler: (event: TrackingEvent) => void): void {
    this.eventHandlers.push(handler);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize trackers based on config
      await this.initializeTrackers();

      // Initialize FileReviewSessionTracker (VSCode API hooks)
      this.fileReviewSessionTracker.initialize();

      // FIXED: Set callback for immediate database updates when file is reviewed
      this.fileReviewSessionTracker.setReviewCallback(async (session) => {
        const today = new Date().toISOString().split('T')[0];
        const config = this.configManager.getConfig();

        // Call markFileAsReviewed with 'automatic' review method
        await this.metricsRepo.markFileAsReviewed(
          session.filePath,
          session.tool,
          today,
          config.experienceLevel,
          'automatic' // System detected proper review via file viewing, scrolling, editing
        );

        // ========== CRITICAL FIX: Update in-memory cache ==========
        // This ensures subsequent AI events see isReviewed = true
        // Without this, the cache has stale data causing incorrect linesSinceReview accumulation
        const existingStatus = this.fileReviewTracker.getFileStatus(session.filePath, today, session.tool);
        if (existingStatus) {
          this.fileReviewTracker.updateFileStatus(session.filePath, today, session.tool, {
            isReviewed: true,
            reviewScore: 100,
            reviewQuality: ReviewQuality.Thorough,
            linesSinceReview: 0,
            lastReviewedAt: Date.now()
          });
        } else {
          // Create new cache entry if none exists
          this.fileReviewTracker.trackFile({
            filePath: session.filePath,
            date: today,
            tool: session.tool,
            reviewQuality: ReviewQuality.Thorough,
            reviewScore: 100,
            isReviewed: true,
            linesGenerated: session.linesGenerated || 0,
            linesChanged: session.linesGenerated || 0,
            linesSinceReview: 0,
            charactersCount: 0,
            agentSessionId: session.agentSessionId,
            isAgentGenerated: true,
            wasFileOpen: true,
            firstGeneratedAt: session.generatedAt,
            lastReviewedAt: Date.now(),
            totalReviewTime: session.totalTimeInFocus,
            modificationCount: 0,
            totalTimeInFocus: session.totalTimeInFocus,
            scrollEventCount: session.scrollEventCount,
            cursorMovementCount: session.cursorMovementCount,
            editsMade: session.editsMade,
            reviewSessionsCount: 1,
            reviewedInTerminal: false
          });
        }

        // Track telemetry event for automatic review
        this.telemetryService?.track('file.reviewed', {
          method: 'automatic',
          triggeredBy: 'system',
          reviewScore: session.currentReviewScore,
          reviewQuality: session.currentReviewQuality,
          timeInFocus: session.totalTimeInFocus
        });

      });

      // Restore tracking for unreviewed files on extension startup
      // Without this, files generated before extension reload won't be tracked for auto-review
      await this.restoreUnreviewedFileTracking();

      // Start periodic aggregation
      this.startAggregation();

      // Start a new coding session
      this.startNewSession();

      this.isInitialized = true;
    } catch (error) {
      console.error('[CodePause] Failed to initialize MetricsCollector:', error);
      throw error;
    }
  }

  private async initializeTrackers(): Promise<void> {
    // Initialize UnifiedAITracker (monitors all AI code generation)
    this.unifiedAITracker = new UnifiedAITracker((event: unknown) => this.handleEvent(event as TrackingEvent));
    await this.unifiedAITracker.initialize();

    // Initialize Manual Code tracker (always enabled)
    this.manualTracker = new ManualCodeTracker((event: unknown) => this.handleEvent(event as TrackingEvent));
    await this.manualTracker.initialize();
  }

  /**
   * Restore file tracking state from database on extension startup
   * CRITICAL: Must restore BOTH FileReviewTracker AND FileReviewSessionTracker
   *
   * FileReviewTracker: In-memory cache for isReviewed status and linesSinceReview
   * FileReviewSessionTracker: Active session tracking for auto-review detection
   */
  private async restoreUnreviewedFileTracking(): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Restore ALL files to FileReviewTracker cache
      const allFilesForToday = await this.metricsRepo.getFileReviewsForDate(today);

      if (allFilesForToday.length > 0) {
        for (const file of allFilesForToday) {
          // Restore to FileReviewTracker (in-memory cache)
          this.fileReviewTracker.trackFile({
            filePath: file.filePath,
            date: file.date || today,
            tool: file.tool,
            reviewQuality: file.reviewQuality,
            reviewScore: file.reviewScore,
            isReviewed: file.isReviewed,  // ← Critical: restore reviewed status
            linesGenerated: file.linesGenerated || 0,
            linesChanged: file.linesChanged || 0,
            linesSinceReview: file.linesSinceReview || 0,  // ← Critical: restore lines since review
            charactersCount: file.charactersCount || 0,
            agentSessionId: file.agentSessionId,
            isAgentGenerated: file.isAgentGenerated ?? true,
            wasFileOpen: file.wasFileOpen ?? false,
            firstGeneratedAt: file.firstGeneratedAt,
            lastReviewedAt: file.lastReviewedAt,
            totalReviewTime: file.totalReviewTime || 0,
            language: file.language,
            modificationCount: file.modificationCount || 0,
            totalTimeInFocus: file.totalTimeInFocus || 0,
            scrollEventCount: file.scrollEventCount || 0,
            cursorMovementCount: file.cursorMovementCount || 0,
            editsMade: file.editsMade || false,
            lastOpenedAt: file.lastOpenedAt,
            reviewSessionsCount: file.reviewSessionsCount || 0,
            reviewedInTerminal: file.reviewedInTerminal || false
          });
        }
      }

      // Also restore FileReviewSessionTracker for files that NEED REVIEW
      // This includes:
      // 1. Files that were never reviewed (!isReviewed)
      // 2. Files that have new AI code since last review (linesSinceReview > 0)
      // The second case handles when a file was reviewed but then got new AI code
      const filesNeedingReview = allFilesForToday.filter(f =>
        !f.isReviewed || (f.linesSinceReview && f.linesSinceReview > 0)
      );

      if (filesNeedingReview.length > 0) {
        for (const file of filesNeedingReview) {
          if (!this.fileReviewSessionTracker.isTracking(file.filePath)) {
            this.fileReviewSessionTracker.startTracking(
              file.filePath,
              file.tool,
              file.agentSessionId || 'restored-session',
              file.linesGenerated || 0
            );
          }
        }
      }

      // Initialize timer if currently viewing a tracked file
      this.fileReviewSessionTracker.initializeActiveFileTimer();
    } catch (error) {
      console.error('[CodePause] Failed to restore file tracking:', error);
    }
  }

  private handleEvent(event: TrackingEvent): void {
    // Event deduplication - prevents double-counting
    if (this.eventDeduplicator.isDuplicate(event)) {
      return;
    }

    // Extract metadata for later use
    const metadata = event.metadata as any;
    const isManualCode = metadata?.manual === true || event.source === 'manual';

    // ========== NEW: Review Quality Tracking Integration ==========

    // Step 1: Detect agent mode session
    // IMPORTANT: Skip agent detection for inline completions and manual paste
    // Inline completions (Copilot/Cursor Tab acceptances) are user-reviewed suggestions,
    // NOT autonomous agent mode. Only bulk code gen and closed file mods trigger agent mode.
    // Large paste is manual user action (copy/paste from ChatGPT, Claude web, etc.)
    const isInlineCompletion = event.detectionMethod === 'inline-completion-api';
    const isManualPaste = event.detectionMethod === 'large-paste';

    let agentDetection;
    if (!isInlineCompletion && !isManualPaste) {
      agentDetection = this.agentSessionDetector.processEvent(event);

      if (agentDetection.sessionDetected) {
        event.isAgentMode = true;
        event.agentSessionId = agentDetection.session?.id;
      }
    }

    // Step 2: Analyze review quality for accepted suggestions
    if (event.eventType === EventType.SuggestionAccepted) {
      const context = {
        fileWasOpen: event.fileWasOpen,
        isAgentMode: event.isAgentMode,
        agentSessionId: event.agentSessionId
      };

      const analysis = this.reviewQualityAnalyzer.analyze(event, context);

      // Enrich event with review quality data
      event.reviewQuality = analysis.category;
      event.reviewQualityScore = analysis.score;
      event.isReviewed = analysis.score >= 40;
    }

    // Step 3: Track file review status
    // Only track file review status for AI-generated code, NOT manual code
    if (event.filePath &&
        (event.eventType === EventType.SuggestionAccepted || event.eventType === EventType.CodeGenerated) &&
        !isManualCode) {
      const today = new Date().toISOString().split('T')[0];
      const existingStatus = this.fileReviewTracker.getFileStatus(event.filePath, today, event.tool);

      // Check if this file was created via terminal workflow
      const isFileCreationFromTerminal = metadata?.source === 'file-creation-accepted' ||
                                          !!metadata?.closedFileModification ||
                                          !!metadata?.newFile;

      // Calculate linesSinceReview: if file was reviewed, reset to 0 then add new lines
      const wasReviewed = existingStatus?.isReviewed === true;
      const existingLinesSinceReview = wasReviewed ? 0 : (existingStatus?.linesSinceReview ?? 0);

      // Use linesChanged which includes both additions and removals
      // Falls back to sum of linesOfCode and linesRemoved if linesChanged not available
      const changeAmount = event.linesChanged ?? ((event.linesOfCode ?? 0) + (event.linesRemoved ?? 0));
      const calculatedLinesSinceReview = existingLinesSinceReview + changeAmount;

      // Track separate additions and removals
      const existingLinesAdded = wasReviewed ? 0 : (existingStatus?.linesAdded ?? 0);
      const existingLinesRemoved = wasReviewed ? 0 : (existingStatus?.linesRemoved ?? 0);
      const newLinesAdded = existingLinesAdded + (event.linesOfCode ?? 0);
      const newLinesRemoved = existingLinesRemoved + (event.linesRemoved ?? 0);

      const fileStatus = {
        filePath: event.filePath,
        date: today,
        tool: event.tool,
        reviewQuality: event.reviewQuality || ReviewQuality.None,
        reviewScore: event.reviewQualityScore || 0,
        isReviewed: event.isReviewed || false,
        linesGenerated: (existingStatus?.linesGenerated || 0) + (event.linesOfCode || 0),
        linesChanged: (existingStatus?.linesChanged || 0) + (event.linesChanged || 0),
        // CRITICAL FIX: Accumulate linesSinceReview instead of overwriting
        // Each AI event should ADD to the total lines since last review, not replace it
        // Event 1: 0 + 123 = 123, Event 2: 123 + 93 = 216 (not overwrite to 93)
        linesSinceReview: calculatedLinesSinceReview,
        linesAdded: newLinesAdded,
        linesRemoved: newLinesRemoved,
        charactersCount: (existingStatus?.charactersCount || 0) + (event.charactersCount || 0),
        agentSessionId: event.agentSessionId,
        isAgentGenerated: event.isAgentMode || false,
        wasFileOpen: event.fileWasOpen || false,
        firstGeneratedAt: existingStatus?.firstGeneratedAt || event.timestamp,
        lastReviewedAt: event.isReviewed ? event.timestamp : existingStatus?.lastReviewedAt,
        totalReviewTime: existingStatus?.totalReviewTime || 0,
        language: event.language,
        modificationCount: (existingStatus?.modificationCount || 0) + 1,
        totalTimeInFocus: existingStatus?.totalTimeInFocus || 0,
        scrollEventCount: existingStatus?.scrollEventCount || 0,
        cursorMovementCount: existingStatus?.cursorMovementCount || 0,
        editsMade: existingStatus?.editsMade || false,
        lastOpenedAt: existingStatus?.lastOpenedAt,
        reviewSessionsCount: existingStatus?.reviewSessionsCount || 0,
        reviewedInTerminal: isFileCreationFromTerminal
      };

      this.fileReviewTracker.trackFile(fileStatus);

      // Persist to database
      this.metricsRepo.saveFileReviewStatus(fileStatus).catch(err => {
        console.error('[CodePause] Failed to save file review status:', err);
      });

      // Start FileReviewSessionTracker for ALL files
      if (!this.fileReviewSessionTracker.isTracking(event.filePath)) {
        this.fileReviewSessionTracker.startTracking(
          event.filePath,
          event.tool,
          event.agentSessionId || 'manual-session',
          event.linesOfCode || 0
        );
      } else {
        // File is already tracked - check if this is a NEW modification
        // If AI adds MORE code to a file that was already reviewed, reset review progress
        const existingSession = this.fileReviewSessionTracker.getSession(event.filePath);
        if (existingSession) {
          // Check if this is a new agent session (new modification)
          const isNewAgentSession = existingSession.agentSessionId !== event.agentSessionId;

          // Check if file was already reviewed (has a review score)
          const wasAlreadyReviewed = existingSession.wasReviewed || existingSession.currentReviewScore > 0;

          if (isNewAgentSession && wasAlreadyReviewed) {
            // AI added new code to a file that was already reviewed
            // CRITICAL FIX: Reset wasReviewed so file needs to be reviewed again
            // This allows handleScrolling/handleCursorMovement/handleDocumentChange to track new interactions

            // Reset review status - file needs to be reviewed again
            existingSession.wasReviewed = false;
            existingSession.currentReviewScore = 0;
            existingSession.currentReviewQuality = ReviewQuality.None;

            // Reset interaction counters
            existingSession.scrollEventCount = 0;
            existingSession.cursorMovementCount = 0;
            existingSession.editsMade = false;

            // Update tracking info
            existingSession.agentSessionId = event.agentSessionId || 'manual-session';
            existingSession.linesGenerated = (existingSession.linesGenerated || 0) + (event.linesOfCode || 0);
            existingSession.generatedAt = event.timestamp;
          } else if (isNewAgentSession && !wasAlreadyReviewed) {
            // New agent session on file that wasn't reviewed yet - just update tracking

            // Update tracking info but don't reset progress
            existingSession.agentSessionId = event.agentSessionId || 'manual-session';
            existingSession.linesGenerated = (existingSession.linesGenerated || 0) + (event.linesOfCode || 0);
            existingSession.generatedAt = event.timestamp;
          } else if (!isNewAgentSession) {
            // Same agent session - just update line count for the same modification
            existingSession.linesGenerated = (existingSession.linesGenerated || 0) + (event.linesOfCode || 0);
          }
        }
      }
    }

    // Step 4: Start post-agent review tracking
    if (agentDetection && agentDetection.sessionEnded && agentDetection.session) {
      // When agent session ends, start tracking all affected files for post-review
      for (const filePath of agentDetection.session.filesAffected) {
        // Skip if already tracking (e.g., from immediate tracking above)
        if (!this.fileReviewSessionTracker.isTracking(filePath)) {
          this.fileReviewSessionTracker.startTracking(
            filePath,
            event.tool, // Pass the actual tool that generated the file
            agentDetection.session.id,
            Math.floor(agentDetection.session.totalLines / agentDetection.session.filesAffected.length)
          );
        }
      }
    }

    // ========== END: Review Quality Tracking Integration ==========

    // Add to event buffer
    this.eventBuffer.push(event);

    // Reset session idle timer
    this.resetSessionIdleTimer();

    // Handle specific event types
    switch (event.eventType) {
      case EventType.SuggestionDisplayed:
        this.handleSuggestionDisplayed(event);
        break;

      case EventType.SuggestionAccepted:
        this.handleSuggestionAccepted(event);
        break;

      case EventType.SuggestionRejected:
        this.handleSuggestionRejected(event);
        break;

      case EventType.CodeGenerated:
        this.handleCodeGenerated(event);
        break;
    }

    // Update current session
    if (this.currentSession) {
      this.currentSession.eventCount++;

      if (event.linesOfCode) {
        // Check if this is manual code or AI-generated
        const metadata = event.metadata as any;
        if (metadata?.manual) {
          // Manual code written by user
          this.currentSession.manualLinesWritten += event.linesOfCode;
        } else {
          // AI-generated code
          this.currentSession.aiLinesGenerated += event.linesOfCode;
        }
      }

      if (!this.currentSession.toolsUsed.includes(event.tool)) {
        this.currentSession.toolsUsed.push(event.tool);
      }
    }

    // Emit event to real-time subscribers (for alert system)
    this.emitEvent(event);

    // Process buffered events periodically
    if (this.eventBuffer.length >= 10) {
      this.flushEventBuffer();
    }
  }

  private emitEvent(event: TrackingEvent): void {
    this.eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error('[CodePause] Error in event handler:', error);
      }
    });
  }

  private handleSuggestionDisplayed(event: TrackingEvent): void {
    const suggestionId = typeof event.metadata?.suggestionId === 'string'
      ? event.metadata.suggestionId
      : this.generateSuggestionId();

    const pending: PendingSuggestion = {
      id: suggestionId,
      tool: event.tool,
      timestamp: event.timestamp,
      linesOfCode: event.linesOfCode || 0,
      charactersCount: event.charactersCount || 0,
      filePath: event.filePath || '',
      language: event.language || '',
      expiresAt: event.timestamp + 30000 // 30 seconds
    };

    this.pendingSuggestions.set(suggestionId, pending);
  }

  private handleSuggestionAccepted(event: TrackingEvent): void {
    const suggestionId = typeof event.metadata?.suggestionId === 'string'
      ? event.metadata.suggestionId
      : undefined;

    if (suggestionId) {
      this.pendingSuggestions.delete(suggestionId);
    }
  }

  private handleSuggestionRejected(event: TrackingEvent): void {
    const suggestionId = typeof event.metadata?.suggestionId === 'string'
      ? event.metadata.suggestionId
      : undefined;

    if (suggestionId) {
      this.pendingSuggestions.delete(suggestionId);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private handleCodeGenerated(_event: TrackingEvent): void {
    // Code generation events are already tracked
    // Additional processing can be added here if needed
  }

  async recordEvent(event: TrackingEvent): Promise<void> {
    // Process event through handleEvent for file review tracking and other logic
    this.handleEvent(event);
    // Also save to database
    await this.metricsRepo.recordEvent(event);
  }

  getPendingSuggestion(id: string): PendingSuggestion | undefined {
    return this.pendingSuggestions.get(id);
  }

  // Phase 2: Tool priority system removed - no longer needed with unified tracking
  // EventDeduplicator handles all deduplication logic

  async getDailyMetrics(date: string): Promise<DailyMetrics | null> {
    return await this.metricsRepo.getDailyMetrics(date);
  }

  getCurrentSession(): CodingSession | null {
    return this.currentSession;
  }

  private startNewSession(): void {
    this.currentSession = {
      id: this.generateSessionId(),
      startTime: Date.now(),
      eventCount: 0,
      aiLinesGenerated: 0,
      manualLinesWritten: 0,
      toolsUsed: []
    };

    this.resetSessionIdleTimer();
  }

  private async endCurrentSession(): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    const now = Date.now();
    this.currentSession.endTime = now;
    this.currentSession.duration = now - this.currentSession.startTime;

    await this.metricsRepo.saveSession(this.currentSession);
    this.currentSession = null;
  }

  private resetSessionIdleTimer(): void {
    if (this.sessionIdleTimer) {
      clearTimeout(this.sessionIdleTimer);
    }

    this.sessionIdleTimer = setTimeout(() => {
      this.endCurrentSession().then(() => {
        // Don't start a new session automatically on idle
        // Wait for next activity
      });
    }, SESSION_IDLE_TIMEOUT_MS);
  }

  private async flushEventBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0) {
      return;
    }

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      for (const event of events) {
        await this.metricsRepo.recordEvent(event);
      }
    } catch (error) {
      console.error('[CodePause] Error flushing events:', error);
      this.eventBuffer.unshift(...events);
    }
  }

  private startAggregation(): void {
    // Aggregate more frequently for responsive UI (every 10 seconds)
    this.aggregationInterval = setInterval(async () => {
      await this.performAggregation();
    }, 10 * 1000); // 10 seconds instead of 5 minutes

    // Also flush on interval (every 500ms for real-time tracking)
    setInterval(() => {
      this.flushEventBuffer();
    }, EVENT_DEBOUNCE_MS);
  }

  private async performAggregation(): Promise<void> {
    try {
      await this.flushEventBuffer();

      // Sync file review sessions to database
      const today = new Date().toISOString().split('T')[0];
      const reviewedFiles = this.fileReviewSessionTracker.getReviewedFiles();
      const unreviewedFiles = this.fileReviewSessionTracker.getUnreviewedFiles();

      for (const session of [...reviewedFiles, ...unreviewedFiles]) {
        // Preserve existing database values instead of overwriting with zeros
        // Get the existing file status from the database tracker to preserve original data
        const existingStatus = this.fileReviewTracker.getFileStatus(session.filePath, today, session.tool);

        // CRITICAL FIX: Preserve higher database review score
        // If the database already has a higher score (e.g., from manual or auto-review),
        // don't overwrite it with a lower session score (e.g., from session timeout reset)
        // Only update if:
        // 1. Session score is higher than database score (user did more review), OR
        // 2. Database doesn't have a score yet (new file)
        const existingReviewScore = existingStatus?.reviewScore || 0;
        const finalReviewScore = Math.max(existingReviewScore, session.currentReviewScore);

        // Preserve existing review status if score was higher in database
        const finalIsReviewed = existingStatus?.isReviewed || session.wasReviewed;

        const fileStatus = {
          filePath: session.filePath,
          date: today,
          tool: session.tool,
          reviewQuality: session.currentReviewQuality,
          reviewScore: finalReviewScore,
          isReviewed: finalIsReviewed,
          // Preserve original values from database, don't overwrite with zeros
          linesGenerated: existingStatus?.linesGenerated || session.linesGenerated,
          linesChanged: existingStatus?.linesChanged || session.linesGenerated, // Use linesGenerated as fallback for review scoring
          // CRITICAL FIX: Don't send linesSinceReview in periodic aggregation
          // This field should only be updated by actual AI events, not by periodic aggregation
          // Sending stale cache values would corrupt the database accumulation logic
          // The database will preserve the existing lines_since_review value when this is undefined
          linesSinceReview: undefined,
          charactersCount: existingStatus?.charactersCount || 0,
          agentSessionId: session.agentSessionId,
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: existingStatus?.firstGeneratedAt || session.generatedAt,
          lastReviewedAt: session.wasReviewed ? Date.now() : undefined,
          totalReviewTime: session.totalTimeInFocus,
          language: existingStatus?.language || undefined,
          modificationCount: (existingStatus?.modificationCount || 0) + (session.editsMade ? 1 : 0),
          totalTimeInFocus: session.totalTimeInFocus,
          scrollEventCount: session.scrollEventCount,
          cursorMovementCount: session.cursorMovementCount,
          editsMade: session.editsMade,
          lastOpenedAt: session.lastOpenedAt,
          reviewSessionsCount: existingStatus?.reviewSessionsCount || 0
        };

        await this.metricsRepo.saveFileReviewStatus(fileStatus).catch(err => {
          console.error('[CodePause] Failed to sync file review session:', err);
        });
      }

      await this.metricsRepo.calculateDailyMetrics(today);
    } catch (error) {
      console.error('[CodePause] Error during aggregation:', error);
    }
  }

  async triggerAggregation(): Promise<void> {
    await this.performAggregation();
  }

  async getMetricsSummary(): Promise<{
    todayMetrics: DailyMetrics | null;
    activeTrackers: AITool[];
    currentSession: CodingSession | null;
    pendingSuggestionsCount: number;
  }> {
    const today = new Date().toISOString().split('T')[0];
    const todayMetrics = await this.getDailyMetrics(today);

    return {
      todayMetrics,
      activeTrackers: Array.from(this.trackers.keys()),
      currentSession: this.currentSession,
      pendingSuggestionsCount: this.pendingSuggestions.size
    };
  }

  async dispose(): Promise<void> {
    // Flush remaining events
    await this.flushEventBuffer();

    // End current session
    if (this.currentSession) {
      await this.endCurrentSession();
    }

    // Clear timers
    if (this.sessionIdleTimer) {
      clearTimeout(this.sessionIdleTimer);
      this.sessionIdleTimer = null;
    }

    if (this.aggregationInterval) {
      clearInterval(this.aggregationInterval);
      this.aggregationInterval = null;
    }

    // Dispose all trackers
    for (const tracker of this.trackers.values()) {
      tracker.dispose();
    }

    // Dispose new review quality tracking components
    this.agentSessionDetector.dispose();
    this.fileReviewSessionTracker.dispose();
    this.reviewQualityAnalyzer.reset();
    this.fileReviewTracker.clear();

    this.trackers.clear();
    this.pendingSuggestions.clear();
    this.isInitialized = false;
  }

  private generateSuggestionId(): string {
    return `suggestion-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  getTracker(tool: AITool): unknown {
    return this.trackers.get(tool);
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  // ========== NEW: Review Quality Tracking Accessors ==========

  getReviewQualityAnalyzer(): ReviewQualityAnalyzer {
    return this.reviewQualityAnalyzer;
  }

  getAgentSessionDetector(): AgentSessionDetector {
    return this.agentSessionDetector;
  }

  getFileReviewTracker(): FileReviewTracker {
    return this.fileReviewTracker;
  }

  getFileReviewSessionTracker(): FileReviewSessionTracker {
    return this.fileReviewSessionTracker;
  }
}
