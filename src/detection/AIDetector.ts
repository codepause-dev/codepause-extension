/**
 * AIDetector - Unified AI Code Detection
 *
 * TARGET ACCURACY: 99.99% (NO false negatives)
 * Better to mark uncertain cases as AI than miss AI code
 *
 * Detection Methods (5):
 * 1. Inline Completion API - VS Code API events (HIGH confidence)
 * 2. Large Paste - >100 characters with code structure (HIGH confidence)
 * 3. External File Change - File modified while closed (HIGH confidence)
 * 4. Git Commit Markers - Explicit AI tags in commits (HIGH confidence)
 * 5. Change Velocity - >500 chars/second (MEDIUM confidence)
 */

import {
  AIDetectionResult,
  AIDetectionMethod,
  CodeChangeEvent
} from './types';

export class AIDetector {
  // Method 2: Large paste threshold
  private readonly LARGE_PASTE_THRESHOLD = 100; // characters

  // Method 5: Velocity threshold
  private readonly HIGH_VELOCITY_THRESHOLD = 500; // chars/second
  private readonly VELOCITY_WINDOW_MS = 1000; // 1 second window
  private recentChanges: Array<{ timestamp: number; chars: number }> = [];

  // AI marker patterns for Method 4
  private readonly AI_MARKERS = [
    /Co-Authored-By:\s*Claude/i,
    /@claude-code/i,
    /Generated with Claude Code/i,
    /GitHub Copilot/i,
    /Cursor AI/i,
    /AI-generated/i,
    /\[AI\]/i
  ];

  // Code structure patterns for Method 2
  private readonly CODE_PATTERNS = [
    /[(){}[\];]/,           // Braces, brackets, semicolons
    /\bfunction\b|\bconst\b|\blet\b|\bvar\b/,  // Keywords
    /\bclass\b|\binterface\b|\btype\b/,  // Type definitions
    /\bimport\b|\bexport\b|\brequire\b/,  // Module imports
    /\bif\b|\belse\b|\bfor\b|\bwhile\b/   // Control flow
  ];

  /**
   * Method 1: Detect from Inline Completion patterns
   * Detects Copilot, Cursor, and other inline completion acceptances
   * via characteristic patterns in text changes
   *
   * Called when text change matches inline completion characteristics:
   * - Instantaneous insertion (10-300 chars)
   * - No replacement (insertion only)
   * - Code structure present
   * - Complete/partial statements
   *
   * @returns HIGH confidence AI detection
   */
  detectFromInlineCompletion(
    text: string,
    timestamp: number
  ): AIDetectionResult {
    return {
      isAI: true,
      confidence: 'high',
      method: AIDetectionMethod.InlineCompletionAPI,
      metadata: {
        source: 'inline-completion-api',
        charactersCount: text.length,
        linesOfCode: this.countLines(text),
        timestamp
      }
    };
  }

  /**
   * Method 2: Detect from large paste
   * Checks if text is >100 chars AND has code structure
   *
   * @returns HIGH confidence if large paste with code structure
   */
  detectFromLargePaste(event: CodeChangeEvent): AIDetectionResult {
    const text = event.text;
    const chars = text.length;

    // Check if paste is large enough
    if (chars >= this.LARGE_PASTE_THRESHOLD) {
      // Analyze if it has code structure
      const hasCodeStructure = this.hasCodeStructure(text);

      if (hasCodeStructure) {
        return {
          isAI: true,
          confidence: 'high',
          method: AIDetectionMethod.LargePaste,
          metadata: {
            source: 'large-paste',
            charactersCount: chars,
            linesOfCode: this.countLines(text),
            timestamp: event.timestamp
          }
        };
      }
    }

    // Not a large paste or no code structure
    return {
      isAI: false,
      confidence: 'low',
      method: AIDetectionMethod.LargePaste,
      metadata: {
        charactersCount: chars,
        linesOfCode: this.countLines(text),
        timestamp: event.timestamp
      }
    };
  }

  /**
   * Method 3: Detect from external file change
   * If file was modified while NOT open in editor = MUST be AI
   *
   * @returns HIGH confidence if file was closed
   */
  detectFromExternalFileChange(
    text: string,
    wasFileOpen: boolean,
    timestamp: number
  ): AIDetectionResult {
    if (!wasFileOpen) {
      // File modified while closed = definitively AI (agent mode)
      return {
        isAI: true,
        confidence: 'high',
        method: AIDetectionMethod.ExternalFileChange,
        metadata: {
          source: 'external-file-change',
          charactersCount: text.length,
          linesOfCode: this.countLines(text),
          timestamp
        }
      };
    }

    // File was open, can't determine from this method
    return {
      isAI: false,
      confidence: 'low',
      method: AIDetectionMethod.ExternalFileChange,
      metadata: {
        charactersCount: text.length,
        linesOfCode: this.countLines(text),
        timestamp
      }
    };
  }

  /**
   * Method 4: Detect from Git commit markers
   * Checks commit message and diff for AI markers
   *
   * @returns HIGH confidence if AI markers found
   */
  detectFromGitMarkers(
    commitMessage: string,
    diff: string,
    timestamp: number
  ): AIDetectionResult {
    // Check commit message for AI markers
    const hasMarker = this.AI_MARKERS.some(pattern =>
      pattern.test(commitMessage) || pattern.test(diff)
    );

    if (hasMarker) {
      // Count lines/chars from diff
      const stats = this.parseDiffStats(diff);

      return {
        isAI: true,
        confidence: 'high',
        method: AIDetectionMethod.GitCommitMarker,
        metadata: {
          source: 'git-commit',
          charactersCount: stats.chars,
          linesOfCode: stats.lines,
          timestamp
        }
      };
    }

    return {
      isAI: false,
      confidence: 'low',
      method: AIDetectionMethod.GitCommitMarker,
      metadata: {
        charactersCount: 0,
        linesOfCode: 0,
        timestamp
      }
    };
  }

  /**
   * Method 5: Detect from change velocity
   * If >500 chars/second = likely AI
   *
   * @returns MEDIUM confidence (heuristic-based)
   */
  detectFromVelocity(event: CodeChangeEvent): AIDetectionResult {
    const now = event.timestamp;
    const chars = event.text.length;

    // Add to recent changes
    this.recentChanges.push({ timestamp: now, chars });

    // Remove changes outside velocity window
    this.recentChanges = this.recentChanges.filter(
      c => (now - c.timestamp) < this.VELOCITY_WINDOW_MS
    );

    // Calculate velocity (chars/second)
    const totalChars = this.recentChanges.reduce((sum, c) => sum + c.chars, 0);
    const velocity = totalChars / (this.VELOCITY_WINDOW_MS / 1000);

    if (velocity > this.HIGH_VELOCITY_THRESHOLD) {
      return {
        isAI: true,
        confidence: 'medium', // Heuristic, not definitive
        method: AIDetectionMethod.ChangeVelocity,
        metadata: {
          source: 'high-velocity',
          charactersCount: totalChars,
          linesOfCode: this.countLines(event.text),
          timestamp: now,
          velocity: Math.round(velocity)
        }
      };
    }

    return {
      isAI: false,
      confidence: 'low',
      method: AIDetectionMethod.ChangeVelocity,
      metadata: {
        charactersCount: chars,
        linesOfCode: this.countLines(event.text),
        timestamp: now,
        velocity: Math.round(velocity)
      }
    };
  }

  /**
   * Unified detection method - uses all 5 methods
   * Returns result with highest confidence
   *
   * Priority (highest confidence wins):
   * 1. Inline completion (if pattern matches) - HIGH confidence
   * 2. External file change - HIGH confidence
   * 3. Large paste - HIGH confidence
   * 4. Git commit markers - HIGH confidence
   * 5. Change velocity - MEDIUM confidence
   */
  detect(
    event: CodeChangeEvent,
    context?: {
      wasFileOpen?: boolean;
      commitMessage?: string;
      diff?: string;
      isInlineCompletion?: boolean;
    }
  ): AIDetectionResult {
    const results: AIDetectionResult[] = [];

    // Method 1: Inline completion (HIGHEST PRIORITY for inline suggestions)
    if (context?.isInlineCompletion) {
      // If pattern already matched in tracker, this is HIGH confidence
      const inlineResult = this.detectFromInlineCompletion(event.text, event.timestamp);
      // Return immediately - no need to check other methods
      // Inline completion is definitive when pattern matches
      return inlineResult;
    }

    // Method 3: External file change (if applicable) - HIGH confidence
    if (context?.wasFileOpen !== undefined) {
      const externalResult = this.detectFromExternalFileChange(
        event.text,
        context.wasFileOpen,
        event.timestamp
      );
      if (externalResult.isAI) {
        // File modified while closed = definitely AI
        return externalResult;
      }
    }

    // Method 2: Large paste - HIGH confidence
    const pasteResult = this.detectFromLargePaste(event);
    if (pasteResult.isAI) {
      results.push(pasteResult);
    }

    // Method 4: Git markers (if applicable) - HIGH confidence
    if (context?.commitMessage && context?.diff) {
      const gitResult = this.detectFromGitMarkers(
        context.commitMessage,
        context.diff,
        event.timestamp
      );
      if (gitResult.isAI) {
        results.push(gitResult);
      }
    }

    // Method 5: Velocity - MEDIUM confidence
    results.push(this.detectFromVelocity(event));

    // Find highest confidence result
    return this.selectBestResult(results);
  }

  /**
   * Select best result from multiple detection methods
   * Priority: HIGH > MEDIUM > LOW
   */
  private selectBestResult(results: AIDetectionResult[]): AIDetectionResult {
    // Filter to only AI detections
    const aiResults = results.filter(r => r.isAI);

    if (aiResults.length === 0) {
      // No AI detected by any method
      return results[0] || {
        isAI: false,
        confidence: 'low',
        method: AIDetectionMethod.LargePaste,
        metadata: {
          charactersCount: 0,
          linesOfCode: 0,
          timestamp: Date.now()
        }
      };
    }

    // Find highest confidence
    const highConfidence = aiResults.find(r => r.confidence === 'high');
    if (highConfidence) {
      return highConfidence;
    }

    const mediumConfidence = aiResults.find(r => r.confidence === 'medium');
    if (mediumConfidence) {
      return mediumConfidence;
    }

    return aiResults[0];
  }

  /**
   * Check if text has code structure (not just plain text)
   */
  private hasCodeStructure(text: string): boolean {
    // Must match at least 2 code patterns
    const matchCount = this.CODE_PATTERNS.filter(pattern =>
      pattern.test(text)
    ).length;

    return matchCount >= 2;
  }

  /**
   * Count lines in text
   * BUG FIX #4: Handle trailing newlines correctly
   */
  private countLines(text: string): number {
    if (text.length === 0) {
      return 0;
    }
    // Split by newlines
    const lines = text.split('\n');
    // If the last element is empty (trailing newline), don't count it
    if (lines[lines.length - 1] === '') {
      return lines.length - 1;
    }
    return lines.length;
  }

  /**
   * Parse diff stats (lines and chars added)
   */
  private parseDiffStats(diff: string): { lines: number; chars: number } {
    // Simple parsing: count '+' lines
    const lines = diff.split('\n').filter(line => line.startsWith('+')).length;
    const chars = diff.length;

    return { lines, chars };
  }

  /**
   * Reset velocity tracking (for new session)
   */
  reset(): void {
    this.recentChanges = [];
  }
}
