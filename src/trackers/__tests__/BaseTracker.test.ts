/**
 * BaseTracker Unit Tests
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BaseTracker } from '../BaseTracker';
import { AITool, EventType, TrackingEvent } from '../../types';
import * as vscode from 'vscode';

// Mock vscode
jest.mock('vscode', () => ({
  Disposable: class {
    dispose = jest.fn();
  }
}), { virtual: true });

// Concrete implementation for testing
class TestTracker extends BaseTracker {
  async initialize(): Promise<void> {
    this.isActiveFlag = true;
  }

  // Expose protected methods for testing
  public testEmitEvent(event: Partial<TrackingEvent>): void {
    this.emitEvent(event);
  }

  public testGetLanguage(document: vscode.TextDocument): string {
    return this.getLanguage(document);
  }

  public testGetFilePath(document: vscode.TextDocument): string {
    return this.getFilePath(document);
  }

  public testCountLines(text: string): number {
    return this.countLines(text);
  }

  public testCountCharacters(text: string): number {
    return this.countCharacters(text);
  }

  public testShouldTrackDocument(document: vscode.TextDocument): boolean {
    return this.shouldTrackDocument(document);
  }

  public testGenerateId(): string {
    return this.generateId();
  }

  public testLog(message: string, ...args: unknown[]): void {
    this.log(message, ...args);
  }

  public testLogError(message: string, error?: unknown): void {
    this.logError(message, error);
  }
}

describe('BaseTracker', () => {
  let tracker: TestTracker;
  let mockOnEvent: jest.Mock<(event: TrackingEvent) => void>;

  beforeEach(() => {
    mockOnEvent = jest.fn<(event: TrackingEvent) => void>();
    tracker = new TestTracker(AITool.Copilot, mockOnEvent);
  });

  describe('Initialization', () => {
    it('should initialize with inactive state', () => {
      expect(tracker.isActive()).toBe(false);
    });

    it('should set tool correctly', () => {
      expect(tracker.tool).toBe(AITool.Copilot);
    });

    it('should activate after initialization', async () => {
      await tracker.initialize();
      expect(tracker.isActive()).toBe(true);
    });
  });

  describe('Event Emission', () => {
    it('should emit complete tracking event', () => {
      const partialEvent: Partial<TrackingEvent> = {
        eventType: EventType.SuggestionAccepted,
        linesOfCode: 10,
        filePath: '/test/file.ts',
        language: 'typescript'
      };

      tracker.testEmitEvent(partialEvent);

      expect(mockOnEvent).toHaveBeenCalledTimes(1);
      const emittedEvent = mockOnEvent.mock.calls[0][0];
      expect(emittedEvent.tool).toBe(AITool.Copilot);
      expect(emittedEvent.eventType).toBe(EventType.SuggestionAccepted);
      expect(emittedEvent.linesOfCode).toBe(10);
      expect(emittedEvent.timestamp).toBeDefined();
    });

    it('should use provided timestamp', () => {
      const timestamp = 1234567890;
      const partialEvent: Partial<TrackingEvent> = {
        timestamp,
        eventType: EventType.CodeGenerated
      };

      tracker.testEmitEvent(partialEvent);

      const emittedEvent = mockOnEvent.mock.calls[0][0];
      expect(emittedEvent.timestamp).toBe(timestamp);
    });

    it('should pass through all optional fields', () => {
      const partialEvent: Partial<TrackingEvent> = {
        eventType: EventType.SuggestionAccepted,
        acceptanceTimeDelta: 2000,
        sessionId: 'session-123',
        metadata: { key: 'value' },
        detectionMethod: 'inline-completion-api',
        confidence: 'high',
        isAgentMode: true,
        agentSessionId: 'agent-123',
        fileWasOpen: false
      };

      tracker.testEmitEvent(partialEvent);

      const emittedEvent = mockOnEvent.mock.calls[0][0];
      expect(emittedEvent.acceptanceTimeDelta).toBe(2000);
      expect(emittedEvent.sessionId).toBe('session-123');
      expect(emittedEvent.metadata).toEqual({ key: 'value' });
      expect(emittedEvent.detectionMethod).toBe('inline-completion-api');
      expect(emittedEvent.confidence).toBe('high');
      expect(emittedEvent.isAgentMode).toBe(true);
      expect(emittedEvent.agentSessionId).toBe('agent-123');
      expect(emittedEvent.fileWasOpen).toBe(false);
    });
  });

  describe('Document Helpers', () => {
    it('should get language from document', () => {
      const mockDoc = {
        languageId: 'typescript'
      } as vscode.TextDocument;

      const language = tracker.testGetLanguage(mockDoc);
      expect(language).toBe('typescript');
    });

    it('should get file path from regular file URI', () => {
      const mockDoc = {
        uri: {
          scheme: 'file',
          fsPath: '/path/to/file.ts',
          path: '/path/to/file.ts'
        }
      } as vscode.TextDocument;

      const filePath = tracker.testGetFilePath(mockDoc);
      expect(filePath).toBe('/path/to/file.ts');
    });

    it('should handle diff view URIs', () => {
      const mockDoc = {
        uri: {
          scheme: 'vscode-diff',
          fsPath: '',
          path: '/path/to/file.ts'
        }
      } as vscode.TextDocument;

      const filePath = tracker.testGetFilePath(mockDoc);
      expect(filePath).toBe('/path/to/file.ts');
    });

    it('should handle git URIs', () => {
      const mockDoc = {
        uri: {
          scheme: 'git',
          fsPath: '/path/to/file.ts',
          path: '/path/to/file.ts'
        }
      } as vscode.TextDocument;

      const filePath = tracker.testGetFilePath(mockDoc);
      expect(filePath).toBe('/path/to/file.ts');
    });

    it('should handle untitled URIs', () => {
      const mockDoc = {
        uri: {
          scheme: 'untitled',
          fsPath: '',
          path: 'Untitled-1'
        }
      } as vscode.TextDocument;

      const filePath = tracker.testGetFilePath(mockDoc);
      expect(filePath).toBe('Untitled-1');
    });
  });

  describe('Line Counting', () => {
    it('should count lines correctly', () => {
      expect(tracker.testCountLines('line1\nline2\nline3')).toBe(3);
    });

    it('should handle trailing newline', () => {
      expect(tracker.testCountLines('line1\nline2\nline3\n')).toBe(3);
    });

    it('should handle single line', () => {
      expect(tracker.testCountLines('single line')).toBe(1);
    });

    it('should handle empty string', () => {
      expect(tracker.testCountLines('')).toBe(0);
    });

    it('should handle whitespace only', () => {
      // Whitespace-only with trailing newline gets trimmed and returns 0
      expect(tracker.testCountLines('   \n   \n')).toBe(0);
    });

    it('should return at least 1 for non-empty text', () => {
      expect(tracker.testCountLines('x')).toBe(1);
    });
  });

  describe('Character Counting', () => {
    it('should count characters correctly', () => {
      expect(tracker.testCountCharacters('hello world')).toBe(11);
    });

    it('should handle empty string', () => {
      expect(tracker.testCountCharacters('')).toBe(0);
    });

    it('should count all characters including newlines', () => {
      expect(tracker.testCountCharacters('line1\nline2')).toBe(11);
    });
  });

  describe('Document Tracking Rules', () => {
    it('should skip untitled documents', () => {
      const mockDoc = {
        isUntitled: true,
        uri: { scheme: 'untitled' },
        getText: () => 'test'
      } as vscode.TextDocument;

      expect(tracker.testShouldTrackDocument(mockDoc)).toBe(false);
    });

    it('should skip non-file schemes', () => {
      const mockDoc = {
        isUntitled: false,
        uri: { scheme: 'output' },
        getText: () => 'test'
      } as vscode.TextDocument;

      expect(tracker.testShouldTrackDocument(mockDoc)).toBe(false);
    });

    it('should skip very large files', () => {
      const largeText = 'x'.repeat(2 * 1024 * 1024); // 2MB
      const mockDoc = {
        isUntitled: false,
        uri: { scheme: 'file' },
        getText: () => largeText
      } as vscode.TextDocument;

      expect(tracker.testShouldTrackDocument(mockDoc)).toBe(false);
    });

    it('should track normal file documents', () => {
      const mockDoc = {
        isUntitled: false,
        uri: { scheme: 'file' },
        getText: () => 'normal content'
      } as vscode.TextDocument;

      expect(tracker.testShouldTrackDocument(mockDoc)).toBe(true);
    });
  });

  describe('ID Generation', () => {
    it('should generate unique IDs', () => {
      const id1 = tracker.testGenerateId();
      const id2 = tracker.testGenerateId();

      expect(id1).not.toBe(id2);
      expect(id1).toContain('copilot');
      expect(id2).toContain('copilot');
    });

    it('should include tool name in ID', () => {
      const id = tracker.testGenerateId();
      expect(id).toContain('copilot');
    });
  });

  describe('Logging', () => {
    it('should not output debug logs in production', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      tracker.testLog('test message', 'arg1', 'arg2');

      // Debug logging is disabled in production
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should log errors with tool prefix', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('test error');

      tracker.testLogError('error message', error);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[CodePause:copilot]',
        'error message',
        error
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Disposal', () => {
    it('should dispose cleanly', () => {
      tracker.dispose();

      expect(tracker.isActive()).toBe(false);
    });

    it('should dispose all disposables', () => {
      const mockDisposable = { dispose: jest.fn() };
      (tracker as any).disposables.push(mockDisposable);

      tracker.dispose();

      expect(mockDisposable.dispose).toHaveBeenCalled();
    });

    it('should clear disposables array', () => {
      const mockDisposable = { dispose: jest.fn() };
      (tracker as any).disposables.push(mockDisposable);

      tracker.dispose();

      expect((tracker as any).disposables).toHaveLength(0);
    });

    it('should set active flag to false', async () => {
      await tracker.initialize();
      expect(tracker.isActive()).toBe(true);

      tracker.dispose();
      expect(tracker.isActive()).toBe(false);
    });
  });
});
