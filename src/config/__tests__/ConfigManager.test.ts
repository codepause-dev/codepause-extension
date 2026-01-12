/**
 * ConfigManager Tests
 * Comprehensive tests for configuration management
 */

// Mock vscode module BEFORE imports
jest.mock('vscode', () => ({
  workspace: {
    getConfiguration: jest.fn(() => ({
      get: jest.fn(),
      update: jest.fn(),
    })),
    onDidChangeConfiguration: jest.fn((callback) => {
      // Store callback for later invocation
      (global as any).__vscodeConfigChangeCallback = callback;
      return { dispose: jest.fn() };
    }),
  },
}), { virtual: true });

jest.mock('../../storage/ConfigRepository');

import { ConfigManager } from '../ConfigManager';
import { ConfigRepository } from '../../storage/ConfigRepository';
import {
  UserConfig,
  DeveloperLevel,
  AlertFrequency,
  DEFAULT_THRESHOLDS
} from '../../types';
import * as vscode from 'vscode';

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let mockConfigRepo: jest.Mocked<ConfigRepository>;
  let mockVSCodeConfig: any;

  const mockUserConfig: UserConfig = {
    experienceLevel: DeveloperLevel.Mid,
    blindApprovalThreshold: 2000,
    alertFrequency: AlertFrequency.Medium,
    enableGamification: true,
    anonymizePaths: true,
    trackedTools: {
      copilot: true,
      cursor: true,
      claudeCode: true,
    },
    onboardingCompleted: false,
  };

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Mock VSCode configuration
    mockVSCodeConfig = {
      get: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };

    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockVSCodeConfig);

    // Mock ConfigRepository
    mockConfigRepo = new ConfigRepository(null as any) as jest.Mocked<ConfigRepository>;
    mockConfigRepo.getUserConfig = jest.fn().mockResolvedValue(mockUserConfig);
    mockConfigRepo.updateConfig = jest.fn().mockResolvedValue(mockUserConfig);
    mockConfigRepo.setExperienceLevel = jest.fn().mockResolvedValue(undefined);
    mockConfigRepo.saveUserConfig = jest.fn().mockResolvedValue(undefined);
    mockConfigRepo.completeOnboarding = jest.fn().mockResolvedValue(undefined);
    mockConfigRepo.isOnboardingCompleted = jest.fn().mockResolvedValue(false);

    configManager = new ConfigManager(mockConfigRepo);
  });

  describe('Initialization', () => {
    it('should initialize and load config from database', async () => {
      await configManager.initialize();

      expect(mockConfigRepo.getUserConfig).toHaveBeenCalled();
      expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled();
    });

    it('should sync with VSCode settings on initialization', async () => {
      mockVSCodeConfig.get.mockImplementation((key: string) => {
        const settings: any = {
          experienceLevel: DeveloperLevel.Senior,
          blindApprovalThreshold: 1500,
        };
        return settings[key];
      });

      await configManager.initialize();

      expect(mockConfigRepo.updateConfig).toHaveBeenCalled();
    });

    it('should throw error when getting config before initialization', () => {
      expect(() => configManager.getConfig()).toThrow('ConfigManager not initialized');
    });
  });

  describe('Configuration Retrieval', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should return a copy of the config', () => {
      const config1 = configManager.getConfig();
      const config2 = configManager.getConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Should be different objects
    });

    it('should get experience level', () => {
      const level = configManager.getExperienceLevel();
      expect(level).toBe(DeveloperLevel.Mid);
    });

    it('should get blind approval threshold', () => {
      const threshold = configManager.getBlindApprovalThreshold();
      expect(threshold).toBe(2000);
    });

    it('should get alert frequency', () => {
      const frequency = configManager.getAlertFrequency();
      expect(frequency).toBe(AlertFrequency.Medium);
    });

    it('should check if gamification is enabled', () => {
      const enabled = configManager.isGamificationEnabled();
      expect(enabled).toBe(true);
    });

    it('should check if paths should be anonymized', () => {
      const anonymize = configManager.shouldAnonymizePaths();
      expect(anonymize).toBe(true);
    });

    it('should check if tool is tracked', () => {
      expect(configManager.isToolTracked('copilot')).toBe(true);
      expect(configManager.isToolTracked('cursor')).toBe(true);
      expect(configManager.isToolTracked('claudeCode')).toBe(true);
    });

    it('should check onboarding completion status', async () => {
      const completed = await configManager.isOnboardingCompleted();
      expect(completed).toBe(false);
    });
  });

  describe('Configuration Updates', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should update config and sync to VSCode', async () => {
      const updates = { blindApprovalThreshold: 1500 };
      await configManager.updateConfig(updates);

      expect(mockConfigRepo.updateConfig).toHaveBeenCalledWith(updates);
      expect(mockVSCodeConfig.update).toHaveBeenCalledWith('blindApprovalThreshold', 1500, true);
    });

    it('should set experience level', async () => {
      const newLevel = DeveloperLevel.Senior;
      await configManager.setExperienceLevel(newLevel);

      expect(mockConfigRepo.setExperienceLevel).toHaveBeenCalledWith(newLevel);
      expect(mockConfigRepo.getUserConfig).toHaveBeenCalled();
      expect(mockVSCodeConfig.update).toHaveBeenCalledWith('experienceLevel', newLevel, true);
    });

    it('should set blind approval threshold', async () => {
      await configManager.setBlindApprovalThreshold(1500);

      expect(mockConfigRepo.updateConfig).toHaveBeenCalledWith({ blindApprovalThreshold: 1500 });
    });

    it('should set alert frequency', async () => {
      await configManager.setAlertFrequency(AlertFrequency.High);

      expect(mockConfigRepo.updateConfig).toHaveBeenCalledWith({ alertFrequency: AlertFrequency.High });
    });

    it('should toggle gamification', async () => {
      await configManager.toggleGamification(false);

      expect(mockConfigRepo.updateConfig).toHaveBeenCalledWith({ enableGamification: false });
    });
  });

  describe('Threshold Configuration', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should get threshold config based on experience level', () => {
      const thresholdConfig = configManager.getThresholdConfig();

      expect(thresholdConfig.level).toBe(DeveloperLevel.Mid);
      expect(thresholdConfig.blindApprovalTime).toBe(2000);
      expect(thresholdConfig.maxAIPercentage).toBe(DEFAULT_THRESHOLDS[DeveloperLevel.Mid].maxAIPercentage);
      expect(thresholdConfig.minReviewTime).toBe(DEFAULT_THRESHOLDS[DeveloperLevel.Mid].minReviewTime);
    });

    it('should get custom thresholds', () => {
      const customThresholds = configManager.getCustomThresholds();
      expect(customThresholds).toEqual({});
    });

    it('should set custom thresholds', async () => {
      const thresholds = {
        aiPercentageMax: 75,
        acceptanceRateMin: 85,
        reviewTimeMin: 1500,
      };

      await configManager.setCustomThresholds(thresholds);

      expect(mockConfigRepo.updateConfig).toHaveBeenCalledWith({
        customThresholds: thresholds,
      });
    });

    it('should merge custom thresholds when setting', async () => {
      // Set up config with existing custom thresholds
      const configWithThresholds: UserConfig = {
        ...mockUserConfig,
        customThresholds: {
          aiPercentageMax: 70,
        },
      };
      mockConfigRepo.getUserConfig.mockResolvedValue(configWithThresholds);
      await configManager.initialize();

      await configManager.setCustomThresholds({ reviewTimeMin: 1500 });

      expect(mockConfigRepo.updateConfig).toHaveBeenCalledWith({
        customThresholds: {
          aiPercentageMax: 70,
          reviewTimeMin: 1500,
        },
      });
    });
  });

  describe('Onboarding', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should complete onboarding', async () => {
      await configManager.completeOnboarding();

      expect(mockConfigRepo.completeOnboarding).toHaveBeenCalled();
      expect(mockConfigRepo.getUserConfig).toHaveBeenCalled();
    });
  });

  describe('Import/Export', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should export config', () => {
      const exported = configManager.exportConfig();

      expect(exported).toEqual(mockUserConfig);
      expect(exported).not.toBe(mockUserConfig); // Should be a copy
    });

    it('should import config', async () => {
      const newConfig: UserConfig = {
        experienceLevel: DeveloperLevel.Senior,
        blindApprovalThreshold: 1000,
        alertFrequency: AlertFrequency.Low,
        enableGamification: false,
        anonymizePaths: false,
        trackedTools: {
          copilot: false,
          cursor: true,
          claudeCode: true,
        },
        onboardingCompleted: true,
      };

      await configManager.importConfig(newConfig);

      expect(mockConfigRepo.saveUserConfig).toHaveBeenCalledWith(newConfig);
      // Should sync all settings to VSCode
      expect(mockVSCodeConfig.update).toHaveBeenCalledWith('experienceLevel', DeveloperLevel.Senior, true);
      expect(mockVSCodeConfig.update).toHaveBeenCalledWith('blindApprovalThreshold', 1000, true);
      expect(mockVSCodeConfig.update).toHaveBeenCalledWith('alertFrequency', AlertFrequency.Low, true);
      expect(mockVSCodeConfig.update).toHaveBeenCalledWith('enableGamification', false, true);
      expect(mockVSCodeConfig.update).toHaveBeenCalledWith('anonymizePaths', false, true);
      expect(mockVSCodeConfig.update).toHaveBeenCalledWith('trackedTools', newConfig.trackedTools, true);
    });
  });

  describe('Reset to Defaults', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should reset config to defaults', async () => {
      await configManager.resetToDefaults();

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
        onboardingCompleted: false, // Should preserve onboarding status
      };

      expect(mockConfigRepo.saveUserConfig).toHaveBeenCalledWith(defaultConfig);
    });

    it('should preserve onboarding status when resetting', async () => {
      // Set up completed onboarding
      const completedConfig: UserConfig = { ...mockUserConfig, onboardingCompleted: true };
      mockConfigRepo.getUserConfig.mockResolvedValue(completedConfig);
      mockConfigRepo.isOnboardingCompleted.mockResolvedValue(true); // Mock onboarding as completed
      await configManager.initialize();

      await configManager.resetToDefaults();

      const savedConfig = (mockConfigRepo.saveUserConfig as jest.Mock).mock.calls[0][0];
      expect(savedConfig.onboardingCompleted).toBe(true);
    });
  });

  describe('VSCode Settings Synchronization', () => {
    it('should sync settings from VSCode to config on initialization', async () => {
      mockVSCodeConfig.get.mockImplementation((key: string) => {
        const settings: any = {
          experienceLevel: DeveloperLevel.Senior,
          blindApprovalThreshold: 1500,
          alertFrequency: AlertFrequency.High,
          enableGamification: false,
          anonymizePaths: false,
          trackedTools: {
            copilot: false,
            cursor: true,
            claudeCode: true,
          },
        };
        return settings[key];
      });

      await configManager.initialize();

      expect(mockConfigRepo.updateConfig).toHaveBeenCalledWith({
        experienceLevel: DeveloperLevel.Senior,
        blindApprovalThreshold: 1500,
        alertFrequency: AlertFrequency.High,
        enableGamification: false,
        anonymizePaths: false,
        trackedTools: {
          copilot: false,
          cursor: true,
          claudeCode: true,
        },
      });
    });

    it('should only sync settings that changed', async () => {
      mockVSCodeConfig.get.mockImplementation((key: string) => {
        if (key === 'experienceLevel') {
          return DeveloperLevel.Senior; // Changed
        }
        return undefined; // All others unchanged
      });

      await configManager.initialize();

      const updateCall = (mockConfigRepo.updateConfig as jest.Mock).mock.calls[0];
      if (updateCall) {
        expect(updateCall[0]).toHaveProperty('experienceLevel', DeveloperLevel.Senior);
        expect(Object.keys(updateCall[0])).toEqual(['experienceLevel']);
      }
    });

    it('should listen for VSCode configuration changes', async () => {
      await configManager.initialize();

      expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled();

      // Simulate configuration change
      const callback = (vscode.workspace.onDidChangeConfiguration as jest.Mock).mock.calls[0][0];
      const event = {
        affectsConfiguration: jest.fn((section: string) => section === 'codePause'),
      };

      mockVSCodeConfig.get.mockImplementation((key: string) => {
        if (key === 'blindApprovalThreshold') {
          return 1800;
        }
        return undefined;
      });

      await callback(event);

      expect(event.affectsConfiguration).toHaveBeenCalledWith('codePause');
      expect(mockConfigRepo.updateConfig).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing custom thresholds', async () => {
      await configManager.initialize();

      const thresholds = configManager.getCustomThresholds();
      expect(thresholds).toEqual({});
    });

    it('should handle tool tracking for all supported tools', async () => {
      await configManager.initialize();

      expect(configManager.isToolTracked('copilot')).toBe(true);
      expect(configManager.isToolTracked('cursor')).toBe(true);
      expect(configManager.isToolTracked('claudeCode')).toBe(true);
    });

    it('should handle disabled tool tracking', async () => {
      const configWithDisabledTools: UserConfig = {
        ...mockUserConfig,
        trackedTools: {
          copilot: false,
          cursor: false,
          claudeCode: false,
        },
      };
      mockConfigRepo.getUserConfig.mockResolvedValue(configWithDisabledTools);
      await configManager.initialize();

      expect(configManager.isToolTracked('copilot')).toBe(false);
      expect(configManager.isToolTracked('cursor')).toBe(false);
      expect(configManager.isToolTracked('claudeCode')).toBe(false);
    });

    it('should handle threshold config with custom thresholds', async () => {
      const configWithCustomThresholds: UserConfig = {
        ...mockUserConfig,
        customThresholds: {
          aiPercentageMax: 65,
          reviewTimeMin: 1200,
        },
      };
      mockConfigRepo.getUserConfig.mockResolvedValue(configWithCustomThresholds);
      await configManager.initialize();

      const thresholdConfig = configManager.getThresholdConfig();
      expect(thresholdConfig.maxAIPercentage).toBe(65);
      expect(thresholdConfig.minReviewTime).toBe(1200);
    });
  });

  describe('Different Experience Levels', () => {
    it('should handle junior developer configuration', async () => {
      const juniorConfig: UserConfig = {
        ...mockUserConfig,
        experienceLevel: DeveloperLevel.Junior,
        blindApprovalThreshold: DEFAULT_THRESHOLDS[DeveloperLevel.Junior].blindApprovalTime,
      };
      mockConfigRepo.getUserConfig.mockResolvedValue(juniorConfig);
      await configManager.initialize();

      const thresholdConfig = configManager.getThresholdConfig();
      expect(thresholdConfig.level).toBe(DeveloperLevel.Junior);
      expect(thresholdConfig.maxAIPercentage).toBe(DEFAULT_THRESHOLDS[DeveloperLevel.Junior].maxAIPercentage);
    });

    it('should handle senior developer configuration', async () => {
      const seniorConfig: UserConfig = {
        ...mockUserConfig,
        experienceLevel: DeveloperLevel.Senior,
        blindApprovalThreshold: DEFAULT_THRESHOLDS[DeveloperLevel.Senior].blindApprovalTime,
      };
      mockConfigRepo.getUserConfig.mockResolvedValue(seniorConfig);
      await configManager.initialize();

      const thresholdConfig = configManager.getThresholdConfig();
      expect(thresholdConfig.level).toBe(DeveloperLevel.Senior);
      expect(thresholdConfig.maxAIPercentage).toBe(DEFAULT_THRESHOLDS[DeveloperLevel.Senior].maxAIPercentage);
    });
  });

  describe('Alert Frequencies', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should handle low alert frequency', async () => {
      await configManager.setAlertFrequency(AlertFrequency.Low);
      expect(mockConfigRepo.updateConfig).toHaveBeenCalledWith({ alertFrequency: AlertFrequency.Low });
    });

    it('should handle medium alert frequency', async () => {
      await configManager.setAlertFrequency(AlertFrequency.Medium);
      expect(mockConfigRepo.updateConfig).toHaveBeenCalledWith({ alertFrequency: AlertFrequency.Medium });
    });

    it('should handle high alert frequency', async () => {
      await configManager.setAlertFrequency(AlertFrequency.High);
      expect(mockConfigRepo.updateConfig).toHaveBeenCalledWith({ alertFrequency: AlertFrequency.High });
    });
  });
});
