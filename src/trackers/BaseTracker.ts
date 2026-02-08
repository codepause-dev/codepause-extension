/**
 * BaseTracker
 * Abstract base class for most of AI trackers
 */

import * as vscode from 'vscode';
import { AITool, ITracker, TrackingEvent } from '../types';

export abstract class BaseTracker implements ITracker {
  protected disposables: vscode.Disposable[] = [];
  protected isActiveFlag: boolean = false;

  constructor(
    public readonly tool: AITool,
    protected onEvent: (event: TrackingEvent) => void
  ) {}

  abstract initialize(): Promise<void>;

  isActive(): boolean {
    return this.isActiveFlag;
  }

  dispose(): void {
    this.isActiveFlag = false;
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }

  protected emitEvent(event: Partial<TrackingEvent>): void {
    const fullEvent: TrackingEvent = {
      timestamp: event.timestamp ?? Date.now(),
      tool: this.tool,
      eventType: event.eventType!,
      linesOfCode: event.linesOfCode,
      linesRemoved: event.linesRemoved,
      linesChanged: event.linesChanged,
      charactersCount: event.charactersCount,
      acceptanceTimeDelta: event.acceptanceTimeDelta,
      filePath: event.filePath,
      language: event.language,
      sessionId: event.sessionId,
      metadata: event.metadata,
      // Phase 2: Unified source tracking fields
      source: event.source,
      detectionMethod: event.detectionMethod,
      confidence: event.confidence,
      // BUG FIX #3: Pass through agent mode fields
      isAgentMode: event.isAgentMode,
      agentSessionId: event.agentSessionId,
      fileWasOpen: event.fileWasOpen
    };

    this.onEvent(fullEvent);
  }

  protected getLanguage(document: vscode.TextDocument): string {
    return document.languageId;
  }

  /**
   * Extract file path from document URI (handles diff views, git views, etc.)
   */
  protected getFilePath(document: vscode.TextDocument): string {
    const uri = document.uri;

    // Regular file
    if (uri.scheme === 'file') {
      return uri.fsPath;
    }

    // Diff view: vscode-diff:///path/to/file.js
    if (uri.scheme.includes('diff')) {
      return uri.path || uri.fsPath;
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
    return uri.fsPath || uri.path;
  }

  protected countLines(text: string): number {
    if (!text || text.trim().length === 0) {
      return 0;
    }

    // BUG FIX #4: Fix off-by-one line counting
    // Count actual newline characters to match file line count
    // A file with "line1\nline2\nline3" has 3 lines
    // A file with "line1\nline2\nline3\n" has 3 lines (trailing newline doesn't add extra line)

    const lines = text.split('\n');

    // Remove trailing empty line caused by trailing newline
    // "text\n" splits to ["text", ""] - we want to count as 1 line, not 2
    if (lines.length > 1 && lines[lines.length - 1].trim() === '') {
      return Math.max(1, lines.length - 1);
    }

    // No trailing newline or single line
    return Math.max(1, lines.length);
  }

  protected countCharacters(text: string): number {
    return text.length;
  }

  protected shouldTrackDocument(document: vscode.TextDocument): boolean {
    // Skip untitled documents
    if (document.isUntitled) {
      return false;
    }

    // Skip output channels, git diff, etc.
    if (document.uri.scheme !== 'file') {
      return false;
    }

    // Skip very large files (> 1MB)
    if (document.getText().length > 1024 * 1024) {
      return false;
    }

    // Skip internal CodePause files
    const filePath = document.uri.fsPath;
    if (filePath && filePath.includes('codepause-baselines.json')) {
      return false;
    }

    return true;
  }

  protected generateId(): string {
    return `${this.tool}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  protected log(message: string, ...args: unknown[]): void {
    console.log(`[CodePause:${this.tool}]`, message, ...args);
  }

  protected logError(message: string, error?: unknown): void {
    console.error(`[CodePause:${this.tool}]`, message, error);
  }
}
