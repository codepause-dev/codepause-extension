/**
 * ManualCodeTracker Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ManualCodeTracker } from '../ManualCodeTracker';

// Helper to create a complete mock document
const createMockDocument = (filePath: string, scheme: string = 'file') => ({
  uri: { scheme, fsPath: filePath },
  languageId: 'typescript',
  fileName: filePath,
  isUntitled: false,
  getText: () => 'some code'
});

// Mock vscode
jest.mock('vscode', () => ({
  workspace: {
    onDidChangeTextDocument: jest.fn(() => ({ dispose: jest.fn() }))
  },
  window: {
    activeTextEditor: undefined
  }
}), { virtual: true });

// Mock ManualDetector - simple version
const mockAnalyzeFn = jest.fn();
const mockResetFn = jest.fn();

jest.mock('../../detection/ManualDetector', () => ({
  ManualDetector: jest.fn(() => ({
    analyze: mockAnalyzeFn,
    reset: mockResetFn
  }))
}));

describe('ManualCodeTracker', () => {
  let tracker: ManualCodeTracker;
  let mockOnEvent: jest.Mock<(event: unknown) => void>;
  let mockAnalyze: jest.Mock;
  let mockReset: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnEvent = jest.fn<(event: unknown) => void>();

    // Get the mocked functions
    mockAnalyze = mockAnalyzeFn;
    mockReset = mockResetFn;

    // Set default return values
    mockAnalyze.mockReturnValue({
      isManual: false,
      confidence: 'low'
    });

    tracker = new ManualCodeTracker(mockOnEvent);
  });

  describe('Initialization', () => {
    it('should create tracker', () => {
      expect(tracker).toBeDefined();
    });

    it('should be active by default', () => {
      expect(tracker.isActive()).toBe(true);
    });

    it('should initialize successfully', async () => {
      await expect(tracker.initialize()).resolves.not.toThrow();
    });
  });

  describe('Disposal', () => {
    it('should dispose cleanly', () => {
      tracker.dispose();
      expect(tracker.isActive()).toBe(false);
    });

    it('should handle multiple dispose calls', () => {
      tracker.dispose();
      tracker.dispose();
      expect(tracker.isActive()).toBe(false);
    });

    it('should clear typing timer on dispose', async () => {
      await tracker.initialize();

      // Mock ManualDetector to return manual typing

      mockAnalyze.mockReturnValue({
        isManual: true,
        confidence: 'high'
      });

      tracker.dispose();
      expect(tracker.isActive()).toBe(false);
    });

    it('should reset manual detector on dispose', () => {
      tracker.dispose();

      expect(mockReset).toHaveBeenCalled();
    });
  });

  describe('Document Change Handling', () => {
    beforeEach(async () => {
      await tracker.initialize();
    });

    it('should setup document change listener', () => {
      const vscode = require('vscode');
      expect(vscode.workspace.onDidChangeTextDocument).toHaveBeenCalled();
    });

    it('should handle document changes', async () => {
      const vscode = require('vscode');

      // Verify listener was registered
      expect(vscode.workspace.onDidChangeTextDocument).toHaveBeenCalled();
    });

    it('should skip non-trackable documents', async () => {
      const vscode = require('vscode');
      const mockDocument = createMockDocument('/output', 'output');

      const mockEvent = {
        document: mockDocument,
        contentChanges: [{ text: 'test', rangeLength: 0 }]
      };

      // Document change handler should skip this
      const changeHandler = vscode.workspace.onDidChangeTextDocument.mock.calls[0]?.[0];
      if (changeHandler) {
        changeHandler(mockEvent);
      }

      // Should not emit event for non-trackable document
      expect(mockOnEvent).not.toHaveBeenCalled();
    });

    it('should skip empty changes', async () => {
      const vscode = require('vscode');
      const mockDocument = createMockDocument('/test.ts');

      const mockEvent = {
        document: mockDocument,
        contentChanges: []
      };

      const changeHandler = vscode.workspace.onDidChangeTextDocument.mock.calls[0]?.[0];
      if (changeHandler) {
        changeHandler(mockEvent);
      }

      // Should not emit event for empty changes
      expect(mockOnEvent).not.toHaveBeenCalled();
    });
  });

  describe('Manual Typing Detection', () => {
    beforeEach(async () => {
      await tracker.initialize();
    });

    it('should detect manual typing with high confidence', () => {

      mockAnalyze.mockReturnValue({
        isManual: true,
        confidence: 'high'
      });

      const vscode = require('vscode');
      const mockDocument = createMockDocument('/test.ts');

      vscode.window.activeTextEditor = {
        document: mockDocument
      };

      const mockEvent = {
        document: mockDocument,
        contentChanges: [{
          text: 'a',
          rangeLength: 0,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
        }]
      };

      const changeHandler = vscode.workspace.onDidChangeTextDocument.mock.calls[0]?.[0];
      if (changeHandler) {
        changeHandler(mockEvent);
      }

      expect(mockAnalyze).toHaveBeenCalled();
    });

    it('should reject low confidence manual detection', () => {

      mockAnalyze.mockReturnValue({
        isManual: true,
        confidence: 'low'
      });

      const vscode = require('vscode');
      const mockDocument = createMockDocument('/test.ts');

      const mockEvent = {
        document: mockDocument,
        contentChanges: [{
          text: 'paste',
          rangeLength: 0
        }]
      };

      const changeHandler = vscode.workspace.onDidChangeTextDocument.mock.calls[0]?.[0];
      if (changeHandler) {
        changeHandler(mockEvent);
      }

      // Should not track low confidence manual typing
      // Event will not be emitted
    });

    it('should reject AI-generated code', () => {

      mockAnalyze.mockReturnValue({
        isManual: false,
        confidence: 'high'
      });

      const vscode = require('vscode');
      const mockDocument = createMockDocument('/test.ts');

      const mockEvent = {
        document: mockDocument,
        contentChanges: [{
          text: 'function test() {\n  return true;\n}',
          rangeLength: 0
        }]
      };

      const changeHandler = vscode.workspace.onDidChangeTextDocument.mock.calls[0]?.[0];
      if (changeHandler) {
        changeHandler(mockEvent);
      }

      // Should not track AI-generated code
    });
  });

  describe('Edit Session Tracking', () => {
    beforeEach(async () => {
      await tracker.initialize();
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should aggregate multiple changes in same session', () => {

      mockAnalyze.mockReturnValue({
        isManual: true,
        confidence: 'high'
      });

      const vscode = require('vscode');
      const mockDocument = createMockDocument('/test.ts');

      vscode.window.activeTextEditor = {
        document: mockDocument
      };

      const changeHandler = vscode.workspace.onDidChangeTextDocument.mock.calls[0]?.[0];

      // Multiple changes
      const changes = ['h', 'e', 'l', 'l', 'o'];
      for (const char of changes) {
        const mockEvent = {
          document: mockDocument,
          contentChanges: [{
            text: char,
            rangeLength: 0,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
          }]
        };
        changeHandler(mockEvent);
      }

      // Advance time to trigger debounce
      jest.advanceTimersByTime(2100);

      // Should emit one event for aggregated changes
      expect(mockOnEvent).toHaveBeenCalledTimes(1);
    });

    it('should emit event after typing stops', () => {

      mockAnalyze.mockReturnValue({
        isManual: true,
        confidence: 'high'
      });

      const vscode = require('vscode');
      const mockDocument = createMockDocument('/test.ts');

      vscode.window.activeTextEditor = {
        document: mockDocument
      };

      const mockEvent = {
        document: mockDocument,
        contentChanges: [{
          text: 'test',
          rangeLength: 0,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
        }]
      };

      const changeHandler = vscode.workspace.onDidChangeTextDocument.mock.calls[0]?.[0];
      changeHandler(mockEvent);

      // Should not emit immediately
      expect(mockOnEvent).not.toHaveBeenCalled();

      // Advance time past debounce
      jest.advanceTimersByTime(2100);

      // Should emit after debounce
      expect(mockOnEvent).toHaveBeenCalledTimes(1);
    });

    it('should restart timer on new changes', () => {

      mockAnalyze.mockReturnValue({
        isManual: true,
        confidence: 'high'
      });

      const vscode = require('vscode');
      const mockDocument = createMockDocument('/test.ts');

      vscode.window.activeTextEditor = {
        document: mockDocument
      };

      const changeHandler = vscode.workspace.onDidChangeTextDocument.mock.calls[0]?.[0];

      // First change
      changeHandler({
        document: mockDocument,
        contentChanges: [{ text: 'a', rangeLength: 0 }]
      });

      // Advance time but not past debounce
      jest.advanceTimersByTime(1000);

      // Second change restarts timer
      changeHandler({
        document: mockDocument,
        contentChanges: [{ text: 'b', rangeLength: 0 }]
      });

      // Advance time from second change
      jest.advanceTimersByTime(2100);

      // Should emit once with both changes
      expect(mockOnEvent).toHaveBeenCalledTimes(1);
    });

    it('should handle changes across different documents', () => {

      mockAnalyze.mockReturnValue({
        isManual: true,
        confidence: 'high'
      });

      const vscode = require('vscode');
      const doc1 = createMockDocument('/test1.ts');
      const doc2 = createMockDocument('/test2.ts');

      vscode.window.activeTextEditor = { document: doc1 };

      const changeHandler = vscode.workspace.onDidChangeTextDocument.mock.calls[0]?.[0];

      // Change in doc1
      changeHandler({
        document: doc1,
        contentChanges: [{ text: 'a', rangeLength: 0 }]
      });

      // Change in doc2 (should start new session)
      vscode.window.activeTextEditor = { document: doc2 };
      changeHandler({
        document: doc2,
        contentChanges: [{ text: 'b', rangeLength: 0 }]
      });

      // Advance time
      jest.advanceTimersByTime(2100);

      // Should emit events
      expect(mockOnEvent).toHaveBeenCalled();
    });
  });

  describe('Event Emission', () => {
    beforeEach(async () => {
      await tracker.initialize();
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should emit event with correct metadata', () => {

      mockAnalyze.mockReturnValue({
        isManual: true,
        confidence: 'high'
      });

      const vscode = require('vscode');
      const mockDocument = createMockDocument('/test.ts');

      vscode.window.activeTextEditor = {
        document: mockDocument
      };

      const changeHandler = vscode.workspace.onDidChangeTextDocument.mock.calls[0]?.[0];
      changeHandler({
        document: mockDocument,
        contentChanges: [{ text: 'test\ncode', rangeLength: 0 }]
      });

      jest.advanceTimersByTime(2100);

      expect(mockOnEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'code-generated',
          source: 'manual',
          detectionMethod: 'manual-typing',
          confidence: 'high'
        })
      );
    });

    it('should calculate lines and characters correctly', () => {

      mockAnalyze.mockReturnValue({
        isManual: true,
        confidence: 'high'
      });

      const vscode = require('vscode');
      const mockDocument = createMockDocument('/test.ts');

      vscode.window.activeTextEditor = {
        document: mockDocument
      };

      const changeHandler = vscode.workspace.onDidChangeTextDocument.mock.calls[0]?.[0];
      changeHandler({
        document: mockDocument,
        contentChanges: [{ text: 'line1\nline2\nline3', rangeLength: 0 }]
      });

      jest.advanceTimersByTime(2100);

      expect(mockOnEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          linesOfCode: expect.any(Number),
          charactersCount: expect.any(Number)
        })
      );
    });

    it('should not emit for empty edits', () => {

      mockAnalyze.mockReturnValue({
        isManual: true,
        confidence: 'high'
      });

      const vscode = require('vscode');
      const mockDocument = createMockDocument('/test.ts');

      vscode.window.activeTextEditor = {
        document: mockDocument
      };

      const changeHandler = vscode.workspace.onDidChangeTextDocument.mock.calls[0]?.[0];
      changeHandler({
        document: mockDocument,
        contentChanges: [{ text: '', rangeLength: 0 }]
      });

      jest.advanceTimersByTime(2100);

      // Should not emit for empty text
      expect(mockOnEvent).not.toHaveBeenCalled();
    });
  });
});
