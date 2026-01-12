/**
 * ConfigManager
 * Unified configuration management for CodePause
 */

import * as vscode from 'vscode';
import { ConfigRepository } from '../storage/ConfigRepository';
import {
  UserConfig,
  DeveloperLevel,
  AlertFrequency,
  ThresholdConfig,
  DEFAULT_THRESHOLDS
} from '../types';

export class ConfigManager {
  private config: UserConfig | null = null;
  private readonly configSection = 'codePause';

  constructor(private configRepo: ConfigRepository) {}

  async initialize(): Promise<void> {
    // Load config from database
    this.config = await this.configRepo.getUserConfig();

    // Sync with VSCode settings
    await this.syncWithVSCodeSettings();

    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration(this.configSection)) {
        await this.syncWithVSCodeSettings();
      }
    });
  }

  getConfig(): UserConfig {
    if (!this.config) {
      throw new Error('ConfigManager not initialized');
    }
    return { ...this.config };
  }

  async updateConfig(updates: Partial<UserConfig>): Promise<void> {
    this.config = await this.configRepo.updateConfig(updates);

    // Sync to VSCode settings
    await this.updateVSCodeSettings(updates);
  }

  getExperienceLevel(): DeveloperLevel {
    return this.getConfig().experienceLevel;
  }

  async setExperienceLevel(level: DeveloperLevel): Promise<void> {
    await this.configRepo.setExperienceLevel(level);
    this.config = await this.configRepo.getUserConfig();

    // Update VSCode setting
    await this.setVSCodeConfig('experienceLevel', level);
  }

  getBlindApprovalThreshold(): number {
    return this.getConfig().blindApprovalThreshold;
  }

  async setBlindApprovalThreshold(threshold: number): Promise<void> {
    await this.updateConfig({ blindApprovalThreshold: threshold });
  }

  getAlertFrequency(): AlertFrequency {
    return this.getConfig().alertFrequency;
  }

  async setAlertFrequency(frequency: AlertFrequency): Promise<void> {
    await this.updateConfig({ alertFrequency: frequency });
  }

  isGamificationEnabled(): boolean {
    return this.getConfig().enableGamification;
  }

  async toggleGamification(enabled: boolean): Promise<void> {
    await this.updateConfig({ enableGamification: enabled });
  }

  shouldAnonymizePaths(): boolean {
    return this.getConfig().anonymizePaths;
  }

  isToolTracked(tool: 'copilot' | 'cursor' | 'claudeCode'): boolean {
    return this.getConfig().trackedTools[tool];
  }

  getThresholdConfig(): ThresholdConfig {
    const level = this.getExperienceLevel();
    const defaults = DEFAULT_THRESHOLDS[level];
    const config = this.getConfig();

    return {
      level,
      blindApprovalTime: config.blindApprovalThreshold,
      maxAIPercentage: config.customThresholds?.aiPercentageMax ?? defaults.maxAIPercentage,
      minReviewTime: config.customThresholds?.reviewTimeMin ?? defaults.minReviewTime,
      streakThreshold: defaults.streakThreshold
    };
  }

  getCustomThresholds(): {
    aiPercentageMax?: number;
    acceptanceRateMin?: number;
    reviewTimeMin?: number;
  } {
    return this.getConfig().customThresholds ?? {};
  }

  async setCustomThresholds(thresholds: {
    aiPercentageMax?: number;
    acceptanceRateMin?: number;
    reviewTimeMin?: number;
  }): Promise<void> {
    const currentThresholds = this.getCustomThresholds();
    await this.updateConfig({
      customThresholds: { ...currentThresholds, ...thresholds }
    });
  }

  async completeOnboarding(): Promise<void> {
    await this.configRepo.completeOnboarding();
    this.config = await this.configRepo.getUserConfig();
  }

  async isOnboardingCompleted(): Promise<boolean> {
    // Check globalState via repository (not cached config)
    return await this.configRepo.isOnboardingCompleted();
  }

  exportConfig(): UserConfig {
    return this.getConfig();
  }

  async importConfig(config: UserConfig): Promise<void> {
    await this.configRepo.saveUserConfig(config);
    this.config = config;
    await this.syncToVSCodeSettings();
  }

  async resetToDefaults(): Promise<void> {
    // Preserve onboarding status from globalState
    const onboardingCompleted = await this.isOnboardingCompleted();

    const defaultConfig: UserConfig = {
      experienceLevel: DeveloperLevel.Mid,
      blindApprovalThreshold: DEFAULT_THRESHOLDS[DeveloperLevel.Mid].blindApprovalTime,
      alertFrequency: AlertFrequency.Medium,
      enableGamification: false, // Disabled by default
      anonymizePaths: true,
      trackedTools: {
        copilot: false, // Disabled by default
        cursor: false,  // Disabled by default
        claudeCode: true // Only Claude Code enabled by default
      },
      onboardingCompleted: onboardingCompleted
    };

    await this.importConfig(defaultConfig);
  }

  private async syncWithVSCodeSettings(): Promise<void> {
    const vscodeConfig = vscode.workspace.getConfiguration(this.configSection);

    const updates: Partial<UserConfig> = {};

    // Experience level
    const experienceLevel = vscodeConfig.get<DeveloperLevel>('experienceLevel');
    if (experienceLevel && experienceLevel !== this.config?.experienceLevel) {
      updates.experienceLevel = experienceLevel;
    }

    // Blind approval threshold
    const threshold = vscodeConfig.get<number>('blindApprovalThreshold');
    if (threshold !== undefined && threshold !== this.config?.blindApprovalThreshold) {
      updates.blindApprovalThreshold = threshold;
    }

    // Alert frequency
    const alertFrequency = vscodeConfig.get<AlertFrequency>('alertFrequency');
    if (alertFrequency && alertFrequency !== this.config?.alertFrequency) {
      updates.alertFrequency = alertFrequency;
    }

    // Gamification
    const enableGamification = vscodeConfig.get<boolean>('enableGamification');
    if (enableGamification !== undefined && enableGamification !== this.config?.enableGamification) {
      updates.enableGamification = enableGamification;
    }

    // Anonymize paths
    const anonymizePaths = vscodeConfig.get<boolean>('anonymizePaths');
    if (anonymizePaths !== undefined && anonymizePaths !== this.config?.anonymizePaths) {
      updates.anonymizePaths = anonymizePaths;
    }

    // Tracked tools
    const trackedTools = vscodeConfig.get<{
      copilot: boolean;
      cursor: boolean;
      claudeCode: boolean;
    }>('trackedTools');
    if (trackedTools) {
      updates.trackedTools = trackedTools;
    }

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      this.config = await this.configRepo.updateConfig(updates);
    }
  }

  private async updateVSCodeSettings(updates: Partial<UserConfig>): Promise<void> {
    const vscodeConfig = vscode.workspace.getConfiguration(this.configSection);

    if (updates.experienceLevel !== undefined) {
      await vscodeConfig.update('experienceLevel', updates.experienceLevel, true);
    }

    if (updates.blindApprovalThreshold !== undefined) {
      await vscodeConfig.update('blindApprovalThreshold', updates.blindApprovalThreshold, true);
    }

    if (updates.alertFrequency !== undefined) {
      await vscodeConfig.update('alertFrequency', updates.alertFrequency, true);
    }

    if (updates.enableGamification !== undefined) {
      await vscodeConfig.update('enableGamification', updates.enableGamification, true);
    }

    if (updates.anonymizePaths !== undefined) {
      await vscodeConfig.update('anonymizePaths', updates.anonymizePaths, true);
    }

    if (updates.trackedTools !== undefined) {
      await vscodeConfig.update('trackedTools', updates.trackedTools, true);
    }
  }

  private async syncToVSCodeSettings(): Promise<void> {
    const config = this.getConfig();
    await this.updateVSCodeSettings(config);
  }

  private async setVSCodeConfig(key: string, value: unknown): Promise<void> {
    const vscodeConfig = vscode.workspace.getConfiguration(this.configSection);
    await vscodeConfig.update(key, value, true);
  }
}
