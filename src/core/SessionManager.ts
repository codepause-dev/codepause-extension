/**
 * SessionManager
 * Manages coding sessions, tracks activity, and handles session lifecycle
 */

import { CodingSession, AITool, SESSION_IDLE_TIMEOUT_MS } from '../types';
import { MetricsRepository } from '../storage/MetricsRepository';

export class SessionManager {
  private currentSession: CodingSession | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private onSessionEnd?: (session: CodingSession) => void;

  constructor(
    private metricsRepo: MetricsRepository,
    onSessionEnd?: (session: CodingSession) => void
  ) {
    this.onSessionEnd = onSessionEnd;
  }

  startSession(): CodingSession {
    // End current session if exists
    if (this.currentSession) {
      this.endSession();
    }

    this.currentSession = {
      id: this.generateSessionId(),
      startTime: Date.now(),
      eventCount: 0,
      aiLinesGenerated: 0,
      manualLinesWritten: 0,
      toolsUsed: []
    };

    this.resetIdleTimer();

    return this.currentSession;
  }

  getCurrentSession(): CodingSession | null {
    return this.currentSession ? { ...this.currentSession } : null;
  }

  hasActiveSession(): boolean {
    return this.currentSession !== null;
  }

  recordEvent(tool: AITool, linesOfCode?: number): void {
    if (!this.currentSession) {
      this.startSession();
    }

    if (this.currentSession) {
      this.currentSession.eventCount++;

      if (linesOfCode) {
        this.currentSession.aiLinesGenerated += linesOfCode;
      }

      if (!this.currentSession.toolsUsed.includes(tool)) {
        this.currentSession.toolsUsed.push(tool);
      }

      this.resetIdleTimer();
    }
  }

  recordManualLines(lines: number): void {
    if (!this.currentSession) {
      this.startSession();
    }

    if (this.currentSession) {
      this.currentSession.manualLinesWritten += lines;
      this.resetIdleTimer();
    }
  }

  async endSession(): Promise<CodingSession | null> {
    if (!this.currentSession) {
      return null;
    }

    const now = Date.now();
    this.currentSession.endTime = now;
    this.currentSession.duration = now - this.currentSession.startTime;

    // Save session to database
    try {
      await this.metricsRepo.saveSession(this.currentSession);
    } catch (error) {
      console.error('[CodePause:SessionManager] Error saving session:', error);
    }

    // Trigger callback
    if (this.onSessionEnd) {
      this.onSessionEnd(this.currentSession);
    }

    const endedSession = this.currentSession;
    this.currentSession = null;

    // Clear idle timer
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    return endedSession;
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    this.idleTimer = setTimeout(() => {
      this.endSession();
    }, SESSION_IDLE_TIMEOUT_MS);
  }

  getSessionDuration(): number {
    if (!this.currentSession) {
      return 0;
    }

    if (this.currentSession.duration) {
      return this.currentSession.duration;
    }

    return Date.now() - this.currentSession.startTime;
  }

  getSessionStats(): {
    duration: number;
    eventCount: number;
    aiLines: number;
    manualLines: number;
    toolsUsed: AITool[];
    aiPercentage: number;
  } | null {
    if (!this.currentSession) {
      return null;
    }

    const duration = this.getSessionDuration();
    const totalLines = this.currentSession.aiLinesGenerated + this.currentSession.manualLinesWritten;
    const aiPercentage =
      totalLines > 0 ? (this.currentSession.aiLinesGenerated / totalLines) * 100 : 0;

    return {
      duration,
      eventCount: this.currentSession.eventCount,
      aiLines: this.currentSession.aiLinesGenerated,
      manualLines: this.currentSession.manualLinesWritten,
      toolsUsed: [...this.currentSession.toolsUsed],
      aiPercentage
    };
  }

  async getRecentSessions(limit: number = 10): Promise<CodingSession[]> {
    return await this.metricsRepo.getRecentSessions(limit);
  }

  async getSession(sessionId: string): Promise<CodingSession | null> {
    return await this.metricsRepo.getSession(sessionId);
  }

  async forceEndSession(): Promise<void> {
    await this.endSession();
  }

  dispose(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    // Don't end session on dispose - let MetricsCollector handle it
    this.currentSession = null;
  }

  private generateSessionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `session-${timestamp}-${random}`;
  }
}
