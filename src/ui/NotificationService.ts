/**
 * NotificationService
 * Handles displaying coaching alerts and notifications to users
 */

import * as vscode from 'vscode';
import { Alert, AlertType, AlertAction } from '../types';
import { ConfigRepository } from '../storage/ConfigRepository';

export class NotificationService {
  private configRepository: ConfigRepository;
  private activeNotifications: Map<string, Thenable<string | undefined>>;
  private recentAlertMessages: Map<string, number>; // Track recent alert messages to prevent duplicates

  constructor(configRepository: ConfigRepository) {
    this.configRepository = configRepository;
    this.activeNotifications = new Map();
    this.recentAlertMessages = new Map();
  }

  async showAlert(alert: Alert): Promise<void> {
    const now = Date.now();
    
    // Check if already showing this alert (by ID)
    if (this.activeNotifications.has(alert.id)) {
      return;
    }

    // Check for duplicate messages within last 5 seconds
    // Use a more flexible key that ignores timeDelta variations
    const messageBase = alert.message.replace(/\d+ms review time/g, 'Xms review time');
    const messageKey = `${alert.type}-${messageBase}`;
    const lastShown = this.recentAlertMessages.get(messageKey);
    if (lastShown && (now - lastShown) < 5000) {
      return;
    }

    // Also check by alert type + timeDelta range (within 100ms) to catch same event processed multiple times
    if (alert.metadata?.detection?.timeDelta) {
      const timeDelta = alert.metadata.detection.timeDelta;
      const timeDeltaRange = Math.floor(timeDelta / 100) * 100; // Round to nearest 100ms
      const timeDeltaKey = `${alert.type}-timeDelta-${timeDeltaRange}`;
      const lastTimeDeltaShown = this.recentAlertMessages.get(timeDeltaKey);
      if (lastTimeDeltaShown && (now - lastTimeDeltaShown) < 5000) {
        return;
      }
      this.recentAlertMessages.set(timeDeltaKey, now);
    }

    // Record this message
    this.recentAlertMessages.set(messageKey, now);
    
    // Clean up old entries (older than 10 seconds)
    for (const [key, timestamp] of this.recentAlertMessages.entries()) {
      if (now - timestamp > 10000) {
        this.recentAlertMessages.delete(key);
      }
    }

    // Check if snoozed
    const snoozeState = await this.configRepository.getSnoozeState();
    if (snoozeState.snoozed && alert.type !== AlertType.Achievement) {
      // Don't show alerts when snoozed (except achievements)
      return;
    }

    // Show notification based on type
    await this.displayNotification(alert);
  }

  private async displayNotification(alert: Alert): Promise<void> {
    // Build action buttons
    const actions: string[] = [];

    if (alert.actions) {
      for (const action of alert.actions) {
        actions.push(action.label);
      }
    } else {
      // Default actions based on alert type
      if (alert.type === AlertType.Achievement) {
        actions.push('Awesome!');
      } else {
        actions.push('Got It', 'Snooze');
      }
    }

    // Choose notification method based on alert type
    let notification: Thenable<string | undefined>;

    switch (alert.type) {
      case AlertType.GentleNudge:
        // Use information message for gentle tone
        notification = vscode.window.showInformationMessage(
          `⚡ ${alert.title}: ${alert.message}`,
          { modal: false },
          ...actions
        );
        break;

      case AlertType.StreakWarning:
        // More prominent for patterns
        notification = vscode.window.showWarningMessage(
          `🎯 ${alert.title}: ${alert.message}`,
          { modal: false },
          ...actions
        );
        break;

      case AlertType.Achievement:
        notification = vscode.window.showInformationMessage(
          `${alert.title}: ${alert.message}`,
          { modal: false },
          ...actions
        );
        break;

      case AlertType.EducationalMoment:
      default:
        notification = vscode.window.showInformationMessage(
          `💡 ${alert.title}: ${alert.message}`,
          { modal: false },
          ...actions
        );
        break;
    }

    // Store active notification
    this.activeNotifications.set(alert.id, notification);

    // Auto-close if specified
    if (alert.autoClose) {
      setTimeout(() => {
        this.activeNotifications.delete(alert.id);
      }, alert.autoClose * 1000);
    }

    // Handle user response
    const response = await notification;
    this.activeNotifications.delete(alert.id);

    if (response) {
      await this.handleResponse(response, alert);
    }
  }

  private async handleResponse(response: string, alert: Alert): Promise<void> {
    // Find the action that matches the response
    let action: AlertAction | undefined;

    if (alert.actions) {
      action = alert.actions.find(a => a.label === response);
    } else {
      // Map default responses to actions
      action = this.getDefaultAction(response);
    }

    if (!action) {
      return;
    }

    // Execute action
    await this.executeAction(action);
  }

  private getDefaultAction(response: string): AlertAction | undefined {
    switch (response) {
      case 'Got It':
      case 'Awesome!':
      case 'OK':
        return { label: response, action: 'dismiss' };

      case 'Snooze':
        return { label: response, action: 'snooze' };

      case 'Learn More':
        return { label: response, action: 'learn-more' };

      case 'Dashboard':
      case 'View All':
        return { label: response, action: 'open-dashboard' };

      case 'Settings':
        return { label: response, action: 'open-settings' };

      default:
        return undefined;
    }
  }

  private async executeAction(action: AlertAction): Promise<void> {
    switch (action.action) {
      case 'dismiss':
        // Nothing to do
        break;

      case 'snooze':
        await this.configRepository.snoozeUntilEndOfDay('User requested from alert');
        vscode.window.showInformationMessage('✓ Alerts snoozed until end of day');
        break;

      case 'learn-more':
        // Open documentation or help page
        await vscode.env.openExternal(
          vscode.Uri.parse('https://github.com/codepause-dev/codepause-extension#readme')
        );
        break;

      case 'open-dashboard':
        await vscode.commands.executeCommand('codePause.openDashboard');
        break;

      case 'open-settings':
        await vscode.commands.executeCommand('codePause.openSettings');
        break;
    }
  }

  /**
   * Convert milliseconds to user-friendly time string
   */
  private formatTime(ms: number): string {
    if (ms < 1000) {
      return 'under 1 second';
    } else if (ms < 2000) {
      return '1 second';
    } else if (ms < 60000) {
      return `${Math.round(ms / 1000)} seconds`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.round((ms % 60000) / 1000);
      return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes} minutes`;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async showGentleNudge(timeDelta: number, threshold: number): Promise<void> {
    const timeStr = this.formatTime(timeDelta);
    const thresholdStr = this.formatTime(threshold);

    const alert: Alert = {
      id: `nudge-${Date.now()}`,
      type: AlertType.GentleNudge,
      title: 'Quick Review Detected',
      message: `You reviewed that in ${timeStr}. Try taking at least ${thresholdStr} to spot potential bugs and understand the code better.`,
      timestamp: Date.now(),
      actions: [
        { label: 'Got It', action: 'dismiss' },
        { label: 'Snooze', action: 'snooze' },
        { label: 'Dashboard', action: 'open-dashboard' }
      ]
    };

    await this.showAlert(alert);
  }

  async showEducationalMoment(tip: string): Promise<void> {
    const alert: Alert = {
      id: `edu-${Date.now()}`,
      type: AlertType.EducationalMoment,
      title: 'Coding Tip',
      message: tip,
      timestamp: Date.now(),
      autoClose: 8, // Auto-close after 8 seconds (more time to read)
      actions: [
        { label: 'Got It', action: 'dismiss' },
        { label: 'Learn More', action: 'learn-more' }
      ]
    };

    await this.showAlert(alert);
  }

  async showStreakWarning(streakCount: number): Promise<void> {
    const alert: Alert = {
      id: `streak-${Date.now()}`,
      type: AlertType.StreakWarning,
      title: 'Review Pattern Notice',
      message: `You've quickly accepted ${streakCount} suggestions in a row. Slow down and review each suggestion for at least 3-5 seconds to catch bugs and learn.`,
      timestamp: Date.now(),
      actions: [
        { label: 'Got It', action: 'dismiss' },
        { label: 'Snooze', action: 'snooze' },
        { label: 'Dashboard', action: 'open-dashboard' }
      ]
    };

    await this.showAlert(alert);
  }

  async showAchievementUnlocked(title: string, description: string): Promise<void> {
    const alert: Alert = {
      id: `achievement-${Date.now()}`,
      type: AlertType.Achievement,
      title: `🏆 ${title}`,
      message: description,
      timestamp: Date.now(),
      actions: [
        { label: 'Awesome!', action: 'dismiss' },
        { label: 'View All', action: 'open-dashboard' }
      ]
    };

    await this.showAlert(alert);
  }

  async showLevelUp(level: number, title: string, icon: string): Promise<void> {
    const alert: Alert = {
      id: `level-up-${Date.now()}`,
      type: AlertType.Achievement,
      title: `${icon} Level ${level} Reached!`,
      message: `Congratulations! You're now a ${title}. Keep up the mindful coding!`,
      timestamp: Date.now(),
      actions: [
        { label: 'Awesome!', action: 'dismiss' },
        { label: 'Dashboard', action: 'open-dashboard' }
      ]
    };

    await this.showAlert(alert);
  }

  async showAchievementProgress(achievementTitle: string, progress: number, icon: string): Promise<void> {
    const alert: Alert = {
      id: `progress-${Date.now()}`,
      type: AlertType.EducationalMoment,
      title: `${icon} Almost There!`,
      message: `You're ${progress}% of the way to unlocking "${achievementTitle}". Keep going!`,
      timestamp: Date.now(),
      autoClose: 6,
      actions: [
        { label: 'Got It', action: 'dismiss' },
        { label: 'Dashboard', action: 'open-dashboard' }
      ]
    };

    await this.showAlert(alert);
  }

  async showXPGain(xpAmount: number, action: string, showNotification: boolean = false): Promise<void> {
    // Only show full notifications for significant XP gains or when explicitly requested
    if (showNotification || xpAmount >= 10) {
      vscode.window.showInformationMessage(`✨ +${xpAmount} XP: ${action}`);
    }
  }

  async showProgressNotification(message: string): Promise<void> {
    vscode.window.showInformationMessage(`🤖 ${message}`);
  }

  showError(message: string, actionText?: string): void {
    const actions = actionText ? [actionText] : [];
    vscode.window.showErrorMessage(`CodePause: ${message}`, ...actions);
  }

  showErrorWithGuidance(error: Error, context: string): void {
    const guidance = this.getErrorGuidance(error, context);
    vscode.window.showErrorMessage(`CodePause - ${context}: ${guidance}`, 'Retry', 'Report Issue');
  }

  private getErrorGuidance(error: Error, context: string): string {
    const errorMsg = error.message.toLowerCase();

    // Database errors
    if (errorMsg.includes('database') || errorMsg.includes('sqlite')) {
      return 'Database error. Try reloading VS Code. If the issue persists, your database file may be corrupted.';
    }

    // File system errors
    if (errorMsg.includes('enoent') || errorMsg.includes('file not found')) {
      return 'File not found. The extension may need to reinitialize. Try reloading VS Code.';
    }

    if (errorMsg.includes('eacces') || errorMsg.includes('permission')) {
      return 'Permission denied. Check that VS Code has write access to the extension storage directory.';
    }

    // Network errors
    if (errorMsg.includes('network') || errorMsg.includes('fetch') || errorMsg.includes('timeout')) {
      return 'Network error. Check your internet connection and try again.';
    }

    // Configuration errors
    if (context.includes('config') || context.includes('setting')) {
      return 'Configuration error. Try resetting your CodePause settings to defaults.';
    }

    // Tracker errors
    if (context.includes('tracker') || context.includes('tracking')) {
      return 'Tracking error. The AI tool integration may have failed. Try reloading VS Code.';
    }

    // Generic fallback with context
    return `${error.message}. Try reloading VS Code or check the output panel for details.`;
  }

  /**
   * Show skill-level aware over-reliance notification
   * Adapts message based on developer experience level
   */
  async showOverRelianceNotification(
    experienceLevel: 'junior' | 'mid' | 'senior',
    aiPercentage: number,
    targetPercentage: number
  ): Promise<void> {
    let title: string;
    let message: string;
    let tone: string;

    if (experienceLevel === 'junior') {
      title = 'Skill Development Check';
      tone = '💡';
      message = `Today you're at ${Math.round(aiPercentage)}% AI-generated code.\n\n` +
        `Building strong fundamentals requires hands-on practice. Research shows junior developers learn 3x faster when writing 40%+ of code manually.\n\n` +
        `Try: Solve the next small function yourself before asking AI. You'll retain more and understand patterns better.\n\n` +
        `Target: <${targetPercentage}% AI for optimal skill growth`;
    } else if (experienceLevel === 'mid') {
      title = 'Balance Check';
      tone = '⚖️';
      const excess = Math.round(aiPercentage - targetPercentage);
      message = `This week: ${Math.round(aiPercentage)}% AI / ${Math.round(100 - aiPercentage)}% manual\n\n` +
        `You're ${excess}% over your target. Maintaining coding skills requires regular practice.\n\n` +
        `Recommendation: Reserve time for manual problem-solving. Your architectural thinking stays sharper with balanced practice.\n\n` +
        `Target: ~${targetPercentage}% AI for balanced productivity`;
    } else {
      title = 'Usage Pattern Alert';
      tone = '📊';
      message = `Monthly average: ${Math.round(aiPercentage)}% AI\n\n` +
        `High AI usage correlates with 19% slower task completion (METR 2025 study). Your critical thinking and architecture skills need regular exercise.\n\n` +
        `Impact: Over-reliance can lead to shallow understanding and degraded debugging skills.\n\n` +
        `Target: <${targetPercentage}% AI to maintain expertise`;
    }

    await vscode.window.showInformationMessage(
      `${tone} ${title}\n\n${message}`,
      { modal: false },
      'View Stats',
      'Remind Tomorrow',
      'Dismiss'
    );
  }

  /**
   * Show skill-level aware insufficient review notification
   * Different approaches for junior/mid/senior
   */
  async showInsufficientReviewNotification(
    experienceLevel: 'junior' | 'mid' | 'senior',
    reviewTime: number,
    linesOfCode: number
  ): Promise<void> {
    let title: string;
    let message: string;
    let tone: string;

    if (experienceLevel === 'junior') {
      title = 'Review Reminder';
      tone = '🔍';
      message = `That ${linesOfCode}-line function was reviewed for ${this.formatTime(reviewTime)}.\n\n` +
        `AI code has 1.7x more bugs (CodeRabbit 2025). Taking time to review helps you:\n` +
        `• Catch logic errors and edge cases\n` +
        `• Learn how the code works\n` +
        `• Build debugging intuition\n\n` +
        `Suggested: Spend 20-30 seconds checking:\n` +
        `- Variable names make sense?\n` +
        `- Error handling included?\n` +
        `- Edge cases covered?`;
    } else if (experienceLevel === 'mid') {
      title = 'Review Quality Notice';
      tone = '⚠️';
      message = `Quick acceptance pattern detected (${this.formatTime(reviewTime)} review for ${linesOfCode} lines).\n\n` +
        `Taking a moment to review maintains code quality and catches issues early. Your usual review time is typically longer.\n\n` +
        `Quick acceptances can lead to technical debt and harder debugging sessions later.`;
    } else {
      title = 'Code Ownership Alert';
      tone = '👨‍💻';
      message = `${linesOfCode} lines accepted in ${this.formatTime(reviewTime)}.\n\n` +
        `Pattern suggests reduced code ownership. Healthy AI usage includes reviewing and adapting suggestions.\n\n` +
        `Data point: Seniors who edit 30-40% of AI suggestions report better code quality and fewer production issues.`;
    }

    const response = await vscode.window.showWarningMessage(
      `${tone} ${title}\n\n${message}`,
      { modal: false },
      'Review Now',
      'Got It',
      'Snooze'
    );

    if (response === 'Review Now') {
      // Focus back on editor
      await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    } else if (response === 'Snooze') {
      await this.configRepository.snoozeUntilEndOfDay('User requested from review reminder');
      vscode.window.showInformationMessage('✓ Review reminders snoozed until end of day');
    }
  }

  /**
   * Show positive reinforcement for good balance
   * Everyone loves encouragement, but keep it professional
   */
  async showPositiveReinforcementNotification(
    aiPercentage: number,
    reviewQuality: number
  ): Promise<void> {
    const manualPercentage = Math.round(100 - aiPercentage);

    await vscode.window.showInformationMessage(
      `🌟 Great Work!\n\n` +
      `Today: ${Math.round(aiPercentage)}% AI, ${manualPercentage}% manual + ${reviewQuality}% review quality score\n\n` +
      `You're maintaining excellent balance and code quality. This is the sweet spot for productivity + skill maintenance.\n\n` +
      `Keep it up!`,
      { modal: false },
      'See My Stats',
      'Thanks!'
    );
  }

  /**
   * Show weekly pattern summary (for all levels)
   * Data-driven, not judgmental
   */
  async showWeeklySummaryNotification(
    experienceLevel: 'junior' | 'mid' | 'senior',
    weeklyAIPercentage: number,
    editRate: number,
    rejectionRate: number
  ): Promise<void> {
    const isHealthy = editRate >= 0.3 || rejectionRate >= 0.1;
    const tone = isHealthy ? '✅' : '📊';
    const title = isHealthy ? 'Healthy AI Usage Pattern' : 'Weekly Pattern Summary';

    let message = `This week's AI usage: ${Math.round(weeklyAIPercentage)}%\n\n`;
    message += `Engagement metrics:\n`;
    message += `• ${Math.round(editRate * 100)}% of AI code was edited\n`;
    message += `• ${Math.round(rejectionRate * 100)}% of suggestions rejected\n\n`;

    if (isHealthy) {
      message += `You're actively engaging with AI suggestions rather than blindly accepting. This indicates strong code ownership.`;
    } else {
      const benchmark = experienceLevel === 'senior' ? '30-40%' : '20-30%';
      message += `Industry benchmark: ${benchmark} of AI suggestions should be edited or rejected.\n\n`;
      message += `Low engagement may indicate reduced critical thinking. Try challenging AI suggestions more often.`;
    }

    await vscode.window.showInformationMessage(
      `${tone} ${title}\n\n${message}`,
      { modal: false },
      'View Details',
      'OK'
    );
  }

  clearAll(): void {
    this.activeNotifications.clear();
  }

  static getEducationalTips(): string[] {
    return [
      'Taking time to review AI suggestions helps you learn and spot potential issues.',
      'Balanced AI usage (40-60%) promotes both productivity and skill development.',
      'Understanding why AI suggests code is as important as using the suggestion.',
      'Quick acceptance might save time now, but thorough review saves debugging time later.',
      'AI tools are assistants, not replacements. Your judgment and expertise matter most.',
      'Reviewing AI code carefully helps maintain your critical thinking skills.',
      'Consider edge cases that AI might miss when accepting suggestions.',
      'The best developers use AI thoughtfully, not blindly.',
      'Your experience improves when you actively engage with AI suggestions.',
      'Taking breaks from AI suggestions helps maintain your problem-solving abilities.'
    ];
  }

  static getRandomTip(): string {
    const tips = NotificationService.getEducationalTips();
    return tips[Math.floor(Math.random() * tips.length)];
  }
}
