/**
 * OnboardingManager
 * Orchestrates the first-run experience for new users
 *
 * Features:
 * - Welcome message on first activation
 * - Experience level selection (Junior/Mid/Senior)
 * - Quick feature tour (3 screens)
 * - Dashboard preview option
 * - Skip functionality for power users
 */

import * as vscode from 'vscode';
import { ConfigManager } from '../config/ConfigManager';
import { DeveloperLevel } from '../types';

export class OnboardingManager {
  private context: vscode.ExtensionContext;
  private configManager: ConfigManager;
  private readonly totalSteps: number = 3;

  constructor(context: vscode.ExtensionContext, configManager: ConfigManager) {
    this.context = context;
    this.configManager = configManager;
  }

  /**
   * Check if user needs onboarding
   */
  async needsOnboarding(): Promise<boolean> {
    const completed = this.context.globalState.get<boolean>('onboarding.completed', false);
    const skipped = this.context.globalState.get<boolean>('onboarding.skipped', false);

    // If skipped, don't show again unless manually restarted
    return !completed && !skipped;
  }

  /**
   * Start onboarding flow
   */
  async start(): Promise<void> {
    try {
      // Step 1: Welcome
      const shouldContinue = await this.showWelcome();
      if (!shouldContinue) {
        return this.skip();
      }

      // Step 2: Experience Level
      const experienceLevel = await this.selectExperienceLevel();
      if (!experienceLevel) {
        return this.skip();
      }

      // Step 3: Feature Tour
      const completedTour = await this.showFeatureTour();
      if (!completedTour) {
        return this.skip();
      }

      // Step 4: Dashboard Preview
      await this.showDashboardPreview();

      // Mark as completed
      await this.complete();
    } catch (error) {
      console.error('[CodePause] Onboarding error:', error);
      // Don't block extension if onboarding fails
      vscode.window.showErrorMessage(
        'CodePause onboarding encountered an error. You can restart it later with: Ctrl+Shift+P → "CodePause: Start Onboarding"'
      );
    }
  }

  /**
   * Step 1: Welcome Screen
   */
  private async showWelcome(): Promise<boolean> {
    const action = await vscode.window.showInformationMessage(
      '👋 Welcome to CodePause!\n\n' +
      'CodePause helps you maintain code ownership while using AI assistants like Copilot, Cursor, and Claude Code.\n\n' +
      '📊 Track your AI usage in real-time\n' +
      '🎯 Get skill-level aware guidance\n' +
      '🔒 100% private - all data stays local\n\n' +
      'Quick setup takes 60 seconds.',
      { modal: true },
      'Get Started',
      'Skip'
    );

    return action === 'Get Started';
  }

  /**
   * Step 2: Experience Level Selection
   */
  private async selectExperienceLevel(): Promise<DeveloperLevel | undefined> {
    const items: (vscode.QuickPickItem & { level: DeveloperLevel })[] = [
      {
        label: '$(mortar-board) Junior Developer',
        description: 'Less than 2 years of experience',
        detail: 'More guidance, higher AI usage targets (60%)',
        level: DeveloperLevel.Junior
      },
      {
        label: '$(code) Mid-Level Developer',
        description: '2-5 years of experience',
        detail: 'Balanced guidance, moderate AI usage targets (50%)',
        level: DeveloperLevel.Mid
      },
      {
        label: '$(star) Senior Developer',
        description: '5+ years of experience',
        detail: 'Minimal guidance, lower AI usage targets (40%)',
        level: DeveloperLevel.Senior
      }
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select your experience level',
      title: `CodePause Setup (Step 1 of ${this.totalSteps})`,
      ignoreFocusOut: true
    });

    if (!selected) {
      return undefined;
    }

    const level = selected.level;

    // Save to config
    await this.configManager.setExperienceLevel(level);

    // Show brief confirmation
    await vscode.window.showInformationMessage(
      `✅ Experience level set to: ${this.getLevelDisplayName(level)}`,
      { modal: false }
    );

    return level;
  }

  /**
   * Step 3: Feature Tour (3 slides)
   */
  private async showFeatureTour(): Promise<boolean> {
    const slides = [
      {
        title: '📊 Real-Time Tracking',
        message:
          'CodePause tracks your AI usage in the background:\n\n' +
          '• AI % - Balance of AI vs manual code\n' +
          '• Review Quality - How thoroughly you review (0-100)\n' +
          '• Balance Score - Overall health indicator\n\n' +
          'Check your status bar anytime →'
      },
      {
        title: '🌍 Multi-Language Support',
        message:
          'Works with 15+ programming languages:\n\n' +
          '• Rust, C++, Java, TypeScript, Python...\n' +
          '• Complexity-aware review times\n' +
          '• Based on empirical research\n\n' +
          'Automatically adjusts expectations by language'
      },
      {
        title: '🔒 Privacy First',
        message:
          '100% local, zero cloud tracking:\n\n' +
          '• All data stored locally (SQLite)\n' +
          '• No code content stored - only metadata\n' +
          '• No telemetry to our servers\n' +
          '• You own your data completely'
      }
    ];

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const isLast = i === slides.length - 1;

      const action = await vscode.window.showInformationMessage(
        `${slide.title}\n\n${slide.message}`,
        { modal: true },
        {
          title: isLast ? 'Finish Tour' : 'Next',
          isCloseAffordance: false
        } as vscode.MessageItem,
        {
          title: 'Skip Tour',
          isCloseAffordance: true
        } as vscode.MessageItem
      );

      if (action?.title === 'Skip Tour' || !action) {
        return false;
      }
    }

    return true;
  }

  /**
   * Step 4: Dashboard Preview
   */
  private async showDashboardPreview(): Promise<void> {
    const action = await vscode.window.showInformationMessage(
      '🎯 Ready to Start!\n\n' +
      'Your dashboard is ready. Check it anytime:\n' +
      '• Click CodePause icon in activity bar\n' +
      '• Or: Ctrl+Shift+P → "CodePause: Dashboard"\n\n' +
      'CodePause will now run silently in the background.',
      { modal: true },
      'Open Dashboard',
      'Start Coding'
    );

    if (action === 'Open Dashboard') {
      // Wait a moment for the modal to close
      setTimeout(() => {
        vscode.commands.executeCommand('codePause.openDashboard').then(
          () => {
            // Dashboard opened successfully
          },
          (error) => {
            console.error('[CodePause] Failed to open dashboard:', error);
          }
        );
      }, 500);
    }
  }

  /**
   * Mark onboarding as completed
   */
  private async complete(): Promise<void> {
    await this.context.globalState.update('onboarding.completed', true);
    await this.context.globalState.update('onboarding.completedAt', Date.now());
    await this.context.globalState.update('onboarding.skipped', false);

    // Show brief completion message
    vscode.window.showInformationMessage(
      '✅ Setup complete! CodePause is now tracking in the background.',
      'Got it'
    );

    console.log('[CodePause] Onboarding completed successfully');
  }

  /**
   * Skip onboarding
   */
  private async skip(): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      'Skip setup?\n\n' +
      'You can restart it later with:\n' +
      'Ctrl+Shift+P → "CodePause: Start Onboarding"',
      { modal: true },
      'Yes, Skip',
      'Go Back'
    );

    if (confirm === 'Yes, Skip') {
      // Mark as skipped (not completed, so we can prompt again if manually restarted)
      await this.context.globalState.update('onboarding.skipped', true);
      await this.context.globalState.update('onboarding.skippedAt', Date.now());

      console.log('[CodePause] Onboarding skipped');

      vscode.window.showInformationMessage(
        'Onboarding skipped. Restart anytime from the command palette.',
        'Got it'
      );
    } else {
      // User wants to go back - restart onboarding
      await this.start();
    }
  }

  /**
   * Reset onboarding (for testing or user-requested restart)
   */
  async reset(): Promise<void> {
    await this.context.globalState.update('onboarding.completed', false);
    await this.context.globalState.update('onboarding.skipped', false);
    await this.context.globalState.update('onboarding.completedAt', undefined);
    await this.context.globalState.update('onboarding.skippedAt', undefined);

    console.log('[CodePause] Onboarding reset');
  }

  /**
   * Get display name for experience level
   */
  private getLevelDisplayName(level: DeveloperLevel): string {
    switch (level) {
      case DeveloperLevel.Junior:
        return 'Junior Developer';
      case DeveloperLevel.Mid:
        return 'Mid-Level Developer';
      case DeveloperLevel.Senior:
        return 'Senior Developer';
      default:
        return level;
    }
  }

  /**
   * Check if onboarding was completed
   */
  async isCompleted(): Promise<boolean> {
    return this.context.globalState.get<boolean>('onboarding.completed', false);
  }

  /**
   * Check if onboarding was skipped
   */
  async wasSkipped(): Promise<boolean> {
    return this.context.globalState.get<boolean>('onboarding.skipped', false);
  }

  /**
   * Get onboarding completion timestamp
   */
  async getCompletionTimestamp(): Promise<number | undefined> {
    return this.context.globalState.get<number>('onboarding.completedAt');
  }
}
