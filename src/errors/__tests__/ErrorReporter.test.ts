/**
 * ErrorReporter Tests
 */

import { ErrorReporter } from '../ErrorReporter';
import * as vscode from 'vscode';

// Mock vscode
jest.mock('vscode', () => ({
  window: {
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    createOutputChannel: jest.fn(() => ({
      clear: jest.fn(),
      appendLine: jest.fn(),
      show: jest.fn(),
      dispose: jest.fn()
    }))
  },
  env: {
    openExternal: jest.fn().mockResolvedValue(true)
  },
  Uri: {
    parse: jest.fn((url: string) => ({ toString: () => url }))
  }
}), { virtual: true });

describe('ErrorReporter', () => {
  let reporter: ErrorReporter;
  let mockContext: any;
  let mockTelemetryService: any;
  let mockOutputChannel: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock context
    mockContext = {
      extension: {
        packageJSON: {
          version: '0.2.0'
        }
      }
    };

    // Mock telemetry service
    mockTelemetryService = {
      trackError: jest.fn()
    };

    // Mock output channel
    mockOutputChannel = {
      clear: jest.fn(),
      appendLine: jest.fn(),
      show: jest.fn(),
      dispose: jest.fn()
    };

    (vscode.window.createOutputChannel as jest.Mock).mockReturnValue(mockOutputChannel);

    reporter = new ErrorReporter(mockContext, mockTelemetryService);
  });

  describe('initialization', () => {
    it('should create output channel on initialization', () => {
      expect(vscode.window.createOutputChannel).toHaveBeenCalledWith('CodePause Errors');
    });

    it('should work without telemetry service', () => {
      const reporterWithoutTelemetry = new ErrorReporter(mockContext);
      expect(reporterWithoutTelemetry).toBeDefined();
    });
  });

  describe('error reporting', () => {
    it('should report error and track in telemetry', () => {
      const error = new Error('Test error');
      const errorType = 'database';

      reporter.reportError(error, errorType);

      expect(mockTelemetryService.trackError).toHaveBeenCalledWith(errorType);
      expect(reporter.getRecentErrors()).toHaveLength(1);
    });

    it('should store error context', () => {
      const error = new Error('Test error');
      const errorType = 'initialization';
      const context = { userId: 123, setting: 'advanced' };

      reporter.reportError(error, errorType, context);

      const recentErrors = reporter.getRecentErrors();
      expect(recentErrors[0]).toMatchObject({
        errorType: 'initialization',
        message: 'Test error',
        context: { setting: 'advanced' } // userId should be sanitized
      });
    });

    it('should include stack trace when available', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at Object.<anonymous> (test.ts:1:1)';

      reporter.reportError(error, 'test');

      const recentErrors = reporter.getRecentErrors();
      expect(recentErrors[0].stack).toContain('Error: Test error');
    });

    it('should include timestamp', () => {
      const error = new Error('Test error');
      const beforeTime = Date.now();

      reporter.reportError(error, 'test');

      const recentErrors = reporter.getRecentErrors();
      const afterTime = Date.now();

      expect(recentErrors[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(recentErrors[0].timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should show error notification to user', () => {
      const error = new Error('Test error');

      reporter.reportError(error, 'test');

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('CodePause Error: test'),
        'Report Bug',
        'Show Details',
        'Dismiss'
      );
    });

    it('should work without telemetry service', () => {
      const reporterWithoutTelemetry = new ErrorReporter(mockContext);
      const error = new Error('Test error');

      expect(() => {
        reporterWithoutTelemetry.reportError(error, 'test');
      }).not.toThrow();
    });
  });

  describe('error storage', () => {
    it('should store up to 10 recent errors', () => {
      for (let i = 0; i < 12; i++) {
        reporter.reportError(new Error(`Error ${i}`), 'test');
      }

      const recentErrors = reporter.getRecentErrors();
      expect(recentErrors).toHaveLength(10);
      expect(recentErrors[0].message).toBe('Error 2'); // First two should be dropped
    });

    it('should return copy of errors array', () => {
      reporter.reportError(new Error('Test'), 'test');

      const errors1 = reporter.getRecentErrors();
      const errors2 = reporter.getRecentErrors();

      expect(errors1).not.toBe(errors2); // Different array references
      expect(errors1).toEqual(errors2); // Same content
    });

    it('should clear all errors', () => {
      reporter.reportError(new Error('Test 1'), 'test');
      reporter.reportError(new Error('Test 2'), 'test');

      expect(reporter.getRecentErrors()).toHaveLength(2);

      reporter.clearErrors();

      expect(reporter.getRecentErrors()).toHaveLength(0);
    });
  });

  describe('GitHub issue generation', () => {
    beforeEach(() => {
      (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Report Bug');
    });

    it('should open GitHub issue page when Report Bug is selected', async () => {
      const error = new Error('Test error');

      reporter.reportError(error, 'database');

      // Wait for async notification handling
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(vscode.env.openExternal).toHaveBeenCalled();
      expect(vscode.Uri.parse).toHaveBeenCalledWith(
        expect.stringContaining('https://github.com/codepause-dev/codepause-extension/issues/new')
      );
    });

    it('should include error details in issue URL', async () => {
      const error = new Error('Test error message');
      error.stack = 'Error: Test error message\n    at test.ts:1:1';

      reporter.reportError(error, 'database');

      await new Promise(resolve => setTimeout(resolve, 0));

      const parseCall = (vscode.Uri.parse as jest.Mock).mock.calls[0];
      const issueUrl = parseCall[0];

      expect(issueUrl).toContain('title=' + encodeURIComponent('[Bug] database: Test error message'));
      expect(issueUrl).toContain('labels=bug,auto-reported');
    });

    it('should include extension version in issue body', async () => {
      const error = new Error('Test error');

      reporter.reportError(error, 'test');

      await new Promise(resolve => setTimeout(resolve, 0));

      const parseCall = (vscode.Uri.parse as jest.Mock).mock.calls[0];
      const issueUrl = parseCall[0];
      const bodyMatch = issueUrl.match(/body=([^&]+)/);

      expect(bodyMatch).toBeTruthy();
      const decodedBody = decodeURIComponent(bodyMatch![1]);
      expect(decodedBody).toContain('CodePause Version: 0.2.0');
    });

    it('should include VS Code version in issue body', async () => {
      const error = new Error('Test error');

      reporter.reportError(error, 'test');

      await new Promise(resolve => setTimeout(resolve, 0));

      const parseCall = (vscode.Uri.parse as jest.Mock).mock.calls[0];
      const issueUrl = parseCall[0];
      const bodyMatch = issueUrl.match(/body=([^&]+)/);

      const decodedBody = decodeURIComponent(bodyMatch![1]);
      expect(decodedBody).toContain('VS Code Version:');
    });

    it('should show confirmation message after opening issue', async () => {
      const error = new Error('Test error');

      reporter.reportError(error, 'test');

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Thank you for reporting this bug'),
        'Got it'
      );
    });

    it('should handle external open failure gracefully', async () => {
      (vscode.env.openExternal as jest.Mock).mockRejectedValueOnce(new Error('Failed to open'));

      const error = new Error('Test error');
      reporter.reportError(error, 'test');

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to open bug report')
      );
    });
  });

  describe('error details display', () => {
    beforeEach(() => {
      (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Show Details');
    });

    it('should show error details in output channel', async () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.ts:1:1';

      reporter.reportError(error, 'database', { count: 5 });

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockOutputChannel.clear).toHaveBeenCalled();
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('CodePause Error Details');
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Error Type: database'));
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Message: Test error'));
      expect(mockOutputChannel.show).toHaveBeenCalled();
    });

    it('should display stack trace in output channel', async () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.ts:1:1';

      reporter.reportError(error, 'test');

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('Stack Trace:');
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(error.stack);
    });

    it('should display context in output channel', async () => {
      const error = new Error('Test error');
      const context = { setting: 'advanced', count: 42 };

      reporter.reportError(error, 'test', context);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('Context:');
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('"setting": "advanced"')
      );
    });

    it('should handle missing stack trace', async () => {
      const error = new Error('Test error');
      delete error.stack;

      reporter.reportError(error, 'test');

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('Not available');
    });
  });

  describe('PII sanitization', () => {
    it('should remove file paths from context', () => {
      const error = new Error('Test error');
      const context = {
        filePath: '/secret/path/to/file.ts',
        count: 5
      };

      reporter.reportError(error, 'test', context);

      const recentErrors = reporter.getRecentErrors();
      expect(recentErrors[0].context).toEqual({ count: 5 });
      expect(recentErrors[0].context).not.toHaveProperty('filePath');
    });

    it('should remove file names from context', () => {
      const error = new Error('Test error');
      const context = {
        fileName: 'secret.ts',
        lineNumber: 42
      };

      reporter.reportError(error, 'test', context);

      const recentErrors = reporter.getRecentErrors();
      expect(recentErrors[0].context).toEqual({ lineNumber: 42 });
      expect(recentErrors[0].context).not.toHaveProperty('fileName');
    });

    it('should remove user names from context', () => {
      const error = new Error('Test error');
      const context = {
        userName: 'john_doe',
        userId: 123,
        count: 5
      };

      reporter.reportError(error, 'test', context);

      const recentErrors = reporter.getRecentErrors();
      expect(recentErrors[0].context).toEqual({ count: 5 });
      expect(recentErrors[0].context).not.toHaveProperty('userName');
      expect(recentErrors[0].context).not.toHaveProperty('userId');
    });

    it('should remove email addresses from context', () => {
      const error = new Error('Test error');
      const context = {
        email: 'user@example.com',
        setting: 'advanced'
      };

      reporter.reportError(error, 'test', context);

      const recentErrors = reporter.getRecentErrors();
      expect(recentErrors[0].context).toEqual({ setting: 'advanced' });
      expect(recentErrors[0].context).not.toHaveProperty('email');
    });

    it('should only allow primitive types in context', () => {
      const error = new Error('Test error');
      const context = {
        string: 'value',
        number: 42,
        boolean: true,
        object: { nested: 'value' } as any,
        array: [1, 2, 3] as any
      };

      reporter.reportError(error, 'test', context);

      const recentErrors = reporter.getRecentErrors();
      expect(recentErrors[0].context).toHaveProperty('string');
      expect(recentErrors[0].context).toHaveProperty('number');
      expect(recentErrors[0].context).toHaveProperty('boolean');
      expect(recentErrors[0].context).not.toHaveProperty('object');
      expect(recentErrors[0].context).not.toHaveProperty('array');
    });

    it('should handle undefined context', () => {
      const error = new Error('Test error');

      reporter.reportError(error, 'test', undefined);

      const recentErrors = reporter.getRecentErrors();
      expect(recentErrors[0].context).toBeUndefined();
    });

    it('should handle empty context', () => {
      const error = new Error('Test error');

      reporter.reportError(error, 'test', {});

      const recentErrors = reporter.getRecentErrors();
      expect(recentErrors[0].context).toEqual({});
    });
  });

  describe('user interaction', () => {
    it('should do nothing when Dismiss is selected', async () => {
      (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Dismiss');

      const error = new Error('Test error');
      reporter.reportError(error, 'test');

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(vscode.env.openExternal).not.toHaveBeenCalled();
      expect(mockOutputChannel.show).not.toHaveBeenCalled();
    });

    it('should handle undefined action (dismissed by clicking X)', async () => {
      (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue(undefined);

      const error = new Error('Test error');
      reporter.reportError(error, 'test');

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(vscode.env.openExternal).not.toHaveBeenCalled();
      expect(mockOutputChannel.show).not.toHaveBeenCalled();
    });
  });

  describe('disposal', () => {
    it('should dispose output channel', () => {
      reporter.dispose();

      expect(mockOutputChannel.dispose).toHaveBeenCalled();
    });

    it('should not fail when disposed multiple times', () => {
      expect(() => {
        reporter.dispose();
        reporter.dispose();
      }).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle error without message', () => {
      const error = new Error();

      expect(() => {
        reporter.reportError(error, 'test');
      }).not.toThrow();

      const recentErrors = reporter.getRecentErrors();
      expect(recentErrors[0].message).toBe('');
    });

    it('should handle context with missing packageJSON', () => {
      const invalidContext = {
        extension: { packageJSON: {} }
      };

      expect(() => {
        new ErrorReporter(invalidContext as any);
      }).not.toThrow();
    });

    it('should handle notification failure gracefully', async () => {
      (vscode.window.showErrorMessage as jest.Mock).mockRejectedValueOnce(
        new Error('Notification failed')
      );

      const error = new Error('Test error');

      expect(() => {
        reporter.reportError(error, 'test');
      }).not.toThrow();
    });
  });
});
