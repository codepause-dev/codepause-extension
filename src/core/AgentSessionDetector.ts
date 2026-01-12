/**
 * AgentSessionDetector
 * Automatically detects when AI tools operate in agent/autonomous mode
 * using a multi-signal approach
 */

import {
  TrackingEvent,
  AgentSession,
  BlindApprovalConfidence
} from '../types';

/**
 * Detection thresholds
 */
const DETECTION_CONFIG = {
  rapidFileChangesCount: 3,        // 3+ files
  rapidFileChangesWindow: 10000,   // within 10 seconds
  bulkGenerationThreshold: 50,     // 50+ lines in one event
  minSignalsRequired: 2,           // Require 2+ signals for detection
  sessionIdleTimeout: 30000,       // 30 seconds inactivity
  sessionMaxDuration: 600000,      // 10 minutes max duration
  consistentSourceCount: 3         // 3+ events from same source
};

/**
 * Detection signals for agent mode
 */
interface DetectionSignals {
  rapidFileChanges: boolean;
  closedFileModifications: boolean;
  bulkCodeGeneration: boolean;
  gitCommitSignature: boolean;
  consistentSource: boolean;
}

export class AgentSessionDetector {
  private currentSession: AgentSession | null = null;
  private recentEvents: TrackingEvent[] = [];
  private sessionIdleTimer: NodeJS.Timeout | null = null;
  private sessionStartTimer: NodeJS.Timeout | null = null;

  /**
   * Process a new event and detect agent mode
   */
  processEvent(event: TrackingEvent): {
    sessionDetected: boolean;
    sessionStarted: boolean;
    sessionEnded: boolean;
    session: AgentSession | null;
  } {
    // Add event to recent events
    this.recentEvents.push(event);
    this.cleanupOldEvents();

    // Detect signals
    const signals = this.detectSignals(event);
    const triggeredCount = this.countTriggeredSignals(signals);

    // Determine confidence based on signal count
    const confidence = this.calculateConfidence(triggeredCount);

    let sessionDetected = false;
    let sessionStarted = false;
    const sessionEnded = false;

    // Check if agent mode is detected (requires 2+ signals)
    if (triggeredCount >= DETECTION_CONFIG.minSignalsRequired) {
      sessionDetected = true;

      if (!this.currentSession) {
        // Start new agent session
        this.startSession(event, signals, confidence);
        sessionStarted = true;
      } else {
        // Update existing session
        this.updateSession(event);
      }
    }

    // Reset idle timer
    if (this.currentSession) {
      this.resetIdleTimer();
    }

    return {
      sessionDetected,
      sessionStarted,
      sessionEnded,
      session: this.currentSession
    };
  }

  /**
   * Start a new agent session
   */
  private startSession(
    event: TrackingEvent,
    signals: DetectionSignals,
    confidence: BlindApprovalConfidence
  ): void {
    const sessionId = this.generateSessionId();

    this.currentSession = {
      id: sessionId,
      tool: event.tool,
      startTime: event.timestamp,
      fileCount: 1,
      totalLines: event.linesOfCode ?? 0,
      totalCharacters: event.charactersCount ?? 0,
      wasReviewed: false,
      detectionSignals: signals,
      confidence,
      filesAffected: [event.filePath ?? 'unknown'],
      alertShown: false
    };

    console.log(`[AgentSessionDetector] 🤖 Agent session started: ${sessionId} (${event.tool})`);

    // Set maximum duration timer
    this.sessionStartTimer = setTimeout(() => {
      this.endSession('max_duration_reached');
    }, DETECTION_CONFIG.sessionMaxDuration);
  }

  /**
   * Update existing agent session with new event
   */
  private updateSession(event: TrackingEvent): void {
    if (!this.currentSession) {return;}

    // Update metrics
    this.currentSession.fileCount++;
    this.currentSession.totalLines += event.linesOfCode ?? 0;
    this.currentSession.totalCharacters += event.charactersCount ?? 0;

    // Track affected files
    const filePath = event.filePath ?? 'unknown';
    if (!this.currentSession.filesAffected.includes(filePath)) {
      this.currentSession.filesAffected.push(filePath);
    }
  }

  /**
   * End current agent session
   */
  endSession(reason: string): AgentSession | null {
    if (!this.currentSession) {
      return null;
    }

    const now = Date.now();
    this.currentSession.endTime = now;
    this.currentSession.duration = now - this.currentSession.startTime;

    console.log(
      `[AgentSessionDetector] 🛑 Agent session ended: ${this.currentSession.id} ` +
      `(${reason}, ${this.currentSession.fileCount} files, ${this.currentSession.totalLines} lines)`
    );

    // Clear timers
    if (this.sessionIdleTimer) {
      clearTimeout(this.sessionIdleTimer);
      this.sessionIdleTimer = null;
    }

    if (this.sessionStartTimer) {
      clearTimeout(this.sessionStartTimer);
      this.sessionStartTimer = null;
    }

    const endedSession = this.currentSession;
    this.currentSession = null;

    return endedSession;
  }

  /**
   * Reset the idle timer (called when new event arrives)
   */
  private resetIdleTimer(): void {
    if (this.sessionIdleTimer) {
      clearTimeout(this.sessionIdleTimer);
    }

    this.sessionIdleTimer = setTimeout(() => {
      this.endSession('idle_timeout');
    }, DETECTION_CONFIG.sessionIdleTimeout);
  }

  /**
   * Detect all agent mode signals for this event
   */
  private detectSignals(event: TrackingEvent): DetectionSignals {
    return {
      rapidFileChanges: this.detectRapidFileChanges(),
      closedFileModifications: this.detectClosedFileModification(event),
      bulkCodeGeneration: this.detectBulkGeneration(event),
      gitCommitSignature: this.detectGitSignature(event),
      consistentSource: this.detectConsistentSource(event)
    };
  }

  /**
   * Signal 1: Rapid file changes (3+ files in <10 seconds)
   */
  private detectRapidFileChanges(): boolean {
    const now = Date.now();
    const windowStart = now - DETECTION_CONFIG.rapidFileChangesWindow;

    // Get events within the time window
    const recentEvents = this.recentEvents.filter(
      e => e.timestamp >= windowStart
    );

    // Count unique files
    const uniqueFiles = new Set<string>();
    for (const event of recentEvents) {
      if (event.filePath) {
        uniqueFiles.add(event.filePath);
      }
    }

    return uniqueFiles.size >= DETECTION_CONFIG.rapidFileChangesCount;
  }

  /**
   * Signal 2: Closed file modification
   * (Code generated in a file that wasn't open in the editor)
   */
  private detectClosedFileModification(event: TrackingEvent): boolean {
    // Check metadata for file open status
    const metadata = event.metadata;
    if (metadata?.closedFileModification === true) {
      return true;
    }

    // Also check if fileWasOpen is explicitly false
    if (event.fileWasOpen === false) {
      return true;
    }

    return false;
  }

  /**
   * Signal 3: Bulk code generation (50+ lines in one event)
   */
  private detectBulkGeneration(event: TrackingEvent): boolean {
    const lines = event.linesOfCode ?? 0;
    return lines >= DETECTION_CONFIG.bulkGenerationThreshold;
  }

  /**
   * Signal 4: Git commit signature (Claude Code markers)
   */
  private detectGitSignature(event: TrackingEvent): boolean {
    const metadata = event.metadata;

    // Check for Claude Code specific markers
    if (metadata?.claudeCodeSession || metadata?.claudeCodeAgent) {
      return true;
    }

    // Check for agent mode indicators in metadata
    if (metadata?.agentMode === true) {
      return true;
    }

    // Check for commit message patterns (if available)
    if (metadata?.commitMessage) {
      const commitMessage = String(metadata.commitMessage).toLowerCase();
      if (
        commitMessage.includes('claude code') ||
        commitMessage.includes('generated with') ||
        commitMessage.includes('co-authored-by: claude')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Signal 5: Consistent source (3+ events from same metadata source)
   */
  private detectConsistentSource(event: TrackingEvent): boolean {
    // Look for patterns in recent events
    const metadata = event.metadata;
    const currentSource = metadata?.source || metadata?.triggeredBy || 'unknown';

    // Count events with the same source
    let sameSourceCount = 0;
    for (const recentEvent of this.recentEvents) {
      const recentMetadata = recentEvent.metadata;
      const recentSource = recentMetadata?.source || recentMetadata?.triggeredBy || 'unknown';

      if (recentSource === currentSource && currentSource !== 'unknown') {
        sameSourceCount++;
      }
    }

    return sameSourceCount >= DETECTION_CONFIG.consistentSourceCount;
  }

  /**
   * Count how many signals were triggered
   */
  private countTriggeredSignals(signals: DetectionSignals): number {
    return Object.values(signals).filter(Boolean).length;
  }

  /**
   * Calculate confidence based on number of signals triggered
   */
  private calculateConfidence(triggeredCount: number): BlindApprovalConfidence {
    if (triggeredCount >= 4) {
      return BlindApprovalConfidence.High;
    } else if (triggeredCount === 3) {
      return BlindApprovalConfidence.Medium;
    } else {
      return BlindApprovalConfidence.Low;
    }
  }

  /**
   * Remove events older than the detection window
   */
  private cleanupOldEvents(): void {
    const now = Date.now();
    const cutoff = now - DETECTION_CONFIG.rapidFileChangesWindow;

    this.recentEvents = this.recentEvents.filter(
      e => e.timestamp >= cutoff
    );

    // Keep maximum 50 recent events
    if (this.recentEvents.length > 50) {
      this.recentEvents = this.recentEvents.slice(-50);
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `agent-session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Get current agent session (if any)
   */
  getCurrentSession(): AgentSession | null {
    return this.currentSession;
  }

  /**
   * Check if currently in an agent session
   */
  isInAgentSession(): boolean {
    return this.currentSession !== null;
  }

  /**
   * Manually end current session (for testing or cleanup)
   */
  forceEndSession(): AgentSession | null {
    return this.endSession('manual_force_end');
  }

  /**
   * Get statistics about agent session detection
   */
  getStats(): {
    currentSessionActive: boolean;
    currentSessionId: string | null;
    currentSessionDuration: number | null;
    currentSessionFileCount: number | null;
    recentEventsCount: number;
  } {
    return {
      currentSessionActive: this.currentSession !== null,
      currentSessionId: this.currentSession?.id ?? null,
      currentSessionDuration: this.currentSession
        ? Date.now() - this.currentSession.startTime
        : null,
      currentSessionFileCount: this.currentSession?.fileCount ?? null,
      recentEventsCount: this.recentEvents.length
    };
  }

  /**
   * Reset detector (clear all state)
   */
  reset(): void {
    if (this.sessionIdleTimer) {
      clearTimeout(this.sessionIdleTimer);
      this.sessionIdleTimer = null;
    }

    if (this.sessionStartTimer) {
      clearTimeout(this.sessionStartTimer);
      this.sessionStartTimer = null;
    }

    this.currentSession = null;
    this.recentEvents = [];
  }

  /**
   * Dispose (cleanup timers)
   */
  dispose(): void {
    this.reset();
  }
}
