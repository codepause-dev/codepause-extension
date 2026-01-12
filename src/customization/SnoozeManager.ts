/**
 * SnoozeManager
 * Advanced alert snoozing with multiple duration options
 */

import { ConfigRepository } from '../storage/ConfigRepository';
import { SnoozeState } from '../types';
import * as vscode from 'vscode';

export class SnoozeManager {
  private configRepository: ConfigRepository;
  private readonly onSnoozeChangedEmitter: vscode.EventEmitter<SnoozeState>;
  public readonly onSnoozeChanged: vscode.Event<SnoozeState>;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(configRepository: ConfigRepository) {
    this.configRepository = configRepository;

    // Create snooze state changed event
    this.onSnoozeChangedEmitter = new vscode.EventEmitter<SnoozeState>();
    this.onSnoozeChanged = this.onSnoozeChangedEmitter.event;
  }

  async initialize(): Promise<void> {
    // Check for expired snooze periodically (every minute)
    this.checkInterval = setInterval(async () => {
      await this.checkExpiredSnooze();
    }, 60 * 1000);

    // Check immediately on startup
    await this.checkExpiredSnooze();
  }

  async snoozeFor(durationMs: number, reason?: string): Promise<void> {
    const snoozeUntil = Date.now() + durationMs;

    await this.configRepository.setSnoozeState({
      snoozed: true,
      snoozeUntil,
      snoozeReason: reason
    });

    const state = await this.configRepository.getSnoozeState();
    this.onSnoozeChangedEmitter.fire(state);

    // Show confirmation
    const durationStr = this.formatDuration(durationMs);
    vscode.window.showInformationMessage(
      `CodePause alerts snoozed for ${durationStr}`
    );
  }

  async snoozeUntilEndOfDay(reason?: string): Promise<void> {
    await this.configRepository.snoozeUntilEndOfDay(reason);

    const state = await this.configRepository.getSnoozeState();
    this.onSnoozeChangedEmitter.fire(state);

    vscode.window.showInformationMessage(
      'CodePause alerts snoozed until end of day'
    );
  }

  async snoozeFor1Hour(reason?: string): Promise<void> {
    await this.snoozeFor(60 * 60 * 1000, reason || 'Snoozed for 1 hour');
  }

  async snoozeFor2Hours(reason?: string): Promise<void> {
    await this.snoozeFor(2 * 60 * 60 * 1000, reason || 'Snoozed for 2 hours');
  }

  async snoozeFor4Hours(reason?: string): Promise<void> {
    await this.snoozeFor(4 * 60 * 60 * 1000, reason || 'Snoozed for 4 hours');
  }

  async snoozeUntil(targetTime: Date, reason?: string): Promise<void> {
    const durationMs = targetTime.getTime() - Date.now();

    if (durationMs <= 0) {
      vscode.window.showWarningMessage('Target time must be in the future');
      return;
    }

    await this.snoozeFor(durationMs, reason || `Snoozed until ${targetTime.toLocaleTimeString()}`);
  }

  async clearSnooze(): Promise<void> {
    await this.configRepository.clearSnooze();

    const state = await this.configRepository.getSnoozeState();
    this.onSnoozeChangedEmitter.fire(state);

    vscode.window.showInformationMessage('CodePause alerts resumed');
  }

  async isSnoozed(): Promise<boolean> {
    return await this.configRepository.isSnoozed();
  }

  async getSnoozeState(): Promise<SnoozeState> {
    return await this.configRepository.getSnoozeState();
  }

  async getRemainingTime(): Promise<number> {
    const state = await this.getSnoozeState();

    if (!state.snoozed || !state.snoozeUntil) {
      return 0;
    }

    return Math.max(0, state.snoozeUntil - Date.now());
  }

  async getSnoozeStatus(): Promise<string> {
    const state = await this.getSnoozeState();

    if (!state.snoozed) {
      return 'Alerts active';
    }

    if (!state.snoozeUntil) {
      return 'Alerts snoozed indefinitely';
    }

    const remainingMs = state.snoozeUntil - Date.now();

    if (remainingMs <= 0) {
      return 'Snooze expired (resuming...)';
    }

    const remainingStr = this.formatDuration(remainingMs);
    return `Alerts snoozed for ${remainingStr}`;
  }

  async showSnoozeDialog(): Promise<void> {
    const options = [
      { label: '1 Hour', duration: 60 * 60 * 1000 },
      { label: '2 Hours', duration: 2 * 60 * 60 * 1000 },
      { label: '4 Hours', duration: 4 * 60 * 60 * 1000 },
      { label: 'Until End of Day', duration: -1 },
      { label: 'Resume Alerts', duration: 0 }
    ];

    const selected = await vscode.window.showQuickPick(
      options.map(o => o.label),
      { placeHolder: 'How long would you like to snooze alerts?' }
    );

    if (!selected) {
      return;
    }

    const option = options.find(o => o.label === selected);

    if (!option) {
      return;
    }

    if (option.duration === 0) {
      await this.clearSnooze();
    } else if (option.duration === -1) {
      await this.snoozeUntilEndOfDay('User requested via dialog');
    } else {
      await this.snoozeFor(option.duration, `User snoozed for ${option.label}`);
    }
  }

  private async checkExpiredSnooze(): Promise<void> {
    const state = await this.getSnoozeState();

    if (!state.snoozed || !state.snoozeUntil) {
      return;
    }

    if (Date.now() > state.snoozeUntil) {
      await this.clearSnooze();
      vscode.window.showInformationMessage(
        'CodePause snooze period ended. Alerts resumed.'
      );
    }
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''}`;
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else {
      return `${seconds} second${seconds > 1 ? 's' : ''}`;
    }
  }

  static getPresetDurations(): Array<{ label: string; durationMs: number }> {
    return [
      { label: '15 minutes', durationMs: 15 * 60 * 1000 },
      { label: '30 minutes', durationMs: 30 * 60 * 1000 },
      { label: '1 hour', durationMs: 60 * 60 * 1000 },
      { label: '2 hours', durationMs: 2 * 60 * 60 * 1000 },
      { label: '4 hours', durationMs: 4 * 60 * 60 * 1000 },
      { label: 'Until end of day', durationMs: -1 }
    ];
  }

  dispose(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.onSnoozeChangedEmitter.dispose();
  }
}
