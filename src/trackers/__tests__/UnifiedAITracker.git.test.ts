/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck - Complex mocking of child_process and vscode requires type suppression
/**
 * UnifiedAITracker Git Operation Detection Tests
 * Integration tests for git pull, merge, checkout detection
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { UnifiedAITracker } from '../UnifiedAITracker';

// Mock vscode
jest.mock('vscode', () => ({
  workspace: {
    onDidChangeTextDocument: jest.fn(() => ({ dispose: jest.fn() })),
    createFileSystemWatcher: jest.fn(() => ({
      onDidChange: jest.fn(() => ({ dispose: jest.fn() })),
      onDidCreate: jest.fn(() => ({ dispose: jest.fn() })),
      dispose: jest.fn()
    })),
    openTextDocument: jest.fn(),
    textDocuments: [],
    fs: {
      stat: jest.fn(() => Promise.resolve({
        mtime: Date.now() - 60000,
        ctime: Date.now() - 60000,
        size: 1000
      }))
    },
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }]
  },
  window: {
    onDidChangeActiveTextEditor: jest.fn(() => ({ dispose: jest.fn() })),
    onDidChangeVisibleTextEditors: jest.fn(() => ({ dispose: jest.fn() })),
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
jest.mock('../../detection/AIDetector', () => ({
  AIDetector: jest.fn().mockImplementation(() => ({
    detect: jest.fn().mockReturnValue({ isAI: false, confidence: 'low' }),
    detectFromExternalFileChange: jest.fn().mockReturnValue({
      isAI: true,
      confidence: 'high',
      method: 'external-file-change',
      metadata: {
        source: 'external-file-change',
        charactersCount: 100,
        linesOfCode: 10
      }
    }),
    reset: jest.fn()
  }))
}));

describe('UnifiedAITracker - Git Operation Detection', () => {
  let tracker: UnifiedAITracker;
  let mockOnEvent: jest.Mock;
  let mockHandlers: any = {};
  let mockExecSync: jest.Mock;
  let originalExecSync: any;
  let originalOpenTextDocument: any;

  beforeEach(async () => {
    mockOnEvent = jest.fn();
    tracker = new UnifiedAITracker(mockOnEvent);

    // Get mock handlers
    const vscode = require('vscode');
    vscode.workspace.onDidChangeTextDocument = jest.fn((handler: any) => {
      mockHandlers.textChange = handler;
      return { dispose: jest.fn() };
    });
    vscode.workspace.createFileSystemWatcher = jest.fn(() => ({
      onDidChange: jest.fn((handler: any) => {
        mockHandlers.fileChange = handler;
        return { dispose: jest.fn() };
      }),
      onDidCreate: jest.fn(() => ({ dispose: jest.fn() })),
      dispose: jest.fn()
    }));

    await tracker.initialize();

    // Mock child_process.execSync
    mockExecSync = jest.fn();
    originalExecSync = require('child_process').execSync;
    require('child_process').execSync = mockExecSync;

    // Save original openTextDocument
    originalOpenTextDocument = vscode.workspace.openTextDocument;
  });

  afterEach(() => {
    tracker.dispose();
    require('child_process').execSync = originalExecSync;
    const vscode = require('vscode');
    vscode.workspace.openTextDocument = originalOpenTextDocument;
    mockHandlers = {};
  });

  describe('Git Pull - Should Skip AI Detection', () => {
    it('should skip AI detection for git pull (tracked file, no diff)', async () => {
      const vscode = require('vscode');
      const testFilePath = '/workspace/test.ts';
      const testUri = { fsPath: testFilePath };

      // Mock git commands to simulate git pull scenario
      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('git rev-parse')) {
          return Buffer.from('.git'); // In a git repo
        }
        if (command.includes('git diff HEAD')) {
          return Buffer.from(''); // No diff (HEAD moved after pull)
        }
        if (command.includes('git ls-files')) {
          return Buffer.from(''); // File is tracked (no error)
        }
        return Buffer.from('');
      });

      // Mock openTextDocument to return a document with content
      vscode.workspace.openTextDocument = jest.fn().mockResolvedValue({
        getText: () => 'line1\nline2\nline3\nline4\nline5\n', // 5 lines
        uri: testUri
      });

      // Mock workspace folder
      vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];

      // Trigger file change handler (simulating FileSystemWatcher event after git pull)
      const handler = mockHandlers.fileChange;
      if (handler) {
        await handler(testUri);
      }

      // Verify: NO AI event should be emitted (git pull should be ignored)
      expect(mockOnEvent).not.toHaveBeenCalled();

      // Verify: git commands were called
      expect(mockExecSync).toHaveBeenCalledWith('git rev-parse --git-dir', expect.any(Object));
      expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('git diff HEAD'), expect.any(Object));
    });

    it('should update baseline after git pull (for future tracking)', async () => {
      const vscode = require('vscode');
      const testFilePath = '/workspace/test.ts';
      const testUri = { fsPath: testFilePath };

      // Mock git commands to simulate git pull
      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('git rev-parse')) {
          return Buffer.from('.git');
        }
        if (command.includes('git diff HEAD')) {
          return Buffer.from(''); // No diff after pull
        }
        if (command.includes('git ls-files')) {
          return Buffer.from(''); // File tracked
        }
        return Buffer.from('');
      });

      vscode.workspace.openTextDocument = jest.fn().mockResolvedValue({
        getText: () => 'line1\nline2\nline3\nline4\nline5\n',
        uri: testUri
      });

      vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];

      const handler = mockHandlers.fileChange;
      if (handler) {
        await handler(testUri);
      }

      // Baseline should be updated even though no event was emitted
      const fileBaselines = (tracker as any).fileBaselines;
      expect(fileBaselines.has(testFilePath)).toBe(true);
      expect(fileBaselines.get(testFilePath)).toBe(5); // 5 lines
    });
  });

  describe('Git Checkout Between Branches - Should Skip AI Detection', () => {
    it('should skip AI detection for git checkout (tracked file, no diff)', async () => {
      const vscode = require('vscode');
      const testFilePath = '/workspace/feature.ts';
      const testUri = { fsPath: testFilePath };

      // Mock git commands to simulate git checkout scenario
      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('git rev-parse')) {
          return Buffer.from('.git'); // In a git repo
        }
        if (command.includes('git diff HEAD')) {
          return Buffer.from(''); // No diff (HEAD moved after checkout)
        }
        if (command.includes('git ls-files')) {
          return Buffer.from(''); // File is tracked
        }
        return Buffer.from('');
      });

      vscode.workspace.openTextDocument = jest.fn().mockResolvedValue({
        getText: () => 'new branch content\nline2\nline3\n',
        uri: testUri
      });

      vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];

      const handler = mockHandlers.fileChange;
      if (handler) {
        await handler(testUri);
      }

      // Verify: NO AI event should be emitted (git checkout should be ignored)
      expect(mockOnEvent).not.toHaveBeenCalled();
    });
  });

  describe('Git Merge - Should Skip AI Detection', () => {
    it('should skip AI detection for git merge (tracked file, no diff)', async () => {
      const vscode = require('vscode');
      const testFilePath = '/workspace/merged.ts';
      const testUri = { fsPath: testFilePath };

      // Mock git commands to simulate git merge scenario
      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('git rev-parse')) {
          return Buffer.from('.git');
        }
        if (command.includes('git diff HEAD')) {
          return Buffer.from(''); // No diff after merge commit
        }
        if (command.includes('git ls-files')) {
          return Buffer.from(''); // File is tracked
        }
        return Buffer.from('');
      });

      vscode.workspace.openTextDocument = jest.fn().mockResolvedValue({
        getText: () => 'merged content\n',
        uri: testUri
      });

      vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];

      const handler = mockHandlers.fileChange;
      if (handler) {
        await handler(testUri);
      }

      // Verify: NO AI event should be emitted (git merge should be ignored)
      expect(mockOnEvent).not.toHaveBeenCalled();
    });
  });

  describe('AI Agent Modifications - Should Still Detect AI', () => {
    it('should detect AI when file has uncommitted changes (has diff)', async () => {
      const vscode = require('vscode');
      const testFilePath = '/workspace/ai-generated.ts';
      const testUri = { fsPath: testFilePath };

      // Ensure file is NOT in openFiles set (so file watcher will process it)
      const openFiles = (tracker as any).openFiles;
      openFiles.delete(testFilePath);

      // Clear recent text changes to ensure no deduplication
      const recentTextChanges = (tracker as any).recentTextChanges;
      recentTextChanges.clear();

      // Mock git commands to simulate AI agent modification
      mockExecSync.mockImplementation((command: string, options: any = {}) => {
        if (command.includes('git rev-parse')) {
          return Buffer.from('.git');
        }
        if (command.includes('git diff HEAD')) {
          // When encoding is specified, execSync returns a string
          const result = '15\t2\tai-generated.ts';
          if (options?.encoding) {
            return result;
          }
          return Buffer.from(result);
        }
        if (command.includes('git ls-files')) {
          // This should throw to simulate file not being tracked
          throw new Error('error-unmatch');
        }
        return Buffer.from('');
      });

      vscode.workspace.openTextDocument = jest.fn().mockResolvedValue({
        getText: () => 'AI generated line1\nAI generated line2\n',
        uri: testUri,
        languageId: 'typescript'
      });

      vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];

      // Clear previous events
      mockOnEvent.mockClear();

      const handler = mockHandlers.fileChange;
      if (handler) {
        await handler(testUri);
      }

      // Wait for debounce cleanup to complete (FILE_CHANGE_DEBOUNCE_MS = 5000ms)
      await new Promise(resolve => setTimeout(resolve, 5100));

      // Verify: AI event SHOULD be emitted (has diff = actual modification)
      expect(mockOnEvent).toHaveBeenCalled();
      const emittedEvent = mockOnEvent.mock.calls[0][0];
      expect(emittedEvent.linesOfCode).toBe(15);
      expect(emittedEvent.linesRemoved).toBe(2);
    }, 15000);
  });

  describe('New Untracked Files - Should Still Detect AI', () => {
    it('should detect AI for new untracked files', async () => {
      const vscode = require('vscode');
      const testFilePath = '/workspace/new-file.ts';
      const testUri = { fsPath: testFilePath };

      // Ensure file is NOT in openFiles set
      const openFiles = (tracker as any).openFiles;
      openFiles.delete(testFilePath);

      // Clear recent text changes to ensure no deduplication
      const recentTextChanges = (tracker as any).recentTextChanges;
      recentTextChanges.clear();

      // Mock git commands for new untracked file
      mockExecSync.mockImplementation((command: string, options: any = {}) => {
        if (command.includes('git rev-parse')) {
          return Buffer.from('.git');
        }
        if (command.includes('git diff HEAD')) {
          const result = ''; // No diff
          if (options?.encoding) {
            return result;
          }
          return Buffer.from(result);
        }
        if (command.includes('git ls-files')) {
          throw new Error('error-unmatch'); // File not tracked
        }
        return Buffer.from('');
      });

      vscode.workspace.openTextDocument = jest.fn().mockResolvedValue({
        getText: () => 'new file content\nline2\nline3\n',
        uri: testUri,
        languageId: 'typescript'
      });

      vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];

      mockOnEvent.mockClear();

      const handler = mockHandlers.fileChange;
      if (handler) {
        await handler(testUri);
      }

      // Wait for debounce cleanup to complete (FILE_CHANGE_DEBOUNCE_MS = 5000ms)
      await new Promise(resolve => setTimeout(resolve, 5100));

      // Verify: AI event SHOULD be emitted (new file)
      expect(mockOnEvent).toHaveBeenCalled();
      const emittedEvent = mockOnEvent.mock.calls[0][0];
      expect(emittedEvent.linesOfCode).toBe(3); // 3 lines
    }, 15000);
  });

  describe('Non-Git Repositories - Baseline Tracking Should Work', () => {
    it('should use baseline tracking when not in a git repo', async () => {
      const vscode = require('vscode');
      const testFilePath = '/workspace/file.ts';
      const testUri = { fsPath: testFilePath };

      // Ensure file is NOT in openFiles set
      const openFiles = (tracker as any).openFiles;
      openFiles.delete(testFilePath);

      // Clear recent text changes to ensure no deduplication
      const recentTextChanges = (tracker as any).recentTextChanges;
      recentTextChanges.clear();

      // Mock git commands to simulate non-git repo
      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('git rev-parse')) {
          throw new Error('not a git repo'); // Not in git repo
        }
        return Buffer.from('');
      });

      vscode.workspace.openTextDocument = jest.fn().mockResolvedValue({
        getText: () => 'line1\nline2\nline3\n',
        uri: testUri,
        languageId: 'typescript'
      });

      vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];

      // First call: establish baseline
      const handler = mockHandlers.fileChange;
      if (handler) {
        await handler(testUri);
      }

      // No event for baseline establishment
      expect(mockOnEvent).not.toHaveBeenCalled();

      // Wait for debounce cleanup to complete (FILE_CHANGE_DEBOUNCE_MS = 5000ms)
      await new Promise(resolve => setTimeout(resolve, 5100));

      // Second call with different content: should detect changes
      vscode.workspace.openTextDocument = jest.fn().mockResolvedValue({
        getText: () => 'line1\nline2\nline3\nline4\nline5\n', // 5 lines now
        uri: testUri,
        languageId: 'typescript'
      });

      mockOnEvent.mockClear();

      if (handler) {
        await handler(testUri);
      }

      // Wait for debounce cleanup to complete (FILE_CHANGE_DEBOUNCE_MS = 5000ms)
      await new Promise(resolve => setTimeout(resolve, 5100));

      // Should detect AI (baseline tracking in non-git repo)
      expect(mockOnEvent).toHaveBeenCalled();
      const emittedEvent = mockOnEvent.mock.calls[0][0];
      expect(emittedEvent.linesOfCode).toBe(2); // 5 - 3 = 2 lines added
    }, 15000);
  });
});
