/**
 * ManualDetector - Detects manually typed code
 *
 * CRITICAL REQUIREMENT: Zero false positives
 * Better to miss manual code than falsely classify AI as manual
 *
 * Detection Criteria (ALL 4 must be true for HIGH confidence):
 * 1. Single-char typing OR small edits (<100 chars)
 * 2. Gradual editing (not large paste)
 * 3. Active editor focus (user is looking at the code)
 * 4. Human typing speed (20-500ms between keypresses)
 */

import {
  ManualDetectionResult,
  CodeChangeEvent,
  TypingEvent,
  DetectionConfidence
} from './types';

export class ManualDetector {
  private typingHistory: TypingEvent[] = [];
  private readonly TYPING_HISTORY_SIZE = 10;

  // Human typing speed constraints
  private readonly HUMAN_TYPING_MIN_MS = 20;   // Minimum 20ms between keys
  private readonly HUMAN_TYPING_MAX_MS = 500;  // Maximum 500ms for continuous typing

  // Size thresholds
  private readonly SINGLE_CHAR_THRESHOLD = 1;
  private readonly GRADUAL_EDIT_THRESHOLD = 100;

  /**
   * Analyze a code change event to determine if it's manual typing
   *
   * @param event Code change event to analyze
   * @returns Detection result with confidence level
   */
  analyze(event: CodeChangeEvent): ManualDetectionResult {
    const characteristics = {
      singleCharTyping: this.detectSingleCharTyping(event),
      gradualEditing: this.detectGradualEditing(event),
      activeFocus: this.detectActiveFocus(event),
      humanSpeed: this.detectHumanSpeed(event)
    };

    // Count how many characteristics are true
    const trueCount = Object.values(characteristics).filter(v => v).length;

    // Determine if manual (strict criteria)
    const isManual = trueCount === 4; // ALL must be true for manual

    // Calculate confidence
    let confidence: DetectionConfidence;
    if (trueCount === 4) {
      confidence = 'high';  // All characteristics match
    } else if (trueCount === 3) {
      confidence = 'medium'; // Most characteristics match
    } else {
      confidence = 'low';    // Few characteristics match
    }

    return {
      isManual,
      confidence,
      characteristics,
      metadata: {
        charactersCount: event.text.length,
        linesOfCode: this.countLines(event.text),
        timestamp: event.timestamp
      }
    };
  }

  /**
   * Check 1: Single-character typing
   * True if inserting 1 character OR deleting 1 character
   */
  private detectSingleCharTyping(event: CodeChangeEvent): boolean {
    // Single char insertion: text.length === 1, rangeLength === 0
    // Single char deletion: text.length === 0, rangeLength === 1
    const isSingleCharInsertion = event.text.length === this.SINGLE_CHAR_THRESHOLD && event.rangeLength === 0;
    const isSingleCharDeletion = event.text.length === 0 && event.rangeLength === this.SINGLE_CHAR_THRESHOLD;

    return isSingleCharInsertion || isSingleCharDeletion;
  }

  /**
   * Check 2: Gradual editing
   * True if change is less than 100 characters
   */
  private detectGradualEditing(event: CodeChangeEvent): boolean {
    return event.text.length < this.GRADUAL_EDIT_THRESHOLD;
  }

  /**
   * Check 3: Active editor focus
   * True if the file is currently in the active editor
   */
  private detectActiveFocus(event: CodeChangeEvent): boolean {
    return event.isActiveEditor;
  }

  /**
   * Check 4: Human typing speed
   * True if typing deltas are in human range (20-500ms)
   */
  private detectHumanSpeed(event: CodeChangeEvent): boolean {
    // Add this event to typing history
    this.typingHistory.push({
      timestamp: event.timestamp,
      chars: event.text.length
    });

    // Keep only last N events
    if (this.typingHistory.length > this.TYPING_HISTORY_SIZE) {
      this.typingHistory.shift();
    }

    // Need at least 2 events to calculate speed
    if (this.typingHistory.length < 2) {
      return true; // Not enough data, give benefit of doubt
    }

    // Calculate time deltas between consecutive typing events
    const deltas: number[] = [];
    for (let i = 1; i < this.typingHistory.length; i++) {
      const delta = this.typingHistory[i].timestamp - this.typingHistory[i - 1].timestamp;
      deltas.push(delta);
    }

    // Count how many deltas are in human range
    const validDeltas = deltas.filter(
      d => d >= this.HUMAN_TYPING_MIN_MS && d <= this.HUMAN_TYPING_MAX_MS
    );

    // At least 60% of deltas should be in human range
    const validPercentage = validDeltas.length / deltas.length;
    return validPercentage >= 0.6;
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
   * Reset typing history (for new session or file)
   */
  reset(): void {
    this.typingHistory = [];
  }

  /**
   * Get current typing history for debugging
   */
  getTypingHistory(): TypingEvent[] {
    return [...this.typingHistory];
  }
}
