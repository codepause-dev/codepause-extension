/**
 * TelemetryService
 * Collects anonymous usage data to improve CodePause
 *
 * Privacy guarantees:
 * - No code content
 * - No file names/paths
 * - No user identity
 * - User can opt-out anytime
 * - Respects VS Code's global telemetry setting
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as os from 'os';

interface TelemetryEvent {
  eventType: string;
  properties?: Record<string, string | number | boolean>;
  timestamp: number;
}

interface TelemetryPayload {
  userId: string;
  extensionVersion: string;
  vscodeVersion: string;
  platform: string;
  events: TelemetryEvent[];
}

export class TelemetryService {
  private enabled: boolean;
  private userId: string; // Anonymous hash
  private eventBuffer: TelemetryEvent[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly flushIntervalMs = 5 * 60 * 1000; // 5 minutes
  private readonly maxBufferSize = 50;
  // Update this to your production API URL if needed
  // Local development: http://localhost:8000/api/v1/telemetry
  // Production: 'https://api.codepause.dev/api/v1/telemetry'
  private readonly endpointUrl = 'https://api.codepause.dev/api/v1/telemetry';

  constructor(private context: vscode.ExtensionContext) {
    this.enabled = this.isEnabled();
    this.userId = this.getOrCreateUserId();
  }

  /**
   * Initialize telemetry (start flush interval)
   */
  initialize(): void {
    if (!this.enabled) {
      return;
    }

    this.flushInterval = setInterval(() => {
      this.flush().catch(() => {
        // Silent retry on next interval
      });
    }, this.flushIntervalMs);
  }

  /**
   * Check if telemetry is enabled
   */
  private isEnabled(): boolean {
    // Respect VS Code's global telemetry setting
    const vscodeConfig = vscode.workspace.getConfiguration('telemetry');
    const vscodeLevel = vscodeConfig.get<string>('telemetryLevel', 'all');
    const vscodeEnabled = vscodeLevel !== 'off';

    // Respect CodePause's own setting
    const codePauseConfig = vscode.workspace.getConfiguration('codePause');
    const codePauseEnabled = codePauseConfig.get<boolean>('enableTelemetry', true);

    return vscodeEnabled && codePauseEnabled;
  }

  /**
   * Get or create anonymous user ID
   */
  private getOrCreateUserId(): string {
    let userId = this.context.globalState.get<string>('telemetry.userId');

    if (!userId) {
      // Create anonymous hash based on machine ID
      const machineId = vscode.env.machineId;
      userId = crypto.createHash('sha256').update(machineId).digest('hex').substring(0, 16);
      this.context.globalState.update('telemetry.userId', userId);
    }

    return userId;
  }

  /**
   * Track an event
   */
  track(eventType: string, properties?: Record<string, string | number | boolean>): void {
    if (!this.enabled) {
      return;
    }

    const event: TelemetryEvent = {
      eventType,
      properties: this.sanitizeProperties(properties),
      timestamp: Date.now()
    };

    this.eventBuffer.push(event);

    // Flush immediately if buffer is large
    if (this.eventBuffer.length >= this.maxBufferSize) {
      this.flush().catch(() => {
        // Silent retry on next interval
      });
    }
  }

  /**
   * Sanitize properties (remove any PII)
   */
  private sanitizeProperties(
    properties?: Record<string, string | number | boolean>
  ): Record<string, string | number | boolean> | undefined {
    if (!properties) {
      return undefined;
    }

    const sanitized: Record<string, string | number | boolean> = {};

    for (const [key, value] of Object.entries(properties)) {
      // Skip properties that might contain PII
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

      // Only allow primitive types
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Flush events to server
   */
  private async flush(): Promise<void> {
    if (this.eventBuffer.length === 0) {
      return;
    }

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      const payload: TelemetryPayload = {
        userId: this.userId,
        extensionVersion: this.context.extension.packageJSON.version,
        vscodeVersion: vscode.version,
        platform: os.platform(),
        events
      };

      // Send to telemetry endpoint
      const response = await fetch(this.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `CodePause/${this.context.extension.packageJSON.version}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        // Put events back in buffer to retry
        this.eventBuffer.unshift(...events);
      }
    } catch {
      // Put events back in buffer to retry
      this.eventBuffer.unshift(...events);
    }
  }

  /**
   * Track extension activation
   */
  trackActivation(): void {
    const isFirstTime = !this.context.globalState.get('hasActivatedBefore', false);

    this.track('extension.activated', {
      firstTime: isFirstTime
    });

    if (isFirstTime) {
      this.context.globalState.update('hasActivatedBefore', true);
    }
  }

  /**
   * Track command execution
   */
  trackCommand(commandName: string): void {
    this.track('command.executed', {
      command: commandName
    });
  }

  /**
   * Track error occurrence (no error message, just count)
   */
  trackError(errorType: string): void {
    this.track('error.occurred', {
      errorType // e.g., 'database', 'initialization', 'tracking'
    });
  }

  /**
   * Track session end
   */
  trackSessionEnd(durationMs: number, eventCount: number): void {
    this.track('session.ended', {
      durationSeconds: Math.round(durationMs / 1000),
      eventCount
    });
  }

  /**
   * Track feature usage
   */
  trackFeature(featureName: string, action: string): void {
    this.track('feature.used', {
      feature: featureName,
      action
    });
  }

  /**
   * Get current enabled status
   */
  isTrackingEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get anonymous user ID
   */
  getUserId(): string {
    return this.userId;
  }

  /**
   * Get pending event count
   */
  getPendingEventCount(): number {
    return this.eventBuffer.length;
  }

  /**
   * Dispose (flush remaining events)
   */
  async dispose(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Final flush
    await this.flush();
  }
}
