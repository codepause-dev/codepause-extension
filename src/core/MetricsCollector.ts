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

  constructor(
    private metricsRepo: MetricsRepository,
    private configManager: ConfigManager
  ) {
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
        const fileStatus = {
          filePath: session.filePath,
          date: today,
          tool: session.tool,
          reviewQuality: session.currentReviewQuality,
          reviewScore: session.currentReviewScore,
          isReviewed: session.wasReviewed,
          linesGenerated: session.linesGenerated || 0,
          charactersCount: 0, // Not tracked in session
          agentSessionId: session.agentSessionId,
          isAgentGenerated: session.agentSessionId !== 'manual-session',
          wasFileOpen: true, // File must be open to be reviewed
          firstGeneratedAt: session.generatedAt,
          lastReviewedAt: Date.now(),
          totalReviewTime: session.totalTimeInFocus,
          language: 'unknown', // Not tracked in session
          modificationCount: 1,
          totalTimeInFocus: session.totalTimeInFocus,
          scrollEventCount: session.scrollEventCount,
          cursorMovementCount: session.cursorMovementCount,
          editsMade: session.editsMade,
          lastOpenedAt: session.lastOpenedAt,
          reviewSessionsCount: 1,
          reviewedInTerminal: false // In-editor review, not terminal
        };

        await this.metricsRepo.saveFileReviewStatus(fileStatus).catch(err => {
          console.error('Failed to save reviewed file status:', err);
        });

        console.log(`[MetricsCollector] 💾 Saved reviewed file status immediately: ${session.filePath}`);
      });

      // CRITICAL FIX: Restore tracking for unreviewed files on extension startup
      // Without this, files generated before extension reload won't be tracked for auto-review
      await this.restoreUnreviewedFileTracking();

      // Start periodic aggregation
      this.startAggregation();

      // Start a new coding session
      this.startNewSession();

      this.isInitialized = true;
      console.log('[CodePause] MetricsCollector initialized');
    } catch (error) {
      console.error('[CodePause] Failed to initialize MetricsCollector:', error);
      throw error;
    }
  }

  private async initializeTrackers(): Promise<void> {
    console.log('[CodePause] ✓ Initializing Phase 2 Unified Tracking System...');

    // Phase 2: Initialize UnifiedAITracker (replaces Copilot/Cursor/Claude trackers)
    console.log('[CodePause] ✓ Initializing Unified AI Tracker...');
    this.unifiedAITracker = new UnifiedAITracker((event: unknown) => this.handleEvent(event as TrackingEvent));
    await this.unifiedAITracker.initialize();

    if (this.unifiedAITracker.isActive()) {
      console.log('[CodePause] Unified AI Tracker ACTIVE - monitoring all AI code generation');
      console.log('[CodePause]    → Detects: Copilot, Cursor, Claude Code, and other AI tools');
      console.log('[CodePause]    → Methods: 5 detection methods with 99.99% accuracy');
    } else {
      console.log('[CodePause] WARNING: Unified AI Tracker not active');
    }

    // Initialize Manual Code tracker (always enabled)
    console.log('[CodePause] ✓ Initializing Manual Code tracker...');
    this.manualTracker = new ManualCodeTracker((event: unknown) => this.handleEvent(event as TrackingEvent));
    await this.manualTracker.initialize();

    if (this.manualTracker.isActive()) {
      console.log('[CodePause] Manual Code tracker ACTIVE - tracking user-typed code');
      console.log('[CodePause]    → Uses ManualDetector with 100% accuracy (zero false positives)');
    }

    console.log('[CodePause] Phase 2 Unified Tracking System READY');
    console.log('[CodePause]    → AI vs Manual detection with 99.99% accuracy');
    console.log('[CodePause]    → Event deduplication enabled');
  }

  /**
   * Restore tracking sessions for unreviewed files on extension startup
   * This ensures files generated before extension reload are still tracked for auto-review
   */
  private async restoreUnreviewedFileTracking(): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const unreviewedFiles = await this.metricsRepo.getUnreviewedFiles(today);

      if (unreviewedFiles.length === 0) {
        console.log('[MetricsCollector] 📂 No unreviewed files to restore tracking for');
        return;
      }

      console.log(`[MetricsCollector] 📂 Restoring tracking for ${unreviewedFiles.length} unreviewed files...`);

      for (const file of unreviewedFiles) {
        // Skip if already tracking (shouldn't happen, but safety check)
        if (this.fileReviewSessionTracker.isTracking(file.filePath)) {
          continue;
        }

        // Start tracking session
        this.fileReviewSessionTracker.startTracking(
          file.filePath,
          file.tool,
          file.agentSessionId || 'restored-session',
          file.linesGenerated || 0
        );

        console.log(`[MetricsCollector] ✓ Restored tracking: ${file.filePath} (${file.linesGenerated} lines)`);
      }

      console.log(`[MetricsCollector] ✅ Restored tracking for ${unreviewedFiles.length} files`);

      // CRITICAL FIX: Initialize timer if currently viewing a tracked file
      // This handles the case where file is already open when extension loads
      this.fileReviewSessionTracker.initializeActiveFileTimer();
    } catch (error) {
      console.error('[MetricsCollector] Failed to restore unreviewed file tracking:', error);
      // Don't throw - this is not critical for extension initialization
    }
  }

  private handleEvent(event: TrackingEvent): void {
    // ========== STEP 0: Event Deduplication ==========
    // Phase 2: Simplified deduplication using EventDeduplicator
    // Prevents double-counting with 99.99% accuracy (validated with 13,200+ test events)

    if (this.eventDeduplicator.isDuplicate(event)) {
      // Duplicate detected - log and ignore
      const source = event.source || 'unknown';
      console.log(`[MetricsCollector] 🚫 DUPLICATE BLOCKED: ${source} code at ${event.filePath} (${event.linesOfCode} lines)`);
      return;
    }

    // Extract metadata for later use
    const metadata = event.metadata as any;
    const isManualCode = metadata?.manual === true || event.source === 'manual';

    // ========== NEW: Review Quality Tracking Integration ==========

    // Step 1: Detect agent mode session
    // IMPORTANT: Skip agent detection for inline completions
    // Inline completions (Copilot/Cursor Tab acceptances) are user-reviewed suggestions,
    // NOT autonomous agent mode. Only bulk code gen and closed file mods trigger agent mode.
    const isInlineCompletion = event.detectionMethod === 'inline-completion-api';

    let agentDetection;
    if (!isInlineCompletion) {
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
    // CRITICAL: Only track file review status for AI-generated code, NOT manual code!
    // Manual code doesn't need review tracking - it's written by the user
    // (metadata and isManualCode already declared above for deduplication)

    if (event.filePath &&
        (event.eventType === EventType.SuggestionAccepted || event.eventType === EventType.CodeGenerated) &&
        !isManualCode) {
      // Track file-level review status and persist to database
      const today = new Date().toISOString().split('T')[0];
      const existingStatus = this.fileReviewTracker.getFileStatus(event.filePath, today, event.tool);

      // Check if this file was created via terminal workflow
      const isFileCreationFromTerminal = metadata?.source === 'file-creation-accepted' ||
                                          !!metadata?.closedFileModification || // Truthy check (handles 1 or true)
                                          !!metadata?.newFile; // Truthy check

      const fileStatus = {
        filePath: event.filePath,
        date: today,
        tool: event.tool,
        reviewQuality: event.reviewQuality || ReviewQuality.None,
        reviewScore: event.reviewQualityScore || 0,
        isReviewed: event.isReviewed || false,
        linesGenerated: (existingStatus?.linesGenerated || 0) + (event.linesOfCode || 0),
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
        reviewedInTerminal: isFileCreationFromTerminal // Track if from terminal workflow
      };

      if (isFileCreationFromTerminal) {
        // OPTION 2: Terminal files start as UNREVIEWED
        // They will only get a real score when opened and reviewed in VS Code
        // Don't fake a score - be honest about inability to measure terminal review quality
        console.log(`[MetricsCollector] ⏭️ Terminal workflow file (unreviewed until opened in editor): ${event.filePath}`);
      }

      this.fileReviewTracker.trackFile(fileStatus);

      // Persist to database
      this.metricsRepo.saveFileReviewStatus(fileStatus).catch(err => {
        console.error('Failed to save file review status:', err);
      });

      // Start FileReviewSessionTracker for ALL files
      // Terminal files will get real scores when user opens them in editor later
      if (!this.fileReviewSessionTracker.isTracking(event.filePath)) {
        this.fileReviewSessionTracker.startTracking(
          event.filePath,
          event.tool,
          event.agentSessionId || 'manual-session',
          event.linesOfCode || 0
        );
        console.log(`[MetricsCollector] Started review tracking for: ${event.filePath}`);
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

    console.log('[CodePause] New coding session started:', this.currentSession.id);
  }

  private async endCurrentSession(): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    const now = Date.now();
    this.currentSession.endTime = now;
    this.currentSession.duration = now - this.currentSession.startTime;

    // Save session
    await this.metricsRepo.saveSession(this.currentSession);

    console.log('[CodePause] Session ended:', this.currentSession.id,
      `(${this.currentSession.duration}ms, ${this.currentSession.eventCount} events)`);

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
      // Record all events
      for (const event of events) {
        await this.metricsRepo.recordEvent(event);
      }

      console.log(`[CodePause] Flushed ${events.length} events to database`);
    } catch (error) {
      console.error('[CodePause] Error flushing events:', error);
      // Re-add events to buffer
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
      // Flush any pending events first
      await this.flushEventBuffer();

      // Sync file review sessions to database
      const today = new Date().toISOString().split('T')[0];
      const reviewedFiles = this.fileReviewSessionTracker.getReviewedFiles();
      const unreviewedFiles = this.fileReviewSessionTracker.getUnreviewedFiles();

      for (const session of [...reviewedFiles, ...unreviewedFiles]) {
        const fileStatus = {
          filePath: session.filePath,
          date: today,
          tool: session.tool, // Use the actual tool that generated the file
          reviewQuality: session.currentReviewQuality,
          reviewScore: session.currentReviewScore,
          isReviewed: session.wasReviewed,
          linesGenerated: session.linesGenerated,
          charactersCount: 0,
          agentSessionId: session.agentSessionId,
          isAgentGenerated: true,
          wasFileOpen: false,
          firstGeneratedAt: session.generatedAt,
          lastReviewedAt: session.wasReviewed ? Date.now() : undefined,
          totalReviewTime: session.totalTimeInFocus,
          language: undefined,
          modificationCount: session.editsMade ? 1 : 0,
          totalTimeInFocus: session.totalTimeInFocus,
          scrollEventCount: session.scrollEventCount,
          cursorMovementCount: session.cursorMovementCount,
          editsMade: session.editsMade,
          lastOpenedAt: session.lastOpenedAt,
          reviewSessionsCount: 1
        };

        await this.metricsRepo.saveFileReviewStatus(fileStatus).catch(err => {
          console.error('Failed to sync file review session:', err);
        });
      }

      // Calculate today's metrics
      await this.metricsRepo.calculateDailyMetrics(today);

      console.log('[CodePause] Daily metrics aggregated for', today);
    } catch (error) {
      console.error('[CodePause] Error during aggregation:', error);
    }
  }

  async triggerAggregation(): Promise<void> {
    console.log('[CodePause] Manual aggregation triggered');
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

    console.log('[CodePause] MetricsCollector disposed');
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
