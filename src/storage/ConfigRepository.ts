/**
 * ConfigRepository
 * High-level repository for configuration operations
 */

import * as vscode from 'vscode';
import { DatabaseManager } from './DatabaseManager';
import {
  UserConfig,
  Achievement,
  SnoozeState,
  AlertHistory,
  DeveloperLevel,
  AlertFrequency,
  AlertType,
  DEFAULT_THRESHOLDS
} from '../types';

export class ConfigRepository {
  private static readonly CONFIG_KEY = 'user_config';
  private static readonly GLOBAL_ONBOARDING_KEY = 'codePause.onboardingCompleted';

  constructor(
    private db: DatabaseManager,
    private globalState?: vscode.Memento
  ) {}

  async getUserConfig(): Promise<UserConfig> {
    const config = await this.db.getConfig(ConfigRepository.CONFIG_KEY);

    if (!config) {
      const defaultConfig = this.getDefaultConfig();
      // Check global state for onboarding status
      if (this.globalState) {
        const globalOnboarding = this.globalState.get<boolean>(ConfigRepository.GLOBAL_ONBOARDING_KEY, false);
        defaultConfig.onboardingCompleted = globalOnboarding;
      }
      return defaultConfig;
    }

    const userConfig = config as UserConfig;

    // Migrate workspace onboarding to globalState if needed
    if (this.globalState && userConfig.onboardingCompleted) {
      const globalOnboarding = this.globalState.get<boolean>(ConfigRepository.GLOBAL_ONBOARDING_KEY, false);
      if (!globalOnboarding) {
        await this.globalState.update(ConfigRepository.GLOBAL_ONBOARDING_KEY, true);
      }
    }

    // Always check global state for onboarding status (overrides workspace setting)
    if (this.globalState) {
      const globalOnboarding = this.globalState.get<boolean>(ConfigRepository.GLOBAL_ONBOARDING_KEY, false);
      userConfig.onboardingCompleted = globalOnboarding;
    }

    return userConfig;
  }

  async saveUserConfig(config: UserConfig): Promise<void> {
    await this.db.setConfig(ConfigRepository.CONFIG_KEY, config);
  }

  async updateConfig(updates: Partial<UserConfig>): Promise<UserConfig> {
    const currentConfig = await this.getUserConfig();
    const updatedConfig = { ...currentConfig, ...updates };
    await this.saveUserConfig(updatedConfig);
    return updatedConfig;
  }

  private getDefaultConfig(): UserConfig {
    return {
      experienceLevel: DeveloperLevel.Mid,
      blindApprovalThreshold: DEFAULT_THRESHOLDS[DeveloperLevel.Mid].blindApprovalTime,
      alertFrequency: AlertFrequency.Medium,
      enableGamification: false, // Disabled by default
      anonymizePaths: true,
      trackedTools: {
        copilot: true,  // Enabled by default - track most of AI tools
        cursor: true,   // Enabled by default - track most of AI tools
        claudeCode: true // Enabled by default - track most of AI tools
      },
      onboardingCompleted: false
    };
  }

  async setExperienceLevel(level: DeveloperLevel): Promise<void> {
    const thresholds = DEFAULT_THRESHOLDS[level];

    await this.updateConfig({
      experienceLevel: level,
      blindApprovalThreshold: thresholds.blindApprovalTime,
      customThresholds: {
        aiPercentageMax: thresholds.maxAIPercentage,
        reviewTimeMin: thresholds.minReviewTime
      }
    });
  }

  async completeOnboarding(): Promise<void> {
    // Save to global state for user-level persistence
    if (this.globalState) {
      await this.globalState.update(ConfigRepository.GLOBAL_ONBOARDING_KEY, true);
    }
    // Also update workspace config for backwards compatibility
    await this.updateConfig({ onboardingCompleted: true });
  }

  async isOnboardingCompleted(): Promise<boolean> {
    // Check global state first (user-level)
    if (this.globalState) {
      return this.globalState.get<boolean>(ConfigRepository.GLOBAL_ONBOARDING_KEY, false);
    }
    // Fallback to workspace config
    const config = await this.getUserConfig();
    return config.onboardingCompleted;
  }

  async getAllAchievements(): Promise<Achievement[]> {
    const records = await this.db.getAllAchievements();

    // Merge with achievement definitions
    const achievements = this.getAchievementDefinitions();

    return achievements.map(definition => {
      const record = records.find(r => r.id === definition.id);

      return {
        ...definition,
        unlocked: record?.unlocked ?? false,
        unlockedAt: record?.unlockedAt,
        progress: record?.progress ?? 0
      };
    });
  }

  async updateAchievementProgress(
    achievementId: string,
    progress: number,
    unlocked: boolean = false
  ): Promise<void> {
    await this.db.updateAchievement(achievementId, unlocked, progress);
  }

  async unlockAchievement(achievementId: string): Promise<void> {
    await this.db.updateAchievement(achievementId, true, 100);
  }

  async getUnlockedCount(): Promise<number> {
    const achievements = await this.getAllAchievements();
    return achievements.filter(a => a.unlocked).length;
  }

  async getSnoozeState(): Promise<SnoozeState> {
    return await this.db.getSnoozeState();
  }

  async setSnoozeState(state: SnoozeState): Promise<void> {
    await this.db.setSnoozeState(state);
  }

  async snoozeUntilEndOfDay(reason?: string): Promise<void> {
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    await this.setSnoozeState({
      snoozed: true,
      snoozeUntil: endOfDay.getTime(),
      snoozeReason: reason
    });
  }

  async clearSnooze(): Promise<void> {
    await this.setSnoozeState({ snoozed: false });
  }

  async isSnoozed(): Promise<boolean> {
    const state = await this.getSnoozeState();

    if (!state.snoozed) {return false;}

    // Check if snooze has expired
    if (state.snoozeUntil && Date.now() > state.snoozeUntil) {
      await this.clearSnooze();
      return false;
    }

    return true;
  }

  async getAlertHistory(alertType: AlertType): Promise<AlertHistory | null> {
    return await this.db.getAlertHistory(alertType);
  }

  async recordAlertShown(alertType: AlertType): Promise<void> {
    await this.db.updateAlertHistory(alertType, Date.now());
  }

  async canShowAlert(alertType: AlertType, rateLimitMs: number): Promise<boolean> {
    // Achievements always show
    if (alertType === AlertType.Achievement) {return true;}

    // Check snooze state
    if (await this.isSnoozed()) {return false;}

    const history = await this.getAlertHistory(alertType);

    if (!history) {return true;}

    const timeSinceLastShown = Date.now() - history.lastShown;
    return timeSinceLastShown >= rateLimitMs;
  }

  private getAchievementDefinitions(): Achievement[] {
    return [
      // Review Achievements
      {
        id: 'first-steps',
        title: 'First Steps',
        description: 'Reviewed your first AI suggestion',
        category: 'review',
        icon: '👣',
        requirement: {
          type: 'count',
          metric: 'reviews',
          target: 1,
          timeframe: 'all-time'
        },
        unlocked: false,
        progress: 0
      },
      {
        id: 'careful-reviewer',
        title: 'Careful Reviewer',
        description: 'Maintained average review time > 5s for a day',
        category: 'review',
        icon: '🔍',
        requirement: {
          type: 'threshold',
          metric: 'average-review-time',
          target: 5000,
          timeframe: 'day'
        },
        unlocked: false,
        progress: 0
      },
      {
        id: 'thoughtful-developer',
        title: 'Thoughtful Developer',
        description: 'Zero blind approvals for an entire day',
        category: 'review',
        icon: '💭',
        requirement: {
          type: 'count',
          metric: 'blind-approvals',
          target: 0,
          timeframe: 'day'
        },
        unlocked: false,
        progress: 0
      },

      // Balance Achievements
      {
        id: 'balanced-coder',
        title: 'Balanced Coder',
        description: 'Maintained 40-60% AI code for a week',
        category: 'balance',
        icon: '⚖️',
        requirement: {
          type: 'percentage',
          metric: 'ai-percentage',
          target: 50,
          timeframe: 'week'
        },
        unlocked: false,
        progress: 0
      },
      {
        id: 'independent-thinker',
        title: 'Independent Thinker',
        description: 'Kept AI usage under 40% for a week',
        category: 'balance',
        icon: '🧠',
        requirement: {
          type: 'percentage',
          metric: 'ai-percentage',
          target: 40,
          timeframe: 'week'
        },
        unlocked: false,
        progress: 0
      },

      // Consistency Achievements
      {
        id: 'week-warrior',
        title: 'Week Warrior',
        description: 'Coded for 7 consecutive days',
        category: 'consistency',
        icon: '📅',
        requirement: {
          type: 'streak',
          metric: 'daily-sessions',
          target: 7,
          timeframe: 'week'
        },
        unlocked: false,
        progress: 0
      },
      {
        id: 'century-club',
        title: 'Century Club',
        description: 'Reviewed 100 AI suggestions',
        category: 'consistency',
        icon: '💯',
        requirement: {
          type: 'count',
          metric: 'reviews',
          target: 100,
          timeframe: 'all-time'
        },
        unlocked: false,
        progress: 0
      },

      // Learning Achievements
      {
        id: 'quality-over-quantity',
        title: 'Quality Over Quantity',
        description: 'Rejected 50% or more suggestions for better code quality',
        category: 'learning',
        icon: '✨',
        requirement: {
          type: 'percentage',
          metric: 'rejection-rate',
          target: 50,
          timeframe: 'week'
        },
        unlocked: false,
        progress: 0
      },
      {
        id: 'mindful-master',
        title: 'Mindful Master',
        description: 'Reached level 5',
        category: 'learning',
        icon: '🎓',
        requirement: {
          type: 'threshold',
          metric: 'level',
          target: 5,
          timeframe: 'all-time'
        },
        unlocked: false,
        progress: 0
      }
    ];
  }
}
