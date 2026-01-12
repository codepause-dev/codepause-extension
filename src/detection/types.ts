/**
 * Detection System Type Definitions
 * Core types for AI vs Manual code detection
 */

export enum AIDetectionMethod {
  InlineCompletionAPI = 'inline-completion-api',      // Method 1: VS Code API
  LargePaste = 'large-paste',                        // Method 2: >100 char paste
  ExternalFileChange = 'external-file-change',       // Method 3: Closed file modified
  GitCommitMarker = 'git-commit-marker',             // Method 4: Explicit AI markers
  ChangeVelocity = 'change-velocity'                 // Method 5: Too fast = AI
}

export type DetectionConfidence = 'high' | 'medium' | 'low';

export interface AIDetectionResult {
  isAI: boolean;
  confidence: DetectionConfidence;
  method: AIDetectionMethod;
  metadata: {
    source?: string;
    charactersCount: number;
    linesOfCode: number;
    timestamp: number;
    velocity?: number; // chars/second (for velocity method)
  };
}

export interface ManualDetectionResult {
  isManual: boolean;
  confidence: DetectionConfidence;
  characteristics: {
    singleCharTyping: boolean;    // 1 char per change
    gradualEditing: boolean;       // <100 chars per change
    activeFocus: boolean;          // File is open and focused
    humanSpeed: boolean;           // 20-500ms between keypresses
  };
  metadata: {
    charactersCount: number;
    linesOfCode: number;
    timestamp: number;
  };
}

export interface CodeChangeEvent {
  text: string;
  rangeLength: number;
  timestamp: number;
  documentUri: string;
  isActiveEditor: boolean;
}

export interface TypingEvent {
  timestamp: number;
  chars: number;
}
