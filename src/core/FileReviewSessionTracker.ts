/**
 * FileReviewSessionTracker
 * Detects when developers review agent-generated code AFTER it was created
 * by hooking into VSCode file viewing APIs
 */

import * as vscode from 'vscode';
import {
  FileReviewSession,
  ReviewQuality,
  DeveloperLevel,
  AITool
} from '../types';

/**
 * Review session scoring thresholds based on developer level
 * Junior devs need more time to review, seniors can review faster
 */
interface ScoringConfig {
  lightReviewTime: number;
  thoroughReviewTime: number;
  scrollBonus: number;
  fullCoverageBonus: number;
  cursorBonus: number;
  editBonus: number;
  reviewedThreshold: number;
}

/**
 * Get base scoring config based on developer level (per-line review time)
 */
function getBaseReviewSpeed(level: DeveloperLevel): { msPerLine: number; baseThreshold: number } {
  switch (level) {
    case DeveloperLevel.Junior:
      return { msPerLine: 600, baseThreshold: 60 };  // 600ms per line (need time to understand)
    case DeveloperLevel.Mid:
      return { msPerLine: 400, baseThreshold: 50 };  // 400ms per line (balanced review speed)
    case DeveloperLevel.Senior:
      return { msPerLine: 200, baseThreshold: 40 };  // 200ms per line (experienced, faster)
  }
}

/**
 * Calculate dynamic review thresholds based on file complexity
 * Longer/more complex files need more review time
 */
function calculateDynamicThresholds(
  linesOfCode: number,
  level: DeveloperLevel
): ScoringConfig {
  const baseSpeed = getBaseReviewSpeed(level);

  // Base time = lines * ms per line
  // Light review = scan through (base time)
  // Thorough review = deep review (base time * 6)
  const lightReviewTime = Math.max(5000, linesOfCode * baseSpeed.msPerLine);
  const thoroughReviewTime = lightReviewTime * 6;

  const config: ScoringConfig = {
    lightReviewTime,
    thoroughReviewTime,
    scrollBonus: 10,
    fullCoverageBonus: 15,
    cursorBonus: 10,
    editBonus: 20,
    reviewedThreshold: baseSpeed.baseThreshold
  };

  // DEBUG: Log the calculated thresholds

  return config;
}

/**
 * Grace period for post-agent review detection (24 hours)
 */
const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

/**
 * Session timeout: If file not viewed for 1 hour, reset review score
 * Prevents gaming the system while allowing legitimate workflow switching
 */
const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

export class FileReviewSessionTracker {
  private activeSessions: Map<string, FileReviewSession> = new Map();
  private disposables: vscode.Disposable[] = [];
  private currentActiveFile: string | null = null;
  private sessionStartTime: number = 0;

  // Callback for when file is marked as reviewed (for immediate DB update)
  private onFileReviewed: ((session: FileReviewSession) => void) | null = null;

  // Developer level (used for calculating per-file dynamic thresholds)
  private developerLevel: DeveloperLevel;

  /**
   * Constructor - accepts developer level for customized thresholds
   */
  constructor(developerLevel: DeveloperLevel = DeveloperLevel.Mid) {
    this.developerLevel = developerLevel;
  }

  /**
   * Update developer level
   */
  setDeveloperLevel(level: DeveloperLevel): void {
    this.developerLevel = level;
  }

  /**
   * Set callback for when file is marked as reviewed
   * This allows immediate database updates instead of waiting for aggregation
   */
  setReviewCallback(callback: (session: FileReviewSession) => void): void {
    this.onFileReviewed = callback;
  }

  /**
   * Extract file path from document URI (handles diff views, git views, etc.)
   */
  private getFilePathFromUri(uri: vscode.Uri): string | null {
    // Regular file
    if (uri.scheme === 'file') {
      return uri.fsPath;
    }

    // Diff view: vscode-diff:///path/to/file.js
    if (uri.scheme.includes('diff')) {
      // Try to parse the path from the URI
      const path = uri.path || uri.fsPath;
      if (path) {
        return path;
      }
    }

    // Git diff: git:/path/to/file.js
    if (uri.scheme === 'git') {
      return uri.fsPath || uri.path;
    }

    // Untitled or other special schemes
    if (uri.scheme === 'untitled') {
      return uri.path;
    }

    // For other schemes, try to extract fsPath or path
    return uri.fsPath || uri.path || null;
  }

  /**
   * Initialize VSCode API hooks
   */
  initialize(): void {
    // API 1: File open/close detection
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        this.handleEditorChange(editor);
      })
    );

    // API 2: Scrolling detection (reading indicator)
    this.disposables.push(
      vscode.window.onDidChangeTextEditorVisibleRanges(event => {
        this.handleScrolling(event);
      })
    );

    // API 3: Cursor movement detection
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection(event => {
        this.handleCursorMovement(event);
      })
    );

    // API 4: Document change detection (edits)
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(event => {
        this.handleDocumentChange(event);
      })
    );
  }

  /**
   * Check if the currently open editor is a tracked file and start timer
   * Call this AFTER restoring sessions on extension startup
   */
  initializeActiveFileTimer(): void {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const filePath = this.getFilePathFromUri(activeEditor.document.uri);
      if (filePath && this.activeSessions.has(filePath)) {
        const session = this.activeSessions.get(filePath);
        if (session) {
          const now = Date.now();

          // Check for session timeout (1 hour of inactivity)
          const timeSinceLastView = session.lastOpenedAt ? now - session.lastOpenedAt : 0;
          const isSessionExpired = timeSinceLastView > SESSION_TIMEOUT_MS;

          // If session expired, reset review progress (but keep time tracking for metrics)
          // Don't reset wasReviewed if file was already marked as reviewed
          if (isSessionExpired && session.currentReviewScore > 0) {
            const wasAlreadyReviewed = session.wasReviewed;

            // Reset review progress (context lost after 1 hour)
            // BUT: Preserve wasReviewed status if file was already reviewed
            if (!wasAlreadyReviewed) {
              session.currentReviewScore = 0;
              session.currentReviewQuality = ReviewQuality.None;
              session.wasReviewed = false;
            }

            // Always reset interaction counters (start fresh for next review session)
            session.scrollEventCount = 0;
            session.cursorMovementCount = 0;
            session.editsMade = false;
          }

          // Update first/last opened timestamps
          if (!session.firstOpenedAt) {
            session.firstOpenedAt = now;
          }
          session.lastOpenedAt = now;
        }

        this.currentActiveFile = filePath;
        this.sessionStartTime = Date.now();
      }
    }
  }

  /**
   * Start tracking a file for post-agent review
   */
  startTracking(
    filePath: string,
    tool: AITool,
    agentSessionId: string,
    linesGenerated: number
  ): void {
    // Check if file was generated within grace period
    const now = Date.now();

    // Check if this file is currently open in the editor
    const activeEditor = vscode.window.activeTextEditor;
    const isOpen = activeEditor && this.getFilePathFromUri(activeEditor.document.uri) === filePath;

    const session: FileReviewSession = {
      filePath,
      tool,
      agentSessionId,
      generatedAt: now,
      initialReviewQuality: ReviewQuality.None,
      linesGenerated,
      totalTimeInFocus: 0,
      scrollEventCount: 0,
      cursorMovementCount: 0,
      editsMade: false,
      currentReviewQuality: ReviewQuality.None,
      currentReviewScore: 0,
      wasReviewed: false
    };

    this.activeSessions.set(filePath, session);

    // CRITICAL FIX: DON'T initialize time tracking immediately!
    // Only track time when user ACTIVELY interacts with the file (scroll, cursor, edit)
    // This prevents false positives where file is open but user isn't looking at it
    // Time tracking will start on first user interaction (scroll/cursor/edit)
    if (isOpen) {
      // Mark that file is open, but DON'T start timer yet
      session.firstOpenedAt = now;
      session.lastOpenedAt = now;
    }

    // File is now being tracked for review
    // User will be notified via dashboard and status bar
  }

  /**
   * Handle editor change (file opened/closed)
   */
  private handleEditorChange(editor: vscode.TextEditor | undefined): void {
    const now = Date.now();

    // Close previous file session
    if (this.currentActiveFile) {
      const timeInFocus = now - this.sessionStartTime;
      this.updateTimeInFocus(this.currentActiveFile, timeInFocus);
    }

    // Start new file session
    if (editor) {
      const filePath = this.getFilePathFromUri(editor.document.uri);
      if (!filePath) {
        this.currentActiveFile = null;
        this.sessionStartTime = 0;
        return;
      }

      this.currentActiveFile = filePath;
      this.sessionStartTime = now;

      // Check if this file is being tracked
      const session = this.activeSessions.get(filePath);
      if (session) {
        // Check for session timeout (1 hour of inactivity)
        const timeSinceLastView = session.lastOpenedAt ? now - session.lastOpenedAt : 0;
        const isSessionExpired = timeSinceLastView > SESSION_TIMEOUT_MS;

        // Update first/last opened timestamps
        if (!session.firstOpenedAt) {
          session.firstOpenedAt = now;
        }
        session.lastOpenedAt = now;

        // If session expired, reset review progress (but keep time tracking for metrics)
        if (isSessionExpired && session.currentReviewScore > 0) {
          const wasAlreadyReviewed = session.wasReviewed;

          // Preserve wasReviewed status if file was already reviewed
          if (!wasAlreadyReviewed) {
            session.currentReviewScore = 0;
            session.currentReviewQuality = ReviewQuality.None;
            session.wasReviewed = false;
          }

          // Reset interaction counters
          session.scrollEventCount = 0;
          session.cursorMovementCount = 0;
          session.editsMade = false;
        }
      }
    } else {
      this.currentActiveFile = null;
      this.sessionStartTime = 0;
    }
  }

  /**
   * Handle scrolling event
   */
  private handleScrolling(event: vscode.TextEditorVisibleRangesChangeEvent): void {
    const filePath = this.getFilePathFromUri(event.textEditor.document.uri);
    if (!filePath) {
      return;
    }

    const session = this.activeSessions.get(filePath);

    if (session) {
      // Skip tracking if file is already reviewed
      if (session.wasReviewed) {
        // CRITICAL FIX: Don't log spam - just return silently
        return;
      }

      // CRITICAL FIX: Start timer on FIRST interaction (scroll)
      // This ensures time is only tracked when user is actively engaged
      if (this.currentActiveFile !== filePath || this.sessionStartTime === 0) {
        this.currentActiveFile = filePath;
        this.sessionStartTime = Date.now();
      }

      // Update time in focus
      const now = Date.now();
      const timeInFocus = now - this.sessionStartTime;
      session.totalTimeInFocus += timeInFocus;
      this.sessionStartTime = now; // Reset timer

      session.scrollEventCount++;
      this.updateReviewScore(session);
    }
  }

  /**
   * Handle cursor movement
   */
  private handleCursorMovement(event: vscode.TextEditorSelectionChangeEvent): void {
    const filePath = this.getFilePathFromUri(event.textEditor.document.uri);
    if (!filePath) {
      return;
    }

    const session = this.activeSessions.get(filePath);

    if (session) {
      // Skip tracking if file is already reviewed
      if (session.wasReviewed) {
        return;
      }

      // CRITICAL FIX: Start timer on FIRST interaction (cursor movement)
      if (this.currentActiveFile !== filePath || this.sessionStartTime === 0) {
        this.currentActiveFile = filePath;
        this.sessionStartTime = Date.now();
      }

      // Update time in focus
      const now = Date.now();
      const timeInFocus = now - this.sessionStartTime;
      session.totalTimeInFocus += timeInFocus;
      this.sessionStartTime = now; // Reset timer

      session.cursorMovementCount++;
      this.updateReviewScore(session);
    }
  }

  /**
   * Handle document changes (edits)
   */
  private handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    const filePath = this.getFilePathFromUri(event.document.uri);
    if (!filePath) {
      return;
    }

    const session = this.activeSessions.get(filePath);

    if (session && event.contentChanges.length > 0) {
      // Skip tracking if file is already reviewed
      if (session.wasReviewed) {
        return;
      }

      // CRITICAL FIX: Start timer on FIRST interaction (edit)
      if (this.currentActiveFile !== filePath || this.sessionStartTime === 0) {
        this.currentActiveFile = filePath;
        this.sessionStartTime = Date.now();
      }

      // Update time in focus
      const now = Date.now();
      const timeInFocus = now - this.sessionStartTime;
      session.totalTimeInFocus += timeInFocus;
      this.sessionStartTime = now; // Reset timer

      // CRITICAL FIX: Only count SMALL edits as manual review edits
      // Large pastes (>300 chars) are likely AI-generated and shouldn't count as "review"
      // This prevents AI code additions from falsely marking files as reviewed
      let totalChars = 0;
      for (const change of event.contentChanges) {
        totalChars += change.text.length;
      }

      // Only count as manual edit if it's small (< 300 chars) and not a pure deletion
      const isManualEdit = totalChars > 0 && totalChars < 300;
      if (isManualEdit && !session.editsMade) {
        session.editsMade = true;
      }

      this.updateReviewScore(session);
    }
  }

  /**
   * Update time in focus for a file
   */
  private updateTimeInFocus(filePath: string, additionalTime: number): void {
    const session = this.activeSessions.get(filePath);

    if (session) {
      session.totalTimeInFocus += additionalTime;

      // Calculate score and update review status
      this.updateReviewScore(session);
    }
  }

  /**
   * Calculate review score based on tracking data
   * Uses DYNAMIC thresholds based on file size/complexity
   *
   * CRITICAL FIX: Only count time in focus if there are ACTIVE interactions
   * Passive file opening (no scrolling, no cursor movement, no edits) should NOT trigger auto-review
   */
  private updateReviewScore(session: FileReviewSession): void {
    // Calculate custom scoring thresholds for THIS specific file
    const customScoring = calculateDynamicThresholds(session.linesGenerated, this.developerLevel);

    let score = 0;

    // CRITICAL FIX: Require meaningful interaction, not just passive file opening
    // - Opening file = 1-2 cursor moves (automatic, not review)
    // - Tab switch = 1-2 cursor moves (automatic, not review)
    // - Actual review = 5+ cursor moves (user navigating through code)
    const MIN_CURSOR_MOVEMENTS = 5;
    const MIN_SCROLL_EVENTS = 1; // Scrolling is always intentional

    const hasActiveInteractions = session.scrollEventCount >= MIN_SCROLL_EVENTS ||
                                    session.cursorMovementCount >= MIN_CURSOR_MOVEMENTS ||
                                    session.editsMade;


    // Factor 1: Time in focus (thresholds scale with file size)
    // ONLY count time if there are active interactions (scrolling, cursor movement, or edits)
    if (hasActiveInteractions) {
      if (session.totalTimeInFocus >= customScoring.thoroughReviewTime) {
        score += 80; // Thorough review
      } else if (session.totalTimeInFocus >= customScoring.lightReviewTime) {
        score += 50; // Light review
      } else {
        // Proportional score for less time
        const proportionalScore = Math.min(
          (session.totalTimeInFocus / customScoring.lightReviewTime) * 30,
          30
        );
        score += proportionalScore;
      }
    } else {
      // No active interactions - passive file opening doesn't count
    }

    // Factor 2: Scroll events (engaged reading)
    const scrollBonus = Math.floor(session.scrollEventCount / 3) * customScoring.scrollBonus;
    const cappedScrollBonus = Math.min(scrollBonus, customScoring.scrollBonus * 2);
    score += cappedScrollBonus;

    // Factor 3: Cursor movements (navigation)
    const cursorBonus = Math.floor(session.cursorMovementCount / 5) * customScoring.cursorBonus;
    const cappedCursorBonus = Math.min(cursorBonus, customScoring.cursorBonus);
    score += cappedCursorBonus;

    // Factor 4: Edits made (highest engagement)
    if (session.editsMade) {
      score += customScoring.editBonus;
    }

    // Cap score at 100
    score = Math.min(score, 100);

    const wasReviewedBefore = session.wasReviewed;

    // Update session
    session.currentReviewScore = score;

    // Determine review quality
    if (score >= 70) {
      session.currentReviewQuality = ReviewQuality.Thorough;
    } else if (score >= 40) {
      session.currentReviewQuality = ReviewQuality.Light;
    } else {
      session.currentReviewQuality = ReviewQuality.None;
    }

    // Mark as reviewed if score exceeds threshold (threshold varies by developer level)
    const meetsThreshold = score >= customScoring.reviewedThreshold;

    if (meetsThreshold) {
      session.wasReviewed = true;
    }

    // Notify when file becomes reviewed
    if (!wasReviewedBefore && session.wasReviewed) {
      if (this.onFileReviewed) {
        this.onFileReviewed(session);
      }
    }

  }

  /**
   * Get review session for a file
   */
  getSession(filePath: string): FileReviewSession | null {
    return this.activeSessions.get(filePath) ?? null;
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): FileReviewSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Get sessions for a specific agent session
   */
  getAgentSessionSessions(agentSessionId: string): FileReviewSession[] {
    return Array.from(this.activeSessions.values()).filter(
      s => s.agentSessionId === agentSessionId
    );
  }

  /**
   * Get reviewed files (score > threshold)
   */
  getReviewedFiles(): FileReviewSession[] {
    return Array.from(this.activeSessions.values()).filter(
      s => s.wasReviewed
    );
  }

  /**
   * Get unreviewed files (score <= threshold)
   */
  getUnreviewedFiles(): FileReviewSession[] {
    return Array.from(this.activeSessions.values()).filter(
      s => !s.wasReviewed
    );
  }

  /**
   * Check if a file is being tracked
   */
  isTracking(filePath: string): boolean {
    return this.activeSessions.has(filePath);
  }

  /**
   * Stop tracking a file
   */
  stopTracking(filePath: string): FileReviewSession | null {
    // Close active session if it's the current file
    if (this.currentActiveFile === filePath) {
      const now = Date.now();
      const timeInFocus = now - this.sessionStartTime;
      this.updateTimeInFocus(filePath, timeInFocus);
      this.currentActiveFile = null;
      this.sessionStartTime = 0;
    }

    const session = this.activeSessions.get(filePath);
    this.activeSessions.delete(filePath);

    return session ?? null;
  }

  /**
   * Clean up expired sessions (older than grace period)
   */
  cleanupExpiredSessions(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [filePath, session] of this.activeSessions.entries()) {
      const age = now - session.generatedAt;

      if (age > GRACE_PERIOD_MS) {
        this.activeSessions.delete(filePath);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Get statistics about tracked sessions
   */
  getStats(): {
    totalSessions: number;
    reviewedCount: number;
    unreviewedCount: number;
    averageScore: number;
    averageTimeInFocus: number;
  } {
    const sessions = Array.from(this.activeSessions.values());

    if (sessions.length === 0) {
      return {
        totalSessions: 0,
        reviewedCount: 0,
        unreviewedCount: 0,
        averageScore: 0,
        averageTimeInFocus: 0
      };
    }

    let totalScore = 0;
    let totalTime = 0;
    let reviewedCount = 0;

    for (const session of sessions) {
      totalScore += session.currentReviewScore;
      totalTime += session.totalTimeInFocus;

      if (session.wasReviewed) {
        reviewedCount++;
      }
    }

    return {
      totalSessions: sessions.length,
      reviewedCount,
      unreviewedCount: sessions.length - reviewedCount,
      averageScore: Math.round(totalScore / sessions.length),
      averageTimeInFocus: Math.round(totalTime / sessions.length)
    };
  }

  /**
   * Force update score for current active file
   */
  forceUpdateCurrentFile(): void {
    if (this.currentActiveFile) {
      const now = Date.now();
      const timeInFocus = now - this.sessionStartTime;
      this.updateTimeInFocus(this.currentActiveFile, timeInFocus);

      // Restart timer
      this.sessionStartTime = now;
    }
  }

  /**
   * Clear all sessions
   */
  clear(): void {
    this.activeSessions.clear();
    this.currentActiveFile = null;
    this.sessionStartTime = 0;
  }

  /**
   * Dispose (cleanup VSCode API hooks)
   */
  dispose(): void {
    // Update current file one last time
    if (this.currentActiveFile) {
      const now = Date.now();
      const timeInFocus = now - this.sessionStartTime;
      this.updateTimeInFocus(this.currentActiveFile, timeInFocus);
    }

    // Dispose all VSCode API listeners
    for (const disposable of this.disposables) {
      disposable.dispose();
    }

    this.disposables = [];
    this.clear();
  }
}
