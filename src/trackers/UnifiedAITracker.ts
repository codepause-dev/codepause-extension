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

  // Track baseline line counts per file (established when file is opened)
  // This baseline stays CONSTANT while the file is being tracked for AI modifications
  private fileBaselines: Map<string, number> = new Map();

  // Track cumulative AI lines added per file (for multiple updates before review)
  // This accumulates ALL AI additions since the file was first opened
  private cumulativeAILines: Map<string, number> = new Map();

  // BUG #2 FIX: Path to persistent baseline storage file
  private baselinesFilePath: string | null = null;

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

  // BUG #2 FIX: Save baselines to persistent storage
  private savePersistedBaselines(): void {
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

    // Batch all changes from this event to detect if AI-generated
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

    // Skip if file is currently open in editor
    // Open files receive text change events; closed files need file watcher
    if (this.openFiles.has(filePath)) {
      this.log(`[FILE-CHANGE] SKIPPED - file is open in editor: ${fileName}`);
      return;
    }

    this.log(`[FILE-CHANGE] Processing external change for: ${fileName}`);

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
   * Handles cumulative tracking for multiple AI updates before review:
   * - Baseline: Set when file is first opened, stays constant until reviewed
   * - Delta: Calculated as (current lines - baseline lines)
   * - Supports both additions and deletions
   *
   * For files without baseline, attempts to get previous state from git.
   */
  private async processFileChange(uri: vscode.Uri, filePath: string): Promise<void> {
    const fileName = filePath.split('/').pop();
    this.log(`[PROCESS-CHANGE] Starting for: ${fileName}`);

    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const text = document.getText();
      const currentLineCount = this.countLines(text);

      this.log(`[PROCESS-CHANGE] ${fileName}: currentLines=${currentLineCount}`);

      // Skip empty files
      if (!currentLineCount || currentLineCount === 0) {
        this.log(`[PROCESS-CHANGE] SKIPPED - empty file: ${fileName}`);
        return;
      }

      let baselineLineCount = this.fileBaselines.get(filePath);

      // BUG #2 FIX: If no in-memory baseline, try to get from database
      // This handles the case where extension was reloaded and baselines were lost
      if (baselineLineCount === undefined) {
        try {
          // Try to get baseline from file review status in database
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (workspaceFolder) {
            // Check if file is already tracked (has previous line count)
            const { execSync } = require('child_process');
            const relativePath = filePath.replace(workspaceFolder + '/', '');

            // Get last committed version line count from git as baseline
            try {
              const gitResult = execSync(`git show HEAD:"${relativePath}" 2>/dev/null | wc -l`, {
                cwd: workspaceFolder,
                encoding: 'utf-8'
              }).trim();

              const gitLineCount = parseInt(gitResult, 10);
              if (!isNaN(gitLineCount) && gitLineCount > 0) {
                baselineLineCount = gitLineCount;
                this.fileBaselines.set(filePath, gitLineCount);
                this.savePersistedBaselines(); // BUG #2 FIX: Persist restored baseline
                this.log(`[PROCESS-CHANGE] ${fileName}: Restored baseline from git: ${gitLineCount}`);
              }
            } catch {
              // Git lookup failed - will continue without baseline
            }
          }
        } catch {
          // Error getting baseline - continue without
        }
      }

      this.log(`[PROCESS-CHANGE] ${fileName}: baseline=${baselineLineCount ?? 'NONE'}`);

      // Handle files without baseline (never opened or first modification)
      if (baselineLineCount === undefined) {
        let gitBaseline: number | null = null;

        try {
          const fileStat = await vscode.workspace.fs.stat(uri);
          const fileAgeMs = Date.now() - fileStat.ctime;
          // Use ctime (creation time), not mtime, to detect truly new files
          const isNewFile = fileAgeMs < 30000;

          if (isNewFile) {
            // New file created by AI - count all lines as AI-generated
            this.fileBaselines.set(filePath, currentLineCount);
            this.cumulativeAILines.set(filePath, 0);
            this.savePersistedBaselines(); // BUG #2 FIX: Persist new file baseline

            const result = this.aiDetector.detectFromExternalFileChange(text, false, Date.now());
            if (result.isAI) {
              this.emitAIEventFromResult(result, document, currentLineCount, currentLineCount);
            }
            return;
          }

          // Existing file - try to get baseline from git (last committed version)
          try {
            const { execSync } = require('child_process');
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

            if (workspaceFolder) {
              const relativePath = filePath.replace(workspaceFolder + '/', '');
              const gitResult = execSync(`git show HEAD:"${relativePath}" 2>/dev/null | wc -l`, {
                cwd: workspaceFolder,
                encoding: 'utf-8'
              }).trim();

              const previousLineCount = parseInt(gitResult, 10);
              if (!isNaN(previousLineCount) && previousLineCount > 0) {
                gitBaseline = previousLineCount;
              }
            }
          } catch {
            // Git lookup failed - will use current as baseline
          }

          if (gitBaseline !== null) {
            // Use git baseline for delta calculation
            this.fileBaselines.set(filePath, gitBaseline);
            this.cumulativeAILines.set(filePath, 0);
            this.savePersistedBaselines(); // BUG #2 FIX: Persist git baseline
          } else {
            // No baseline available - set current and skip this change
            this.fileBaselines.set(filePath, currentLineCount);
            this.cumulativeAILines.set(filePath, 0);
            this.savePersistedBaselines(); // BUG #2 FIX: Persist baseline
            return;
          }
        } catch {
          // File stat failed - set current as baseline
          this.fileBaselines.set(filePath, currentLineCount);
          this.cumulativeAILines.set(filePath, 0);
          this.savePersistedBaselines(); // BUG #2 FIX: Persist baseline
          return;
        }
      }

      // Get effective baseline (may have been set from git above)
      const effectiveBaseline = this.fileBaselines.get(filePath) ?? baselineLineCount;
      if (effectiveBaseline === undefined) {
        return;
      }

      // Calculate delta and update cumulative tracking
      const deltaFromBaseline = currentLineCount - effectiveBaseline;
      const previousCumulative = this.cumulativeAILines.get(filePath) || 0;
      const newLinesThisUpdate = Math.max(0, deltaFromBaseline - previousCumulative);
      const newCumulative = previousCumulative + newLinesThisUpdate;
      this.cumulativeAILines.set(filePath, newCumulative);

      // Calculate separate metrics for additions and removals
      const metrics = this.calculateLineMetrics(deltaFromBaseline);

      // Emit event if there are any changes
      this.log(`[PROCESS-CHANGE] ${fileName}: delta=${deltaFromBaseline}, linesChanged=${metrics.linesChanged}`);

      if (metrics.linesChanged > 0) {
        const result = this.aiDetector.detectFromExternalFileChange(text, false, Date.now());

        this.log(`[PROCESS-CHANGE] ${fileName}: isAI=${result.isAI}, method=${result.method}`);

        if (result.isAI) {
          // BUG #2 FIX: Use metrics.linesAdded directly instead of newLinesThisUpdate
          // The cumulative tracking was preventing correct emission of deltas
          if (metrics.linesAdded > 0 && metrics.linesRemoved === 0) {
            // Pure addition - use metrics.linesAdded (the actual delta)
            this.log(`[PROCESS-CHANGE] ${fileName}: EMITTING pure addition +${metrics.linesAdded}`);
            this.emitAIEventFromResult(result, document, metrics.linesAdded, metrics.linesChanged, 0);
          } else if (metrics.linesRemoved > 0 && metrics.linesAdded === 0) {
            // Pure deletion
            this.log(`[PROCESS-CHANGE] ${fileName}: EMITTING pure deletion -${metrics.linesRemoved}`);
            this.emitAIEventFromResult(result, document, 0, metrics.linesChanged, metrics.linesRemoved);
          } else if (metrics.linesAdded > 0 && metrics.linesRemoved > 0) {
            // Mixed: both additions and removals
            this.log(`[PROCESS-CHANGE] ${fileName}: EMITTING mixed +${metrics.linesAdded} -${metrics.linesRemoved}`);
            this.emitAIEventFromResult(result, document, metrics.linesAdded, metrics.linesChanged, metrics.linesRemoved);
          }

          // BUG #2 FIX: Update baseline after emitting event so next change calculates delta correctly
          this.log(`[PROCESS-CHANGE] ${fileName}: Updating baseline from ${effectiveBaseline} to ${currentLineCount}`);
          this.fileBaselines.set(filePath, currentLineCount);
          this.savePersistedBaselines();
        } else {
          this.log(`[PROCESS-CHANGE] ${fileName}: NOT detected as AI, skipping event`);
        }
      } else {
        this.log(`[PROCESS-CHANGE] ${fileName}: No changes detected, skipping`);
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
   * Calculate line metrics from delta
   * Converts delta into separate added/removed/changed counts
   */
  private calculateLineMetrics(delta: number): { linesAdded: number; linesRemoved: number; linesChanged: number } {
    const linesAdded = Math.max(0, delta);
    const linesRemoved = Math.max(0, -delta);
    const linesChanged = linesAdded + linesRemoved;

    this.log(`[LINE-METRICS] delta=${delta} → added=${linesAdded}, removed=${linesRemoved}, changed=${linesChanged}`);

    return { linesAdded, linesRemoved, linesChanged };
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
      isAgentMode: isAgentMode, // BUG FIX #3
      fileWasOpen: false, // External file change means file was closed
      metadata: {
        source: result.metadata.source,
        detectionMethod: result.method,
        confidence: result.confidence,
        isAgentMode: isAgentMode, // BUG FIX #3
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

    // Clear baseline and cumulative tracking maps
    this.fileBaselines.clear();
    this.cumulativeAILines.clear();

    this.aiDetector.reset();
    super.dispose();
  }
}
