/**
 * ErrorReporter
 * Handles errors gracefully and provides easy bug reporting
 */

import * as vscode from 'vscode';
import { TelemetryService } from '../telemetry/TelemetryService';

export interface ErrorContext {
  errorType: string;
  message: string;
  stack?: string;
  context?: Record<string, string | number | boolean>;
  timestamp: number;
}

export class ErrorReporter {
  private recentErrors: ErrorContext[] = [];
  private readonly maxRecentErrors = 10;
  private outputChannel: vscode.OutputChannel;

  constructor(
    private context: vscode.ExtensionContext,
    private telemetryService?: TelemetryService
  ) {
    this.outputChannel = vscode.window.createOutputChannel('CodePause Errors');
  }

  /**
   * Report an error
   */
  reportError(error: Error, errorType: string, context?: Record<string, string | number | boolean>): void {
    const errorContext: ErrorContext = {
      errorType,
      message: error.message,
      stack: error.stack,
      context: this.sanitizeContext(context),
      timestamp: Date.now()
    };

    // Log to console
    console.error(`[CodePause Error] ${errorType}:`, error);

    // Track in telemetry (frequency only)
    if (this.telemetryService) {
      this.telemetryService.trackError(errorType);
    }

    // Store recent errors
    this.recentErrors.push(errorContext);
    if (this.recentErrors.length > this.maxRecentErrors) {
      this.recentErrors.shift();
    }

    // Show to user (non-blocking)
    this.showErrorNotification(errorContext).catch(err => {
      console.error('[CodePause] Failed to show error notification:', err);
    });
  }

  /**
   * Show error notification to user
   */
  private async showErrorNotification(errorContext: ErrorContext): Promise<void> {
    const action = await vscode.window.showErrorMessage(
      `CodePause Error: ${errorContext.errorType}\n${errorContext.message}`,
      'Report Bug',
      'Show Details',
      'Dismiss'
    );

    if (action === 'Report Bug') {
      await this.createBugReport(errorContext);
    } else if (action === 'Show Details') {
      this.showErrorDetails(errorContext);
    }
  }

  /**
   * Create bug report (GitHub Issue)
   */
  private async createBugReport(errorContext: ErrorContext): Promise<void> {
    const issueBody = this.generateIssueBody(errorContext);

    // Open GitHub issue creation page with pre-filled template
    const issueUrl = `https://github.com/codepause-dev/codepause-extension/issues/new?` +
      `title=${encodeURIComponent(`[Bug] ${errorContext.errorType}: ${errorContext.message}`)}&` +
      `body=${encodeURIComponent(issueBody)}&` +
      `labels=bug,auto-reported`;

    try {
      await vscode.env.openExternal(vscode.Uri.parse(issueUrl));

      vscode.window.showInformationMessage(
        'Thank you for reporting this bug! The issue template has been pre-filled.',
        'Got it'
      );
    } catch (error) {
      console.error('[CodePause] Failed to open bug report URL:', error);
      vscode.window.showErrorMessage('Failed to open bug report. Please visit github.com/codepause-dev/codepause-extension/issues');
    }
  }

  /**
   * Generate GitHub issue body
   */
  private generateIssueBody(errorContext: ErrorContext): string {
    const extensionVersion = this.context.extension.packageJSON.version || 'unknown';
    const vscodeVersion = vscode.version;

    return `## Bug Report (Auto-Generated)

**Error Type**: ${errorContext.errorType}

**Error Message**:
\`\`\`
${errorContext.message}
\`\`\`

**Stack Trace**:
\`\`\`
${errorContext.stack || 'Not available'}
\`\`\`

**Environment**:
- CodePause Version: ${extensionVersion}
- VS Code Version: ${vscodeVersion}
- Platform: ${process.platform}
- Timestamp: ${new Date(errorContext.timestamp).toISOString()}

**Context**:
\`\`\`json
${JSON.stringify(errorContext.context || {}, null, 2)}
\`\`\`

**Additional Information**:
<!-- Please add any additional details about what you were doing when this error occurred -->
`;
  }

  /**
   * Show error details in output channel
   */
  private showErrorDetails(errorContext: ErrorContext): void {
    this.outputChannel.clear();
    this.outputChannel.appendLine('CodePause Error Details');
    this.outputChannel.appendLine('='.repeat(80));
    this.outputChannel.appendLine(`Error Type: ${errorContext.errorType}`);
    this.outputChannel.appendLine(`Message: ${errorContext.message}`);
    this.outputChannel.appendLine(`Timestamp: ${new Date(errorContext.timestamp).toISOString()}`);
    this.outputChannel.appendLine('');
    this.outputChannel.appendLine('Stack Trace:');
    this.outputChannel.appendLine(errorContext.stack || 'Not available');
    this.outputChannel.appendLine('');
    this.outputChannel.appendLine('Context:');
    this.outputChannel.appendLine(JSON.stringify(errorContext.context, null, 2));
    this.outputChannel.appendLine('');

    this.outputChannel.show();
  }

  /**
   * Sanitize context (remove PII)
   */
  private sanitizeContext(
    context?: Record<string, string | number | boolean>
  ): Record<string, string | number | boolean> | undefined {
    if (!context) {
      return undefined;
    }

    const sanitized: Record<string, string | number | boolean> = {};

    for (const [key, value] of Object.entries(context)) {
      // Skip file paths, names, etc.
      const keyLower = key.toLowerCase();
      if (
        keyLower.includes('path') ||
        keyLower.includes('file') ||
        keyLower.includes('name') ||
        keyLower.includes('email') ||
        keyLower.includes('user')
      ) {
        continue;
      }

      // Only allow primitives
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Get recent errors (for debugging)
   */
  getRecentErrors(): ErrorContext[] {
    return [...this.recentErrors];
  }

  /**
   * Clear error history
   */
  clearErrors(): void {
    this.recentErrors = [];
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.outputChannel.dispose();
  }
}
