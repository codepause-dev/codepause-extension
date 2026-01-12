/**
 * StatusBarManager
 * Manages the status bar item showing real-time AI usage statistics
 */

import * as vscode from 'vscode';
import { MetricsRepository } from '../storage/MetricsRepository';
import { ConfigRepository } from '../storage/ConfigRepository';
import { ThresholdManager } from '../core/ThresholdManager';
import { DailyMetrics } from '../types';

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;
  private metricsRepository: MetricsRepository;
  private configRepository: ConfigRepository;
  private thresholdManager: ThresholdManager;
  private updateInterval: NodeJS.Timeout | null = null;
  private readonly UPDATE_INTERVAL_MS = 5000; // Update every 5 seconds

  constructor(
    metricsRepository: MetricsRepository,
    configRepository: ConfigRepository,
    thresholdManager: ThresholdManager
  ) {
    this.metricsRepository = metricsRepository;
    this.configRepository = configRepository;
    this.thresholdManager = thresholdManager;

    // Create status bar item (left side, high priority)
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );

    this.statusBarItem.command = 'codePause.openDashboard';
    this.statusBarItem.tooltip = 'Click to open CodePause dashboard';
  }

  async initialize(): Promise<void> {
    await this.updateStatusBar();
    this.statusBarItem.show();

    // Start periodic updates
    this.updateInterval = setInterval(async () => {
      await this.updateStatusBar();
    }, this.UPDATE_INTERVAL_MS);
  }

  private async updateStatusBar(): Promise<void> {
    try {
      // Check if snoozed
      const snoozeState = await this.configRepository.getSnoozeState();
      if (snoozeState.snoozed) {
        this.showSnoozedState();
        return;
      }

      // Get today's metrics
      const today = this.getTodayDateString();
      const metrics = await this.metricsRepository.getDailyMetrics(today);

      if (!metrics || metrics.totalEvents === 0) {
        this.showIdleState();
        return;
      }

      // Get threshold for current user level
      const threshold = this.thresholdManager.getConfig();

      // Format and display metrics
      const aiPercentage = Math.round(metrics.aiPercentage);
      const suggestionCount = metrics.totalEvents;

      // Determine color based on AI percentage threshold
      const color = this.getColorForAIPercentage(aiPercentage, threshold.maxAIPercentage);

      // Build status text
      let statusText = `🤖 ${aiPercentage}% AI`;

      if (suggestionCount > 0) {
        statusText += ` | ${suggestionCount} suggestions`;
      }

      this.statusBarItem.text = statusText;
      this.statusBarItem.color = color;

      // Update tooltip with more details
      this.statusBarItem.tooltip = this.buildTooltip(metrics, threshold.maxAIPercentage);

    } catch (error) {
      console.error('Failed to update status bar:', error);
      this.showErrorState();
    }
  }

  private showIdleState(): void {
    this.statusBarItem.text = '🤖 CodePause';
    this.statusBarItem.color = undefined;
    this.statusBarItem.tooltip = 'CodePause is monitoring your AI usage. Start coding to see stats!';
  }

  private showSnoozedState(): void {
    this.statusBarItem.text = '🤖 💤 Snoozed';
    this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningBackground');
    this.statusBarItem.tooltip = 'CodePause alerts are snoozed. Click to open dashboard.';
  }

  private showErrorState(): void {
    this.statusBarItem.text = '🤖 Error';
    this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorBackground');
    this.statusBarItem.tooltip = 'CodePause encountered an error. Check logs for details.';
  }

  private getColorForAIPercentage(aiPercentage: number, maxThreshold: number): string | vscode.ThemeColor | undefined {
    if (aiPercentage >= maxThreshold + 10) {
      // Over threshold by 10%+ = orange/warning
      return new vscode.ThemeColor('statusBarItem.warningForeground');
    } else if (aiPercentage >= maxThreshold) {
      // At or slightly over threshold = yellow
      return '#FFD700'; // Gold
    } else if (aiPercentage >= maxThreshold - 10) {
      // Near threshold = green (good balance)
      return '#90EE90'; // Light green
    } else {
      // Well under threshold = default color
      return undefined;
    }
  }

  private buildTooltip(metrics: DailyMetrics, maxThreshold: number): string {
    const lines: string[] = [
      '**CodePause - Today\'s Stats**',
      '',
      `AI Code: ${Math.round(metrics.aiPercentage)}% (Target: ${maxThreshold}%)`,
      `Suggestions: ${metrics.totalEvents}`,
      `Avg Review Time: ${this.formatReviewTime(metrics.averageReviewTime)}`,
      `Manual Lines: ${metrics.totalManualLines}`,
      '',
      '_Click to open dashboard for detailed insights_'
    ];

    return lines.join('\n');
  }

  private formatReviewTime(ms: number): string {
    if (ms < 1000) {
      return `${Math.round(ms)}ms`;
    } else {
      return `${(ms / 1000).toFixed(1)}s`;
    }
  }

  private getTodayDateString(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  async refresh(): Promise<void> {
    await this.updateStatusBar();
  }

  showTemporaryMessage(message: string, durationMs: number = 3000): void {
    const originalText = this.statusBarItem.text;
    const originalColor = this.statusBarItem.color;
    const originalTooltip = this.statusBarItem.tooltip;

    this.statusBarItem.text = message;
    this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.prominentForeground');

    setTimeout(async () => {
      this.statusBarItem.text = originalText;
      this.statusBarItem.color = originalColor;
      this.statusBarItem.tooltip = originalTooltip;
      await this.updateStatusBar();
    }, durationMs);
  }

  dispose(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    this.statusBarItem.dispose();
  }
}
