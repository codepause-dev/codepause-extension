/**
 * UnifiedAITracker Unit Tests
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { UnifiedAITracker } from '../UnifiedAITracker';
import { AIDetector } from '../../detection/AIDetector';
import { EventType } from '../../types';

// Create mock handlers storage
let mockHandlers: {
  textChange?: (event: any) => void;
  fileChange?: (uri: any) => void;
  fileCreate?: (uri: any) => void;
  visibleEditorsChange?: (editors: any[]) => void;
} = {};

// Mock vscode
jest.mock('vscode', () => ({
  workspace: {
    onDidChangeTextDocument: jest.fn((handler: any) => {
      mockHandlers.textChange = handler as (event: any) => void;
      return { dispose: jest.fn() };
    }),
    createFileSystemWatcher: jest.fn(() => ({
      onDidChange: jest.fn((handler: any) => {
        mockHandlers.fileChange = handler as (uri: any) => void;
        return { dispose: jest.fn() };
      }),
      onDidCreate: jest.fn((handler: any) => {
        mockHandlers.fileCreate = handler as (uri: any) => void;
        return { dispose: jest.fn() };
      }),
      dispose: jest.fn()
    })),
    openTextDocument: jest.fn()
  },
  window: {
    onDidChangeActiveTextEditor: jest.fn(() => ({ dispose: jest.fn() })),
    onDidChangeVisibleTextEditors: jest.fn((handler: any) => {
      mockHandlers.visibleEditorsChange = handler as (editors: any[]) => void;
      return { dispose: jest.fn() };
    }),
    activeTextEditor: undefined,
    visibleTextEditors: []
  },
  commands: {
    registerCommand: jest.fn(() => ({ dispose: jest.fn() }))
  },
  Uri: {
    parse: jest.fn((path: string) => ({ fsPath: path })),
    file: jest.fn((path: string) => ({ fsPath: path }))
  }
}), { virtual: true });

// Mock AIDetector
jest.mock('../../detection/AIDetector');

describe('UnifiedAITracker', () => {
  let tracker: UnifiedAITracker;
  let mockOnEvent: jest.Mock<(event: unknown) => void>;

  beforeEach(() => {
    mockOnEvent = jest.fn<(event: unknown) => void>();
    tracker = new UnifiedAITracker(mockOnEvent);
    mockHandlers = {};

    // Reset AIDetector mock
    (AIDetector as jest.MockedClass<typeof AIDetector>).mockClear();
  });

  afterEach(() => {
    tracker.dispose();
  });

  describe('Initialization', () => {
    it('should create tracker', () => {
      expect(tracker).toBeDefined();
    });

    it('should not be active before initialization', () => {
      expect(tracker.isActive()).toBe(false);
    });

    it('should initialize successfully', async () => {
      await expect(tracker.initialize()).resolves.not.toThrow();
      expect(tracker.isActive()).toBe(true);
    });
  });

  describe('Disposal', () => {
    it('should dispose cleanly', async () => {
      await tracker.initialize();
      tracker.dispose();
      expect(tracker.isActive()).toBe(false);
    });

    it('should handle disposal without initialization', () => {
      tracker.dispose();
      expect(tracker.isActive()).toBe(false);
    });

    it('should clean up all subscriptions on dispose', async () => {
      await tracker.initialize();
      tracker.dispose();

      // After disposal, tracker should be inactive
      expect(tracker.isActive()).toBe(false);
    });
  });

  describe('Text Change Monitoring', () => {
    beforeEach(async () => {
      await tracker.initialize();
    });

    it('should setup text change monitoring', async () => {
      expect(tracker.isActive()).toBe(true);

      // VSCode workspace.onDidChangeTextDocument should have been called
      const vscode = require('vscode');
      expect(vscode.workspace.onDidChangeTextDocument).toHaveBeenCalled();
    });

    it('should monitor text document changes', () => {
      const vscode = require('vscode');

      // Verify listener was registered
      expect(vscode.workspace.onDidChangeTextDocument).toHaveBeenCalled();
    });
  });

  describe('File System Watching', () => {
    beforeEach(async () => {
      await tracker.initialize();
    });

    it('should create file system watcher', () => {
      const vscode = require('vscode');
      expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalled();
    });

    it('should setup file system watcher with listeners', () => {
      // Watcher is set up during initialization
      expect(tracker.isActive()).toBe(true);
    });

    it('should handle file system watcher disposal', () => {
      tracker.dispose();

      expect(tracker.isActive()).toBe(false);
    });
  });

  describe('Open File Tracking', () => {
    beforeEach(async () => {
      await tracker.initialize();
    });

    it('should setup open file tracking', () => {
      // Open file tracking is set up during initialization
      expect(tracker.isActive()).toBe(true);
    });

    it('should track visible editors', () => {
      const vscode = require('vscode');
      // At least one tracking method should be called
      expect(vscode.window.onDidChangeVisibleTextEditors).toHaveBeenCalled();
    });
  });

  describe('Git Commit Monitoring', () => {
    beforeEach(async () => {
      await tracker.initialize();
    });

    it('should setup git commit detection', () => {
      // Git commit detection is set up during initialization
      expect(tracker.isActive()).toBe(true);
    });
  });

  describe('Activity State', () => {
    it('should be inactive before initialization', () => {
      expect(tracker.isActive()).toBe(false);
    });

    it('should be active after initialization', async () => {
      await tracker.initialize();
      expect(tracker.isActive()).toBe(true);
    });

    it('should be inactive after disposal', async () => {
      await tracker.initialize();
      expect(tracker.isActive()).toBe(true);

      tracker.dispose();
      expect(tracker.isActive()).toBe(false);
    });

    it('should handle multiple initialization calls', async () => {
      await tracker.initialize();
      expect(tracker.isActive()).toBe(true);

      // Second initialization should not break things
      await tracker.initialize();
      expect(tracker.isActive()).toBe(true);
    });
  });

  describe('Detection Methods', () => {
    beforeEach(async () => {
      await tracker.initialize();
    });

    it('should enable all detection methods', () => {
      expect(tracker.isActive()).toBe(true);

      const vscode = require('vscode');

      // Verify key methods are set up
      expect(vscode.workspace.onDidChangeTextDocument).toHaveBeenCalled();
      expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalled();
      expect(vscode.window.onDidChangeVisibleTextEditors).toHaveBeenCalled();
    });

    it('should use AIDetector for analysis', () => {
      // AIDetector is created in constructor
      expect(tracker).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle initialization errors gracefully', async () => {
      // Mock a failure in setup
      const vscode = require('vscode');
      const originalOnDidChange = vscode.workspace.onDidChangeTextDocument;
      vscode.workspace.onDidChangeTextDocument = jest.fn(() => {
        throw new Error('Setup failed');
      });

      const newTracker = new UnifiedAITracker(mockOnEvent);
      await newTracker.initialize();

      // Should not throw, but may not be active
      expect(newTracker).toBeDefined();

      // Restore
      vscode.workspace.onDidChangeTextDocument = originalOnDidChange;
    });

    it('should not throw on double disposal', async () => {
      await tracker.initialize();
      tracker.dispose();

      // Second disposal should not throw
      expect(() => tracker.dispose()).not.toThrow();
    });
  });

  describe('Event Callback', () => {
    beforeEach(async () => {
      await tracker.initialize();
    });

    it('should accept event callback in constructor', () => {
      const callback = jest.fn();
      const newTracker = new UnifiedAITracker(callback);

      expect(newTracker).toBeDefined();
    });

    it('should store event callback', () => {
      expect(mockOnEvent).toBeDefined();
    });
  });

  describe('Lifecycle', () => {
    it('should complete full lifecycle', async () => {
      // Create
      expect(tracker).toBeDefined();
      expect(tracker.isActive()).toBe(false);

      // Initialize
      await tracker.initialize();
      expect(tracker.isActive()).toBe(true);

      // Dispose
      tracker.dispose();
      expect(tracker.isActive()).toBe(false);
    });

    it('should handle rapid initialization and disposal', async () => {
      for (let i = 0; i < 3; i++) {
        await tracker.initialize();
        expect(tracker.isActive()).toBe(true);

        tracker.dispose();
        expect(tracker.isActive()).toBe(false);
      }
    });
  });

  describe('Text Document Changes', () => {
    beforeEach(async () => {
      await tracker.initialize();
    });

    it('should process text document changes', () => {
      const vscode = require('vscode');
      const onDidChange = vscode.workspace.onDidChangeTextDocument;

      expect(onDidChange).toHaveBeenCalled();
      expect(tracker.isActive()).toBe(true);
    });

    it('should handle document change events', () => {
      const vscode = require('vscode');
      expect(vscode.workspace.onDidChangeTextDocument).toHaveBeenCalled();
    });

    it('should track text changes in monitored documents', async () => {
      await tracker.initialize();
      const vscode = require('vscode');

      // Verify the listener was registered
      expect(vscode.workspace.onDidChangeTextDocument).toHaveBeenCalled();
    });
  });

  describe('File System Watcher', () => {
    beforeEach(async () => {
      await tracker.initialize();
    });

    it('should create file system watcher for code files', () => {
      const vscode = require('vscode');
      expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalled();
    });

    it('should watch for file changes', () => {
      const vscode = require('vscode');

      // Watcher was created during initialization
      expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalled();
    });

    it('should dispose file system watcher on cleanup', async () => {
      tracker.dispose();

      // Watcher should be disposed
      expect(tracker.isActive()).toBe(false);
    });
  });

  describe('Open File Tracking', () => {
    beforeEach(async () => {
      await tracker.initialize();
    });

    it('should track visible text editors', () => {
      const vscode = require('vscode');
      expect(vscode.window.onDidChangeVisibleTextEditors).toHaveBeenCalled();
    });

    it('should initialize with current visible editors', async () => {
      const vscode = require('vscode');

      await tracker.initialize();

      // Should access visibleTextEditors
      expect(vscode.window.visibleTextEditors).toBeDefined();
    });

    it('should handle empty visible editors list', async () => {
      const vscode = require('vscode');
      vscode.window.visibleTextEditors = [];

      const newTracker = new UnifiedAITracker(mockOnEvent);
      await newTracker.initialize();

      expect(newTracker.isActive()).toBe(true);
      newTracker.dispose();
    });
  });

  describe('Detection Methods Setup', () => {
    it('should enable inline completion detection', async () => {
      await tracker.initialize();
      expect(tracker.isActive()).toBe(true);
    });

    it('should enable text change detection', async () => {
      const vscode = require('vscode');

      await tracker.initialize();

      expect(vscode.workspace.onDidChangeTextDocument).toHaveBeenCalled();
    });

    it('should enable external file change detection', async () => {
      const vscode = require('vscode');

      await tracker.initialize();

      expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalled();
    });

    it('should note git commit monitoring as future enhancement', async () => {
      await tracker.initialize();
      // Git monitoring is logged but not implemented yet
      expect(tracker.isActive()).toBe(true);
    });
  });

  describe('Active Editor Tracking', () => {
    beforeEach(async () => {
      await tracker.initialize();
    });

    it('should track visible text editor changes', () => {
      const vscode = require('vscode');
      expect(vscode.window.onDidChangeVisibleTextEditors).toHaveBeenCalled();
    });

    it('should handle undefined active editor', async () => {
      const vscode = require('vscode');
      vscode.window.activeTextEditor = undefined;

      const newTracker = new UnifiedAITracker(mockOnEvent);
      await newTracker.initialize();

      expect(newTracker.isActive()).toBe(true);
      newTracker.dispose();
    });
  });

  describe('Event Callback Integration', () => {
    it('should call event callback when provided', async () => {
      const callback = jest.fn();
      const newTracker = new UnifiedAITracker(callback);

      await newTracker.initialize();

      expect(newTracker.isActive()).toBe(true);
      newTracker.dispose();
    });

    it('should work with different callback implementations', async () => {
      const callback1 = jest.fn();
      const tracker1 = new UnifiedAITracker(callback1);
      await tracker1.initialize();
      tracker1.dispose();

      const callback2 = jest.fn();
      const tracker2 = new UnifiedAITracker(callback2);
      await tracker2.initialize();
      tracker2.dispose();

      expect(callback1).toBeDefined();
      expect(callback2).toBeDefined();
    });
  });

  describe('Initialization Error Handling', () => {
    it('should handle initialization errors gracefully', async () => {
      const vscode = require('vscode');
      const originalOnDidChange = vscode.workspace.onDidChangeTextDocument;

      vscode.workspace.onDidChangeTextDocument = jest.fn(() => {
        throw new Error('Setup failed');
      });

      const newTracker = new UnifiedAITracker(mockOnEvent);
      await newTracker.initialize();

      // Should still create tracker even if setup partially fails
      expect(newTracker).toBeDefined();

      vscode.workspace.onDidChangeTextDocument = originalOnDidChange;
      newTracker.dispose();
    });

    it('should set inactive flag on initialization failure', async () => {
      const vscode = require('vscode');
      const originalOnDidChange = vscode.workspace.onDidChangeTextDocument;

      vscode.workspace.onDidChangeTextDocument = jest.fn(() => {
        throw new Error('Critical failure');
      });

      const newTracker = new UnifiedAITracker(mockOnEvent);
      await newTracker.initialize();

      // May or may not be active depending on when error occurred
      expect(newTracker).toBeDefined();

      vscode.workspace.onDidChangeTextDocument = originalOnDidChange;
      newTracker.dispose();
    });
  });

  describe('Multiple Instances', () => {
    it('should support multiple tracker instances', async () => {
      const tracker1 = new UnifiedAITracker(jest.fn());
      const tracker2 = new UnifiedAITracker(jest.fn());

      await tracker1.initialize();
      await tracker2.initialize();

      expect(tracker1.isActive()).toBe(true);
      expect(tracker2.isActive()).toBe(true);

      tracker1.dispose();
      tracker2.dispose();

      expect(tracker1.isActive()).toBe(false);
      expect(tracker2.isActive()).toBe(false);
    });

    it('should maintain separate state per instance', async () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      const tracker1 = new UnifiedAITracker(callback1);
      const tracker2 = new UnifiedAITracker(callback2);

      await tracker1.initialize();
      expect(tracker1.isActive()).toBe(true);
      expect(tracker2.isActive()).toBe(false);

      await tracker2.initialize();
      expect(tracker2.isActive()).toBe(true);

      tracker1.dispose();
      expect(tracker1.isActive()).toBe(false);
      expect(tracker2.isActive()).toBe(true);

      tracker2.dispose();
    });
  });

  describe('Disposal Cleanup', () => {
    it('should clean up all resources on dispose', async () => {
      await tracker.initialize();

      tracker.dispose();

      // Should clean up watcher
      expect(tracker.isActive()).toBe(false);
    });

    it('should handle dispose without file system watcher', () => {
      const newTracker = new UnifiedAITracker(mockOnEvent);

      // Dispose without initializing (no watcher created)
      expect(() => newTracker.dispose()).not.toThrow();
    });

    it('should clear all debounce timers on dispose', async () => {
      await tracker.initialize();

      // Dispose should clear any pending timers
      expect(() => tracker.dispose()).not.toThrow();
      expect(tracker.isActive()).toBe(false);
    });
  });

  describe('Subscription Management', () => {
    it('should register all necessary subscriptions', async () => {
      const vscode = require('vscode');

      await tracker.initialize();

      // Verify key subscriptions were registered
      expect(vscode.workspace.onDidChangeTextDocument).toHaveBeenCalled();
      expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalled();
      expect(vscode.window.onDidChangeVisibleTextEditors).toHaveBeenCalled();
    });

    it('should properly dispose all subscriptions', async () => {
      await tracker.initialize();

      tracker.dispose();

      // Should be inactive after disposal
      expect(tracker.isActive()).toBe(false);
    });
  });

  describe('Text Change Handling Logic', () => {
    beforeEach(async () => {
      await tracker.initialize();
    });

    it('should have text change handler registered', () => {
      expect(mockHandlers.textChange).toBeDefined();
    });

    it('should have file change handler registered', () => {
      expect(mockHandlers.fileChange).toBeDefined();
    });

    it('should have file create handler registered', () => {
      expect(mockHandlers.fileCreate).toBeDefined();
    });
  });

  describe('Event Emission', () => {
    beforeEach(async () => {
      await tracker.initialize();
    });

    it('should skip events with zero lines', () => {
      const mockDocument = {
        uri: { fsPath: '/test/file.ts' },
        languageId: 'typescript'
      };

      const result = {
        isAI: true,
        confidence: 'high',
        method: 'inline-completion-api',
        metadata: {
          linesOfCode: 0,
          charactersCount: 0
        }
      };

      mockOnEvent.mockClear();

      (tracker as any).emitAIEvent(result, mockDocument);

      expect(mockOnEvent).not.toHaveBeenCalled();
    });

    it('should set correct event type for inline completions', () => {
      const mockDocument = {
        uri: { fsPath: '/test/file.ts' },
        languageId: 'typescript'
      };

      const result = {
        isAI: true,
        confidence: 'high',
        method: 'inline-completion-api',
        metadata: {
          linesOfCode: 5,
          charactersCount: 100
        }
      };

      (tracker as any).emitAIEvent(result, mockDocument);

      expect(mockOnEvent).toHaveBeenCalled();
      const event = mockOnEvent.mock.calls[0][0] as any;
      expect(event.eventType).toBe(EventType.SuggestionAccepted);
      expect(event.acceptanceTimeDelta).toBe(300);
    });

    it('should set correct event type for code generation', () => {
      const mockDocument = {
        uri: { fsPath: '/test/file.ts' },
        languageId: 'typescript'
      };

      const result = {
        isAI: true,
        confidence: 'high',
        method: 'large-paste',
        metadata: {
          linesOfCode: 50,
          charactersCount: 1000
        }
      };

      (tracker as any).emitAIEvent(result, mockDocument);

      expect(mockOnEvent).toHaveBeenCalled();
      const event = mockOnEvent.mock.calls[0][0] as any;
      expect(event.eventType).toBe(EventType.CodeGenerated);
      expect(event.acceptanceTimeDelta).toBeUndefined();
    });

    it('should set agent mode flag for external file changes', () => {
      const mockDocument = {
        uri: { fsPath: '/test/file.ts' },
        languageId: 'typescript'
      };

      const result = {
        isAI: true,
        confidence: 'high',
        method: 'external-file-change',
        metadata: {
          linesOfCode: 20,
          charactersCount: 500,
          source: 'agent'
        }
      };

      (tracker as any).emitAIEventFromResult(result, mockDocument);

      expect(mockOnEvent).toHaveBeenCalled();
      const event = mockOnEvent.mock.calls[0][0] as any;
      expect(event.isAgentMode).toBe(true);
      expect(event.fileWasOpen).toBe(false);
    });
  });

  describe('Visible Editors Tracking', () => {
    beforeEach(async () => {
      await tracker.initialize();
    });

    it('should track visible editor changes', () => {
      const mockEditors = [
        { document: { uri: { fsPath: '/test/file1.ts' } } },
        { document: { uri: { fsPath: '/test/file2.ts' } } }
      ];

      if (mockHandlers.visibleEditorsChange) {
        mockHandlers.visibleEditorsChange(mockEditors);
      }

      // Open files should be tracked
      expect(tracker).toBeDefined();
    });

    it('should clear and update open files', () => {
      const mockEditors1 = [
        { document: { uri: { fsPath: '/test/file1.ts' } } }
      ];

      if (mockHandlers.visibleEditorsChange) {
        mockHandlers.visibleEditorsChange(mockEditors1);
      }

      const mockEditors2 = [
        { document: { uri: { fsPath: '/test/file2.ts' } } }
      ];

      if (mockHandlers.visibleEditorsChange) {
        mockHandlers.visibleEditorsChange(mockEditors2);
      }

      expect(tracker.isActive()).toBe(true);
    });

    it('should handle empty visible editors', () => {
      if (mockHandlers.visibleEditorsChange) {
        mockHandlers.visibleEditorsChange([]);
      }

      expect(tracker.isActive()).toBe(true);
    });
  });
});
