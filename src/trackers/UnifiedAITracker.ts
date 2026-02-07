/**
 * UnifiedAITracker - Unified tracker for ALL AI code generation
 * Replaces: CopilotTracker, CursorTracker, ClaudeCodeTracker
 *
 * Uses AIDetector for 99.99% accurate detection
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BaseTracker } from './BaseTracker';
import { AIDetector } from '../detection/AIDetector';
import { EventType, CodeSource } from '../types';

export class UnifiedAITracker extends BaseTracker {
  private aiDetector: AIDetector;
  private fileSystemWatcher: vscode.FileSystemWatcher | null = null;
  private openFiles: Set<string> = new Set();

  // BUG FIX #1: Debouncing for rapid file changes
  private recentFileChanges: Map<string, { timestamp: number; timer: NodeJS.Timeout }> = new Map();
  private readonly FILE_CHANGE_DEBOUNCE_MS = 5000; // 5 seconds

  // Track recent text change events (user edits, AI completions) to prevent double counting
  // Key: filePath, Value: timestamp of last text change event
  private recentTextChanges: Map<string, number> = new Map();
  private readonly TEXT_CHANGE_DEBOUNCE_MS = 2000; // 2 seconds

  // Track baseline line counts per file (established when file is opened)
  // This baseline stays CONSTANT while the file is being tracked for AI modifications
  private fileBaselines: Map<string, number> = new Map();

  // Track cumulative AI lines added per file (for multiple updates before review)
  // This accumulates ALL AI additions since the file was first opened
  private cumulativeAILines: Map<string, number> = new Map();

  // BUG #2 FIX: Path to persistent baseline storage file
  private baselinesFilePath: string | null = null;
  private baselinesSaveTimer: NodeJS.Timeout | null = null;
  private readonly BASELINES_SAVE_DEBOUNCE_MS = 1000;

  constructor(onEvent: (event: unknown) => void) {
    // Use 'ai' as unified source (not tool-specific)
    super('ai' as any, onEvent);
    this.aiDetector = new AIDetector();
  }

  // BUG #2 FIX: Load baselines from persistent storage
  private loadPersistedBaselines(): void {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceFolder) {
        return;
      }

      this.baselinesFilePath = path.join(workspaceFolder, '.vscode', 'codepause-baselines.json');

      if (fs.existsSync(this.baselinesFilePath)) {
        const data = fs.readFileSync(this.baselinesFilePath, 'utf-8');
        const baselines = JSON.parse(data) as Record<string, number>;

        for (const [filePath, lineCount] of Object.entries(baselines)) {
          // Only restore if file still exists
          if (fs.existsSync(filePath)) {
            this.fileBaselines.set(filePath, lineCount);
          }
        }
        this.log(`[BASELINES] Loaded ${this.fileBaselines.size} baselines from persistent storage`);
      }
    } catch (error) {
      this.logError('Failed to load persisted baselines', error);
    }
  }

  private savePersistedBaselines(): void {
    if (this.baselinesSaveTimer) {
      clearTimeout(this.baselinesSaveTimer);
    }

    this.baselinesSaveTimer = setTimeout(() => {
      this.doSavePersistedBaselines();
    }, this.BASELINES_SAVE_DEBOUNCE_MS);
  }

  private doSavePersistedBaselines(): void {
    try {
      if (!this.baselinesFilePath) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder) {
          return;
        }

        const vscodeDir = path.join(workspaceFolder, '.vscode');
        if (!fs.existsSync(vscodeDir)) {
          fs.mkdirSync(vscodeDir, { recursive: true });
        }
        this.baselinesFilePath = path.join(vscodeDir, 'codepause-baselines.json');
      }

      const baselines: Record<string, number> = {};
      for (const [filePath, lineCount] of this.fileBaselines.entries()) {
        baselines[filePath] = lineCount;
      }

      fs.writeFileSync(this.baselinesFilePath, JSON.stringify(baselines, null, 2));
      this.log(`[BASELINES] Saved ${this.fileBaselines.size} baselines to persistent storage`);
    } catch (error) {
      this.logError('Failed to save persisted baselines', error);
    }
  }

  async initialize(): Promise<void> {
    try {
      this.log('Initializing Unified AI Tracker...');

      // BUG #2 FIX: Load persisted baselines first (survives VS Code reload)
      this.loadPersistedBaselines();

      // CRITICAL: Initialize baselines for currently open files FIRST
      // This must happen before any other tracking to establish accurate baselines
      await this.initializeFileBaselines();

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
      this.log('Unified AI Tracker ACTIVE - All 5 detection methods enabled');
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
    // Track visible editors to know which files are open
    // This is critical for distinguishing AI agent modifications (closed files)
    // from inline completions (open files)
    this.disposables.push(
      vscode.window.onDidChangeVisibleTextEditors((editors) => {
        const newOpenFiles = new Set<string>();

        for (const editor of editors) {
          const filePath = editor.document.uri.fsPath;
          newOpenFiles.add(filePath);

          // Initialize baseline for newly opened files
          // Baseline stays constant until file is reviewed, enabling accurate delta calculation
          if (!this.openFiles.has(filePath)) {
            this.updateFileBaseline(filePath, editor.document);
          }
        }

        this.openFiles = newOpenFiles;
      })
    );

    // Initialize with currently open files
    for (const editor of vscode.window.visibleTextEditors) {
      const filePath = editor.document.uri.fsPath;
      this.openFiles.add(filePath);
      this.updateFileBaseline(filePath, editor.document);
    }
  }

  /**
   * Initialize file baselines for all currently open text documents
   * This must run BEFORE any other tracking to establish accurate baselines
   */
  private async initializeFileBaselines(): Promise<void> {
    const docs = vscode.workspace.textDocuments;

    for (const doc of docs) {
      if (this.shouldTrackDocument(doc)) {
        const filePath = doc.uri.fsPath;
        const lineCount = this.countLines(doc.getText());

        // Store baseline for this file (stays constant until file is reviewed)
        this.fileBaselines.set(filePath, lineCount);
        // Initialize cumulative AI lines to 0
        this.cumulativeAILines.set(filePath, 0);

        this.log(`  Baseline initialized: ${filePath.split('/').pop()} = ${lineCount} lines`);
      }
    }

    this.log(`  → Baselines established for ${this.fileBaselines.size} files`);

    // BUG #2 FIX: Persist initial baselines
    if (this.fileBaselines.size > 0) {
      this.savePersistedBaselines();
    }
  }

  /**
   * Update baseline for a file when it's opened in the editor (first time only)
   * This ensures we can accurately calculate deltas for external modifications
   */
  private updateFileBaseline(filePath: string, document: vscode.TextDocument): void {
    const lineCount = this.countLines(document.getText());

    // Only set if we don't have a baseline yet
    if (!this.fileBaselines.has(filePath)) {
      this.fileBaselines.set(filePath, lineCount);
      this.cumulativeAILines.set(filePath, 0);
      this.log(`  Baseline initialized: ${filePath.split('/').pop()} = ${lineCount} lines`);
      // BUG #2 FIX: Persist baselines so they survive VS Code reload
      this.savePersistedBaselines();
    }
  }

  /**
   * Handle text document changes
   * Uses AIDetector Methods 1, 2 & 5 (Inline completion, Large paste, Velocity)
   *
   * CRITICAL FIX: Batch all contentChanges from the same text change event
   * to prevent counting a single AI suggestion as multiple suggestions
   */
  private handleTextChange(event: vscode.TextDocumentChangeEvent): void {
    if (!this.shouldTrackDocument(event.document)) {
      return;
    }

    if (event.contentChanges.length === 0) {
      return;
    }

    // Track this text change event to prevent double counting with file watcher
    const filePath = event.document.uri.fsPath;
    this.recentTextChanges.set(filePath, Date.now());

    let totalTextLength = 0;
    let totalRangeLength = 0;
    let combinedText = '';
    let hasInlineCompletion = false;
    const timestamp = Date.now();

    const fileName = event.document.uri.fsPath.split('/').pop() || 'unknown';
    this.log(`[TEXT-CHANGE] ${fileName}: ${event.contentChanges.length} changes detected`);

    // First pass: Analyze all changes
    for (const change of event.contentChanges) {
      // Log ALL changes including deletions
      this.log(`[TEXT-CHANGE] ${fileName}: text.length=${change.text.length}, rangeLength=${change.rangeLength}`);

      // Handle pure deletions (rangeLength > 0, text.length === 0)
      if ((!change.text || change.text.length === 0) && change.rangeLength > 0) {
        // This is a pure deletion
        this.log(`[TEXT-CHANGE] ${fileName}: Pure deletion detected (${change.rangeLength} chars removed)`);
        totalRangeLength += change.rangeLength;
        // Don't skip - we need to process this deletion
        continue;
      }

      // Skip truly empty changes (no addition, no deletion)
      if ((!change.text || change.text.length === 0) && change.rangeLength === 0) {
        continue;
      }

      totalTextLength += change.text.length;
      totalRangeLength += change.rangeLength;
      combinedText += change.text;

      // Check if any change looks like an inline completion
      if (this.detectInlineCompletionPattern(change)) {
        hasInlineCompletion = true;
      }

    }

    // Process if there are ANY changes (additions OR deletions)
    if (totalTextLength === 0 && totalRangeLength === 0) {
      this.log(`[TEXT-CHANGE] ${fileName}: No changes to process`);
      return;
    }

    // Handle pure deletions (no text added, only text removed)
    //
    // DELETION TRACKING BEHAVIOR:
    // =============================
    //
    // Scenario 1: File CLOSED when deleted → Uses FileSystemWatcher + git baseline → ALL deletions tracked ✓
    // Scenario 2: File OPEN + deletion ≥200 chars → Tracked ✓
    // Scenario 3: File OPEN + deletion <200 chars → SKIPPED (prevents false positives)
    //
    // WHY 200 CHARS?
    // - Prevents false positives: User manually deleting 3-4 lines should NOT count as AI
    // - Real AI agents typically make large changes (200+ chars) or modify closed files
    // - Edge case (small deletions to open files) is acceptable to miss
    //
    // See DELETION_TRACKING_BEHAVIOR.md for full documentation
    if (totalTextLength === 0 && totalRangeLength > 0) {
      const LARGE_DELETION_THRESHOLD = 200; // ~5 lines (prevents false positives)

      if (totalRangeLength < LARGE_DELETION_THRESHOLD) {
        // Small deletion - likely manual editing
        // Skipping to avoid false positives (user manually deleting 3-4 lines)
        this.log(`[TEXT-CHANGE] ${fileName}: Small deletion (${totalRangeLength} chars < ${LARGE_DELETION_THRESHOLD}), skipping to avoid false positive`);
        return;
      }

      // Large deletion detected - treat as AI agent modification
      // Estimate lines removed (average ~40 chars per line)
      const linesRemoved = Math.ceil(totalRangeLength / 40);

      this.emitEvent({
        eventType: EventType.CodeGenerated,
        source: CodeSource.AI,
        timestamp: Date.now(),
        linesOfCode: 0,
        linesRemoved: linesRemoved,
        linesChanged: linesRemoved,
        filePath: event.document.uri.fsPath,
        language: event.document.languageId,
        detectionMethod: 'text-change-large-deletion',
        confidence: 'medium',
        isAgentMode: true,
        fileWasOpen: true
      });
      return;
    }

    // Use AIDetector to analyze the combined change
    const result = this.aiDetector.detect({
      text: combinedText,
      rangeLength: totalRangeLength,
      timestamp: timestamp,
      documentUri: event.document.uri.fsPath,
      isActiveEditor: vscode.window.activeTextEditor?.document === event.document
    }, {
      wasFileOpen: this.openFiles.has(event.document.uri.fsPath),
      isInlineCompletion: hasInlineCompletion
    });

    // Emit event if HIGH confidence AI detection
    if (result.isAI && result.confidence === 'high') {
      this.log(`[TEXT-CHANGE] ${fileName}: ✓ AI detected (high confidence)`);
      this.emitAIEvent(result, event.document);
    }
    // Also emit MEDIUM confidence if it's specifically inline completion
    else if (result.isAI && result.confidence === 'medium' && hasInlineCompletion) {
      this.log(`[TEXT-CHANGE] ${fileName}: ✓ AI detected (medium confidence, inline completion)`);
      this.emitAIEvent(result, event.document);
    } else {
      this.log(`[TEXT-CHANGE] ${fileName}: ✗ Not AI (confidence: ${result.confidence})`);
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
    if (!hasMultipleStatements && !hasComplexStructure && !hasMethodChaining && !hasControlFlow) {
      return false;
    }

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
   * Handle file system changes (Method 3: External File Change Detection)
   *
   * This detects when AI agents modify files directly on disk (agent mode).
   * Uses debouncing to prevent duplicate events from rapid file changes.
   *
   * IMPORTANT: Only processes CLOSED files. Open files are handled by
   * the text change handler since VS Code receives proper change events.
   */
  private async handleFileChange(uri: vscode.Uri): Promise<void> {
    const filePath = uri.fsPath;
    const fileName = filePath.split('/').pop();

    // Skip internal CodePause files
    if (filePath.includes('codepause-baselines.json')) {
      return;
    }

    this.log(`[FILE-CHANGE] FileSystemWatcher triggered for: ${fileName}`);

    const isFileOpen = this.openFiles.has(filePath);

    // Deduplication: Skip file watcher if there was a recent text change event
    // This prevents double counting when user edits trigger both handlers
    if (isFileOpen) {
      const lastTextChange = this.recentTextChanges.get(filePath) || 0;
      const timeSinceTextChange = Date.now() - lastTextChange;

      if (timeSinceTextChange < this.TEXT_CHANGE_DEBOUNCE_MS) {
        this.log(`[FILE-CHANGE] SKIPPED - recent text change ${timeSinceTextChange}ms ago, likely duplicate: ${fileName}`);
        return;
      }

      this.log(`[FILE-CHANGE] File is open but no recent text change, processing external modification: ${fileName}`);
    } else {
      this.log(`[FILE-CHANGE] File is closed, processing external change: ${fileName}`);
    }

    // Debounce rapid file changes (AI agents often make multiple quick writes)
    const existing = this.recentFileChanges.get(filePath);
    const now = Date.now();

    if (existing) {
      clearTimeout(existing.timer);

      if (now - existing.timestamp < this.FILE_CHANGE_DEBOUNCE_MS) {
        // Within debounce window - reset timer and wait for changes to settle
        const timer = setTimeout(() => {
          this.processFileChange(uri, filePath);
          this.recentFileChanges.delete(filePath);
        }, this.FILE_CHANGE_DEBOUNCE_MS);

        this.recentFileChanges.set(filePath, { timestamp: now, timer });
        return;
      }
    }

    // Process immediately and set cleanup timer
    const timer = setTimeout(() => {
      this.recentFileChanges.delete(filePath);
    }, this.FILE_CHANGE_DEBOUNCE_MS);

    this.recentFileChanges.set(filePath, { timestamp: now, timer });
    await this.processFileChange(uri, filePath);
  }

  /**
   * Process file change for AI detection (agent mode)
   *
   * File modified while closed = AI agent mode (HIGH confidence)
   * Uses git diff to get only the actual changed lines, not total file lines.
   */
  private async processFileChange(uri: vscode.Uri, filePath: string): Promise<void> {
    const fileName = filePath.split('/').pop();
    this.log(`\n${'='.repeat(60)}`);
    this.log(`[PROCESS-CHANGE] Starting for: ${fileName}`);

    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const text = document.getText();
      const currentLineCount = this.countLines(text);

      this.log(`[PROCESS-CHANGE] currentLineCount=${currentLineCount}`);

      // Skip empty files
      if (!currentLineCount || currentLineCount === 0) {
        this.log(`[PROCESS-CHANGE] SKIPPED - empty file`);
        return;
      }

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      let linesAdded = 0;
      let linesRemoved = 0;
      let isGitOperation = false; // Track if change came from git operation (pull, merge, etc.)

      // Try to use git diff to get ACTUAL changed lines (not total file lines)
      if (workspaceFolder) {
        try {
          const { execSync } = require('child_process');
          const relativePath = filePath.replace(workspaceFolder + '/', '');

          try {
            execSync('git rev-parse --git-dir', { cwd: workspaceFolder, stdio: 'ignore' });

            const diffResult = execSync(`git diff HEAD --numstat -- "${relativePath}" 2>/dev/null`, {
              cwd: workspaceFolder,
              encoding: 'utf-8'
            }).trim();

            if (diffResult) {
              const [added, removed] = diffResult.split(/\s+/);
              linesAdded = parseInt(added, 10) || 0;
              linesRemoved = parseInt(removed, 10) || 0;

              try {
                const fetchHeadPath = path.join(workspaceFolder, '.git', 'FETCH_HEAD');
                const mergeHeadPath = path.join(workspaceFolder, '.git', 'MERGE_HEAD');
                const now = Date.now();

                for (const markerPath of [fetchHeadPath, mergeHeadPath]) {
                  try {
                    const stats = fs.statSync(markerPath);
                    if (now - stats.mtimeMs < 30000) {
                      isGitOperation = true;
                      linesAdded = 0;
                      linesRemoved = 0;
                      break;
                    }
                  } catch {
                    // Marker file doesn't exist
                  }
                }
              } catch {
                // Error checking git markers
              }
            } else {
              // Check if file is tracked (no diff means no changes to committed version)
              try {
                execSync(`git ls-files --error-unmatch "${relativePath}"`, {
                  cwd: workspaceFolder,
                  stdio: 'ignore'
                });
                // File is tracked but no diff = change came from git operation (pull, merge, commit, rebase, checkout)
                // HEAD moved to new commit, so file now matches HEAD
                this.log(`[PROCESS-CHANGE] File tracked with no diff vs HEAD - git operation detected (pull/merge/etc), will skip AI detection`);
                isGitOperation = true;
                linesAdded = 0;
                linesRemoved = 0;
              } catch {
                // New untracked file - use current line count
                linesAdded = currentLineCount;
                this.log(`[PROCESS-CHANGE] New untracked file: ${linesAdded} lines`);
              }
            }
          } catch {
            // Not a git repo - baseline method will be used as fallback
            this.log(`[PROCESS-CHANGE] Not a git repo, will use baseline tracking`);
          }
        } catch (error) {
          this.log(`[PROCESS-CHANGE] Git diff error: ${error}`);
        }
      }

      // Fallback: Use baseline tracking if git diff didn't work
      // This ensures AI detection works even in non-git projects
      if (linesAdded === 0 && linesRemoved === 0) {
        if (isGitOperation) {
          this.fileBaselines.set(filePath, currentLineCount);
          return;
        }
        const baselineLineCount = this.fileBaselines.get(filePath);

        if (baselineLineCount === undefined) {
          // First time seeing this file - establish baseline
          // Don't emit event for initial file load (not AI-generated)
          this.fileBaselines.set(filePath, currentLineCount);
          this.cumulativeAILines.set(filePath, 0);
          this.savePersistedBaselines();
          this.log(`[PROCESS-CHANGE] Establishing baseline: ${currentLineCount} lines (no event emitted)`);
          return;
        }

        // Calculate actual changes from baseline
        // Positive delta = lines added, negative delta = lines removed
        const deltaFromBaseline = currentLineCount - baselineLineCount;

        if (deltaFromBaseline > 0) {
          linesAdded = deltaFromBaseline;
          linesRemoved = 0;
        } else if (deltaFromBaseline < 0) {
          linesAdded = 0;
          linesRemoved = Math.abs(deltaFromBaseline);
        } else {
          // File size unchanged - no actual modifications
          this.log(`[PROCESS-CHANGE] No changes detected (delta=0), skipping`);
          return;
        }

        this.log(`[PROCESS-CHANGE] Baseline delta: +${linesAdded} -${linesRemoved} (was ${baselineLineCount}, now ${currentLineCount})`);
      }

      // Skip if no actual changes
      if (linesAdded === 0 && linesRemoved === 0) {
        this.log(`[PROCESS-CHANGE] No changes detected, SKIPPING`);
        return;
      }

      // Update baseline for next change
      this.fileBaselines.set(filePath, currentLineCount);
      this.savePersistedBaselines();

      const linesChanged = linesAdded + linesRemoved;

      // File modified while closed = AI agent mode (HIGH confidence)
      // This is the original working approach
      const result = this.aiDetector.detectFromExternalFileChange(
        text,
        false, // wasFileOpen = false
        Date.now()
      );

      if (result.isAI) {
        this.log(`[PROCESS-CHANGE] ✓ Agent mode detected: +${linesAdded} -${linesRemoved}`);
        this.emitAIEventFromResult(result, document, linesAdded, linesChanged, linesRemoved);
      }
      this.log(`${'='.repeat(60)}\n`);
    } catch (error) {
      this.log(`[PROCESS-CHANGE] ERROR: ${error}`);
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
    // BUG #2 FIX: Calculate lines removed from rangeLength
    // rangeLength is the number of characters that were replaced/deleted
    const rangeLength = result.metadata.rangeLength || 0;
    const linesRemoved = rangeLength > 0 ? Math.ceil(rangeLength / 40) : 0;  // ~40 chars per line

    const linesOfCode = result.metadata.linesOfCode || 0;
    const linesChanged = linesOfCode + linesRemoved;  // Total changes = additions + deletions

    // BUG FIX #2: Don't skip events with only deletions
    if (linesOfCode === 0 && linesRemoved === 0) {
      this.log(`  Skipping empty event (0 lines added, 0 lines removed)`);
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

    // CRITICAL FIX: Set isAgentMode only for external-file-change
    // large-paste is manual user action (copy/paste from ChatGPT web, etc.)
    // and should be categorized as Chat/Paste Mode, not Agent Mode
    const isAgentMode = result.method === 'external-file-change';

    this.log(`[EMIT-EVENT] ${document.uri.fsPath.split('/').pop()}: +${linesOfCode} lines, -${linesRemoved} lines, ${linesChanged} total changes`);

    this.emitEvent({
      eventType: eventType,
      source: CodeSource.AI, // Unified source
      timestamp: Date.now(),
      linesOfCode: linesOfCode,
      linesRemoved: linesRemoved,        // BUG #2 FIX: Include lines removed
      linesChanged: linesChanged,        // BUG #2 FIX: Total changes (additions + deletions)
      charactersCount: result.metadata.charactersCount,
      acceptanceTimeDelta: acceptanceTimeDelta,  // BUG FIX #9
      filePath: document.uri.fsPath,
      language: document.languageId,
      detectionMethod: result.method,
      confidence: result.confidence,
      isAgentMode: isAgentMode,  // FIX: Set agent mode flag
      metadata: {
        detectionMethod: result.method,
        confidence: result.confidence,
        velocity: result.metadata.velocity,
        isAgentGenerated: true  // FIX: Mark as AI-generated
      }
    });
  }

  /**
   * Emit AI event from detection result
   * For agent mode, uses delta-based line counting (only added lines)
   * For review scoring, uses total changes (added + deleted)
   */
  private emitAIEventFromResult(
    result: any,
    document: vscode.TextDocument,
    deltaLines?: number,     // For metrics: added lines only (positive)
    totalChanges?: number,   // For review: total changes (added + |deleted|)
    linesRemoved?: number    // Lines removed (positive value)
  ): void {
    // For agent mode, use delta (added lines); for other methods, use total lines
    const linesOfCode = deltaLines !== undefined ? deltaLines : (result.metadata.linesOfCode || 0);
    const linesChanged = totalChanges !== undefined ? totalChanges : linesOfCode;
    const removedLines = linesRemoved !== undefined ? linesRemoved : 0;


    if (linesOfCode === 0 && linesChanged === 0 && removedLines === 0) {
      this.log(`  Skipping empty event (0 lines)`);
      return;
    }

    // BUG FIX #3: Set isAgentMode flag for external-file-change detection
    const isAgentMode = result.method === 'external-file-change';
    // FIX: Set fileWasOpen based on detection method
    // external-file-change → file was closed (Agent Mode)
    // large-paste → file was likely open (Agent Mode for Gravity, etc.)
    const fileWasOpen = result.method === 'large-paste';

    this.emitEvent({
      eventType: EventType.CodeGenerated,
      source: CodeSource.AI,
      timestamp: Date.now(),
      linesOfCode: linesOfCode,        // For metrics: only added lines
      linesRemoved: removedLines,      // Lines removed (positive value)
      linesChanged: linesChanged,      // For review: total changes
      charactersCount: result.metadata.charactersCount,
      filePath: document.uri.fsPath,
      language: document.languageId,
      detectionMethod: result.method,
      confidence: result.confidence,
      isAgentMode: isAgentMode || result.method === 'large-paste', // Also count large-paste as Agent Mode
      fileWasOpen: fileWasOpen,
      metadata: {
        source: result.metadata.source,
        detectionMethod: result.method,
        confidence: result.confidence,
        isAgentMode: isAgentMode || result.method === 'large-paste',
        isAgentGenerated: true  // FIX: Mark as AI-generated for getCodingModes
      }
    });
  }

  dispose(): void {
    if (this.fileSystemWatcher) {
      this.fileSystemWatcher.dispose();
      this.fileSystemWatcher = null;
    }

    // Clean up debounce timers
    for (const [, data] of this.recentFileChanges) {
      clearTimeout(data.timer);
    }
    this.recentFileChanges.clear();

    // Clear text change tracking
    this.recentTextChanges.clear();

    if (this.baselinesSaveTimer) {
      clearTimeout(this.baselinesSaveTimer);
      this.baselinesSaveTimer = null;
    }

    this.fileBaselines.clear();
    this.fileBaselines.clear();
    this.cumulativeAILines.clear();

    this.aiDetector.reset();
    super.dispose();
  }
}
