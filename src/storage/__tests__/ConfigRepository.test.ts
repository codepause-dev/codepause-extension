/**
 * ConfigRepository Tests
 * Tests for configuration repository operations
 */

jest.mock('../DatabaseManager');

import { ConfigRepository } from '../ConfigRepository';
import { DatabaseManager } from '../DatabaseManager';
import { UserConfig, DeveloperLevel, AlertFrequency, AlertType } from '../../types';

describe('ConfigRepository', () => {
  let configRepo: ConfigRepository;
  let mockDb: jest.Mocked<DatabaseManager>;

  const mockConfig: UserConfig = {
    experienceLevel: DeveloperLevel.Mid,
    blindApprovalThreshold: 2000,
    alertFrequency: AlertFrequency.Medium,
    enableGamification: true,
    anonymizePaths: true,
    trackedTools: { copilot: true, cursor: true, claudeCode: true },
    onboardingCompleted: false,
  };

  beforeEach(() => {
    mockDb = new DatabaseManager('') as jest.Mocked<DatabaseManager>;
    mockDb.getConfig = jest.fn().mockResolvedValue(mockConfig);
    mockDb.setConfig = jest.fn().mockResolvedValue(undefined);
    mockDb.getAllAchievements = jest.fn().mockResolvedValue([]);
    mockDb.updateAchievement = jest.fn().mockResolvedValue(undefined);
    mockDb.getSnoozeState = jest.fn().mockResolvedValue({ snoozed: false });
    mockDb.setSnoozeState = jest.fn().mockResolvedValue(undefined);
    mockDb.getAlertHistory = jest.fn().mockResolvedValue(null);
    mockDb.updateAlertHistory = jest.fn().mockResolvedValue(undefined);

    configRepo = new ConfigRepository(mockDb);
  });

  describe('User Config Operations', () => {
    it('should get user config', async () => {
      const config = await configRepo.getUserConfig();
      expect(config).toEqual(mockConfig);
      expect(mockDb.getConfig).toHaveBeenCalledWith('user_config');
    });

    it('should return default config if none exists', async () => {
      mockDb.getConfig.mockResolvedValue(null);
      const config = await configRepo.getUserConfig();
      expect(config.experienceLevel).toBe(DeveloperLevel.Mid);
      expect(config.onboardingCompleted).toBe(false);
    });

    it('should save user config', async () => {
      await configRepo.saveUserConfig(mockConfig);
      expect(mockDb.setConfig).toHaveBeenCalledWith('user_config', mockConfig);
    });

    it('should update config partially', async () => {
      const updates = { blindApprovalThreshold: 1500 };
      const result = await configRepo.updateConfig(updates);
      expect(result.blindApprovalThreshold).toBe(1500);
      expect(mockDb.setConfig).toHaveBeenCalled();
    });
  });

  describe('Experience Level', () => {
    it('should set experience level with thresholds', async () => {
      await configRepo.setExperienceLevel(DeveloperLevel.Senior);
      expect(mockDb.setConfig).toHaveBeenCalled();
    });
  });

  describe('Onboarding', () => {
    it('should complete onboarding', async () => {
      await configRepo.completeOnboarding();
      expect(mockDb.setConfig).toHaveBeenCalled();
    });

    it('should check onboarding status', async () => {
      const completed = await configRepo.isOnboardingCompleted();
      expect(completed).toBe(false);
    });
  });

  describe('Achievements', () => {
    it('should get all achievements', async () => {
      const achievements = await configRepo.getAllAchievements();
      expect(Array.isArray(achievements)).toBe(true);
      expect(mockDb.getAllAchievements).toHaveBeenCalled();
    });

    it('should unlock achievement', async () => {
      await configRepo.unlockAchievement('first-step');
      expect(mockDb.updateAchievement).toHaveBeenCalled();
    });

    it('should update achievement progress', async () => {
      await configRepo.updateAchievementProgress('first-step', 50);
      expect(mockDb.updateAchievement).toHaveBeenCalled();
    });

    it('should get unlocked count', async () => {
      mockDb.getAllAchievements.mockResolvedValue([
        { id: 'first-steps', unlocked: true, progress: 100 },
        { id: 'careful-reviewer', unlocked: false, progress: 0 },
      ] as any);
      const count = await configRepo.getUnlockedCount();
      expect(count).toBe(1);
    });
  });

  describe('Snooze State', () => {
    it('should get snooze state', async () => {
      mockDb.getSnoozeState.mockResolvedValue({ snoozed: false });
      const state = await configRepo.getSnoozeState();
      expect(state.snoozed).toBe(false);
    });

    it('should set snooze state', async () => {
      await configRepo.setSnoozeState({ snoozed: true, snoozeUntil: Date.now() });
      expect(mockDb.setSnoozeState).toHaveBeenCalled();
    });

    it('should snooze until end of day', async () => {
      await configRepo.snoozeUntilEndOfDay('test reason');
      expect(mockDb.setSnoozeState).toHaveBeenCalled();
    });

    it('should check if snoozed', async () => {
      mockDb.getSnoozeState.mockResolvedValue({ snoozed: true, snoozeUntil: Date.now() + 10000 });
      const snoozed = await configRepo.isSnoozed();
      expect(snoozed).toBe(true);
    });
  });

  describe('Alert History', () => {
    it('should get alert history', async () => {
      mockDb.getAlertHistory.mockResolvedValue({
        alertType: AlertType.GentleNudge,
        lastShown: 1000,
        count: 5
      });
      const history = await configRepo.getAlertHistory(AlertType.GentleNudge);
      expect(history).toBeTruthy();
    });

    it('should record alert shown', async () => {
      await configRepo.recordAlertShown(AlertType.GentleNudge);
      expect(mockDb.updateAlertHistory).toHaveBeenCalled();
    });

    it('should check if alert can be shown', async () => {
      mockDb.getAlertHistory.mockResolvedValue({
        alertType: AlertType.GentleNudge,
        lastShown: Date.now() - 100000,
        count: 1
      });
      const canShow = await configRepo.canShowAlert(AlertType.GentleNudge, 60000);
      expect(canShow).toBe(true);
    });

    it('should respect rate limit', async () => {
      mockDb.getAlertHistory.mockResolvedValue({
        alertType: AlertType.GentleNudge,
        lastShown: Date.now() - 1000,
        count: 1
      });
      const canShow = await configRepo.canShowAlert(AlertType.GentleNudge, 60000);
      expect(canShow).toBe(false);
    });
  });
});
