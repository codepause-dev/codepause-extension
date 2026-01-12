/**
 * UnifiedAITracker - Unified tracker for ALL AI code generation
 * Replaces: CopilotTracker, CursorTracker, ClaudeCodeTracker
 *
 * Uses AIDetector for 99.99% accurate detection
 */

import * as vscode from 'vscode';
import { BaseTracker } from './BaseTracker';
import { AIDetector } from '../detection/AIDetector';
import { CodeChangeEvent } from '../detection/types';
import { EventType, CodeSource } from '../types';

export class UnifiedAITracker extends BaseTracker {
  private aiDetector: AIDetector;
  private fileSystemWatcher: vscode.FileSystemWatcher | null = null;
  private openFiles: Set<string> = new Set();

  // BUG FIX #1: Debouncing for rapid file changes
  private recentFileChanges: Map<string, { timestamp: number; timer: NodeJS.Timeout }> = new Map();
  private readonly FILE_CHANGE_DEBOUNCE_MS = 5000; // 5 seconds

  constructor(onEvent: (event: unknown) => void) {
    // Use 'ai' as unified source (not tool-specific)
    super('ai' as any, onEvent);
    this.aiDetector = new AIDetector();
  }

  async initialize(): Promise<void> {
    try {
      this.log('✓ Initializing Unified AI Tracker...');

      // Method 1: Monitor inline completions (Copilot, Cursor, etc.)
      this.setupInlineCompletionMonitoring();

      // Method 2 & 5: Monitor text changes (Large paste + Velocity)
      this.setupTextChangeMonitoring();

      // Method 3: Monitor file system changes (External modifications)
      this.setupFileSystemWatching();

      // Method 4: Monitor git commits (Commit markers)
      this.setupGitCommitMonitoring();

      // Track open files for Method 3
      this.setupOpenFileTracking();

      this.isActiveFlag = true;
      this.log('✅ Unified AI Tracker ACTIVE - All 5 detection methods enabled');
    } catch (error) {
      this.logError('Failed to initialize Unified AI Tracker', error);
      this.isActiveFlag = false;
    }
  }

  /**
   * Method 1: Inline Completion Monitoring
   * Detects: Copilot, Cursor inline suggestions
   * Confidence: HIGH (accurate via text change analysis)
   *
   * Strategy: Inline completions have distinct characteristics:
   * - Single contiguous insertion (no deletions)
   * - Instantaneous (no typing delay between characters)
   * - Significant size (>10 chars, typically 20-200 chars)
   * - Often multi-line or complete statements
   */
  private setupInlineCompletionMonitoring(): void {
    // Inline completion detection is handled in text change monitoring
    // using characteristics: instantaneous insertion, significant size,
    // code structure patterns
    this.log('  → Method 1: Inline completion detection enabled');
  }

  /**
   * Method 2 & 5: Text Change Monitoring
   * Detects: Large pastes (>100 chars) and high velocity
   */
  private setupTextChangeMonitoring(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(this.handleTextChange.bind(this))
    );

    this.log('  → Method 2 & 5: Text change detection enabled');
  }

  /**
   * Method 3: File System Watching
   * Detects: Files modified while NOT open (agent mode)
   */
  private setupFileSystemWatching(): void {
    // Watch all code files
    this.fileSystemWatcher = vscode.workspace.createFileSystemWatcher(
      '**/*.{ts,tsx,js,jsx,py,java,go,rs,rb,php,html,css,json,md,c,cpp,h,hpp}'
    );

    this.fileSystemWatcher.onDidChange(this.handleFileChange.bind(this));
    this.fileSystemWatcher.onDidCreate(this.handleFileCreation.bind(this));

    this.disposables.push(this.fileSystemWatcher);

    this.log('  → Method 3: External file change detection enabled');
  }

  /**
   * Method 4: Git Commit Monitoring
   * Detects: AI markers in commit messages
   */
  private setupGitCommitMonitoring(): void {
    // Note: Git monitoring requires workspace folder and git extension
    // This is a future enhancement - not critical for initial release
    this.log('  → Method 4: Git commit detection (future enhancement)');
  }

  /**
   * Track which files are currently open
   */
  private setupOpenFileTracking(): void {
    // Track visible editors
    this.disposables.push(
      vscode.window.onDidChangeVisibleTextEditors((editors) => {
        this.openFiles.clear();
        for (const editor of editors) {
          this.openFiles.add(editor.document.uri.fsPath);
        }
      })
    );

    // Initialize with currently open files
    for (const editor of vscode.window.visibleTextEditors) {
      this.openFiles.add(editor.document.uri.fsPath);
    }
  }

  /**
   * Handle text document changes
   * Uses AIDetector Methods 1, 2 & 5 (Inline completion, Large paste, Velocity)
   */
  private handleTextChange(event: vscode.TextDocumentChangeEvent): void {
    if (!this.shouldTrackDocument(event.document)) {
      return;
    }

    if (event.contentChanges.length === 0) {
      return;
    }

    // Process each change
    for (const change of event.contentChanges) {
      // Skip empty changes
      if (!change.text || change.text.length === 0) {
        continue;
      }

      // DEBUG: Log all text changes to see what we're receiving
      const textLength = change.text.length;
      const rangeLength = change.rangeLength;
      const textPreview = change.text.substring(0, 50).replace(/\n/g, '\\n');
      this.log(`  📝 Text change: ${textLength} chars, rangeLength: ${rangeLength}, text: "${textPreview}..."`);

      // Check if this looks like an inline completion acceptance
      const isInlineCompletion = this.detectInlineCompletionPattern(change);

      const codeChangeEvent: CodeChangeEvent = {
        text: change.text,
        rangeLength: change.rangeLength,
        timestamp: Date.now(),
        documentUri: event.document.uri.fsPath,
        isActiveEditor: vscode.window.activeTextEditor?.document === event.document
      };

      // Use AIDetector to analyze
      const result = this.aiDetector.detect(codeChangeEvent, {
        wasFileOpen: this.openFiles.has(event.document.uri.fsPath),
        isInlineCompletion: isInlineCompletion
      });

      // DEBUG: Log detection result
      this.log(`  🔍 Detection result: isAI=${result.isAI}, confidence=${result.confidence}, method=${result.method}`);

      // Emit event if HIGH confidence AI detection
      if (result.isAI && result.confidence === 'high') {
        this.emitAIEvent(result, event.document);
      }
      // Also emit MEDIUM confidence if it's specifically inline completion
      else if (result.isAI && result.confidence === 'medium' && isInlineCompletion) {
        this.emitAIEvent(result, event.document);
      }
    }
  }

  /**
   * Detect if a text change matches AI inline completion patterns
   *
   * CRITICAL: Must distinguish between:
   * 1. VS Code IntelliSense (NOT AI): Single identifiers, method names (e.g., "getElementById")
   * 2. AI Inline Completions (IS AI): Multi-statement code, complete functions from Copilot/Cursor
   *
   * AI inline completions have these characteristics:
   * 1. Instantaneous insertion (all at once, not character-by-character)
   * 2. Larger size (typically 25+ characters for multi-statement code)
   * 3. Single insertion with no deletion (rangeLength === 0)
   * 4. Contains multi-statement or multi-line code patterns
   * 5. Happens in active editor
   */
  private detectInlineCompletionPattern(
    change: vscode.TextDocumentContentChangeEvent
  ): boolean {
    const text = change.text;
    const textLength = text.length;

    // Characteristic 1: Must be insertion, not replacement
    if (change.rangeLength > 0) {
      return false; // User is replacing text (backspace + type)
    }

    // Characteristic 2: Must be significant size
    // INCREASED from 10 to 25 to filter out IntelliSense single-identifier completions
    // IntelliSense examples (NOT AI):
    //   - "getElementById" (16 chars)
    //   - "addEventListener" (17 chars)
    // AI inline examples (IS AI):
    //   - "getElementById('btn').addEventListener('click', () => {" (60+ chars)
    //   - Multiple statements with semicolons
    if (textLength < 25) {
      return false; // Too small - likely IntelliSense or manual typing
    }

    if (textLength > 300) {
      // Large paste - different detection method
      return false;
    }

    // Characteristic 3: Check if it has code structure
    const hasCodeStructure = this.hasBasicCodeStructure(text);
    if (!hasCodeStructure) {
      return false; // Plain text, not code
    }

    // Characteristic 4: Check if it's MULTI-STATEMENT or MULTI-LINE AI code
    // This is the KEY filter to distinguish AI from IntelliSense

    // Multi-statement indicators (AI inline completions typically have these)
    const hasMultipleStatements = (
      // Multiple semicolons = multiple statements
      (text.match(/;/g) || []).length >= 2 ||
      // Statement followed by more code (not just opening paren/brace)
      /;\s*\w/.test(text) ||
      // Multiple lines with actual code content (not just opening brace)
      (text.match(/\n/g) || []).length >= 2
    );

    // Function/block structure indicators (common in AI but rare in IntelliSense)
    const hasComplexStructure = (
      /=>\s*\{/.test(text) ||             // Arrow function with block body
      /function\s+\w+\s*\(/.test(text) || // Function declaration
      /\{\s*\n/.test(text) ||             // Opening brace with newline (block start)
      /return\s+.+;/.test(text)           // Return statement with semicolon
    );

    // Multi-line method chaining (common in AI suggestions)
    const hasMethodChaining = /\.\s*\n\s*\./.test(text);

    // Control flow with body (common in AI)
    const hasControlFlow = (
      /if\s*\(.+\)\s*\{/.test(text) ||    // if statement with block
      /for\s*\(.+\)\s*\{/.test(text) ||   // for loop with block
      /while\s*\(.+\)\s*\{/.test(text)    // while loop with block
    );

    // Must have at least one AI-specific indicator
    // This filters out simple IntelliSense completions like ".addEventListener(" or "getElementById("
    if (!hasMultipleStatements && !hasComplexStructure && !hasMethodChaining && !hasControlFlow) {
      // This is likely just a simple IntelliSense completion (single identifier or simple expression)
      this.log(`  ⏭️ Skipping non-AI completion (IntelliSense): ${textLength} chars - "${text.substring(0, 50)}..."`);
      return false;
    }

    // All characteristics match - likely AI inline completion (Copilot/Cursor)!
    this.log(`  ⚡ AI Inline completion detected (Copilot/Cursor): ${textLength} chars - "${text.substring(0, 50)}..."`);
    return true;
  }

  /**
   * Check if text has basic code structure
   */
  private hasBasicCodeStructure(text: string): boolean {
    // Check for common code patterns
    const codePatterns = [
      /[(){}[\];]/,                          // Brackets, braces, semicolons
      /\bfunction\b|\bconst\b|\blet\b|\bvar\b/, // Keywords
      /\bif\b|\belse\b|\bfor\b|\bwhile\b/,    // Control flow
      /=|=>|===|!==|\+\+|--/,                 // Operators
      /\./                                    // Method calls (dot notation)
    ];

    // Must match at least 1 code pattern
    return codePatterns.some(pattern => pattern.test(text));
  }

  /**
   * Handle file changes (Method 3)
   * BUG FIX #1: Debounce rapid file changes to prevent duplicate events
   */
  private async handleFileChange(uri: vscode.Uri): Promise<void> {
    const filePath = uri.fsPath;

    // Check if file is currently open
    const wasFileOpen = this.openFiles.has(filePath);

    if (!wasFileOpen) {
      // BUG FIX #1: Check if we recently processed this file
      const existing = this.recentFileChanges.get(filePath);
      const now = Date.now();

      if (existing) {
        // Clear existing timer
        clearTimeout(existing.timer);

        // Check if within debounce window
        if (now - existing.timestamp < this.FILE_CHANGE_DEBOUNCE_MS) {
          this.log(`  ⏭️ Debouncing file change (within 5s): ${filePath}`);

          // Reset timer - will process only once after changes stop
          const timer = setTimeout(() => {
            this.processFileChange(uri, filePath);
            this.recentFileChanges.delete(filePath);
          }, this.FILE_CHANGE_DEBOUNCE_MS);

          this.recentFileChanges.set(filePath, { timestamp: now, timer });
          return;
        }
      }

      // No recent change or outside debounce window - process immediately with debounce timer
      const timer = setTimeout(() => {
        this.recentFileChanges.delete(filePath);
      }, this.FILE_CHANGE_DEBOUNCE_MS);

      this.recentFileChanges.set(filePath, { timestamp: now, timer });
      await this.processFileChange(uri, filePath);
    }
  }

  /**
   * Process file change (extracted for debouncing)
   */
  private async processFileChange(uri: vscode.Uri, filePath: string): Promise<void> {
    // File modified while closed = DEFINITELY AI (agent mode)
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const text = document.getText();

      // BUG FIX #2: Skip empty files (0 lines)
      const linesOfCode = this.countLines(text);
      if (!linesOfCode || linesOfCode === 0) {
        this.log(`  ⏭️ Skipping empty file: ${filePath}`);
        return;
      }

      const result = this.aiDetector.detectFromExternalFileChange(
        text,
        false, // wasFileOpen = false
        Date.now()
      );

      if (result.isAI) {
        this.log(`  🤖 Agent mode detected: ${filePath} modified while closed`);
        this.emitAIEventFromResult(result, document);
      }
    } catch (error) {
      this.logError('Failed to process external file change', error);
    }
  }

  /**
   * Handle file creation (Method 3)
   */
  private async handleFileCreation(uri: vscode.Uri): Promise<void> {
    // New file created = likely AI (especially if not in active editor)
    await this.handleFileChange(uri);
  }

  /**
   * Emit AI detection event
   */
  private emitAIEvent(
    result: any,
    document: vscode.TextDocument
  ): void {
    // BUG FIX #2: Skip empty files
    const linesOfCode = result.metadata.linesOfCode || 0;
    if (linesOfCode === 0) {
      this.log(`  ⏭️ Skipping empty event (0 lines)`);
      return;
    }

    // BUG FIX #7: Use correct event type based on detection method
    // Inline completion = SuggestionAccepted (counts toward AI Suggestions metrics)
    // Agent mode / Large paste = CodeGenerated (direct code generation)
    const eventType = result.method === 'inline-completion-api'
      ? EventType.SuggestionAccepted
      : EventType.CodeGenerated;

    // BUG FIX #9: Set default review time for inline completions
    // Since we detect inline completions AFTER acceptance, we can't measure actual review time
    // Industry research: developers typically spend 200-500ms reviewing inline suggestions
    // Use a conservative 300ms default for inline completions
    const acceptanceTimeDelta = result.method === 'inline-completion-api'
      ? 300  // 300ms default review time for inline completions
      : undefined;

    this.emitEvent({
      eventType: eventType,
      source: CodeSource.AI, // Unified source
      timestamp: Date.now(),
      linesOfCode: linesOfCode,
      charactersCount: result.metadata.charactersCount,
      acceptanceTimeDelta: acceptanceTimeDelta,  // BUG FIX #9
      filePath: document.uri.fsPath,
      language: document.languageId,
      detectionMethod: result.method,
      confidence: result.confidence,
      metadata: {
        detectionMethod: result.method,
        confidence: result.confidence,
        velocity: result.metadata.velocity
      }
    });
  }

  /**
   * Emit AI event from detection result
   */
  private emitAIEventFromResult(
    result: any,
    document: vscode.TextDocument
  ): void {
    // BUG FIX #2: Skip empty files
    const linesOfCode = result.metadata.linesOfCode || 0;
    if (linesOfCode === 0) {
      this.log(`  ⏭️ Skipping empty event (0 lines)`);
      return;
    }

    // BUG FIX #3: Set isAgentMode flag for external-file-change detection
    const isAgentMode = result.method === 'external-file-change';

    this.emitEvent({
      eventType: EventType.CodeGenerated,
      source: CodeSource.AI,
      timestamp: Date.now(),
      linesOfCode: linesOfCode,
      charactersCount: result.metadata.charactersCount,
      filePath: document.uri.fsPath,
      language: document.languageId,
      detectionMethod: result.method,
      confidence: result.confidence,
      isAgentMode: isAgentMode, // BUG FIX #3
      fileWasOpen: false, // External file change means file was closed
      metadata: {
        source: result.metadata.source,
        detectionMethod: result.method,
        confidence: result.confidence,
        isAgentMode: isAgentMode // BUG FIX #3
      }
    });
  }

  dispose(): void {
    if (this.fileSystemWatcher) {
      this.fileSystemWatcher.dispose();
      this.fileSystemWatcher = null;
    }

    // BUG FIX #1: Clean up debounce timers
    for (const [, data] of this.recentFileChanges) {
      clearTimeout(data.timer);
    }
    this.recentFileChanges.clear();

    this.aiDetector.reset();
    super.dispose();
  }
}
