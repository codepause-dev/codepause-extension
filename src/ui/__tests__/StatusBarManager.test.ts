/**
 * StatusBarManager Tests - Simplified
 */

jest.mock('vscode', () => ({
  window: {
    createStatusBarItem: jest.fn(() => ({
      text: '',
      tooltip: '',
      command: '',
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
    })),
  },
  StatusBarAlignment: {
    Left: 1,
    Right: 2,
  },
  ThemeColor: class {
    constructor(public id: string) {}
  }
}), { virtual: true });

jest.mock('../../storage/MetricsRepository');
jest.mock('../../storage/ConfigRepository');
jest.mock('../../core/ThresholdManager');

import { StatusBarManager } from '../StatusBarManager';
import { MetricsRepository } from '../../storage/MetricsRepository';
import { ConfigRepository } from '../../storage/ConfigRepository';
import { ThresholdManager } from '../../core/ThresholdManager';
import * as vscode from 'vscode';

describe('StatusBarManager', () => {
  let statusBarManager: StatusBarManager;
  let mockMetricsRepo: jest.Mocked<MetricsRepository>;
  let mockConfigRepo: jest.Mocked<ConfigRepository>;
  let mockThresholdManager: jest.Mocked<ThresholdManager>;
  let mockStatusBarItem: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockStatusBarItem = {
      text: '',
      tooltip: '',
      color: undefined,
      command: '',
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
    };

    (vscode.window.createStatusBarItem as jest.Mock).mockReturnValue(mockStatusBarItem);

    mockMetricsRepo = new MetricsRepository(null as any) as jest.Mocked<MetricsRepository>;
    mockMetricsRepo.getDailyMetrics = jest.fn().mockResolvedValue({
      date: '2024-01-01',
      totalEvents: 10,
      totalAILines: 50,
      totalManualLines: 20,
      aiPercentage: 71,
      averageReviewTime: 2000,
      sessionCount: 1,
      toolBreakdown: {},
    } as any);

    mockConfigRepo = new ConfigRepository(null as any) as jest.Mocked<ConfigRepository>;
    mockConfigRepo.getSnoozeState = jest.fn().mockResolvedValue({ snoozed: false });

    mockThresholdManager = new ThresholdManager(null as any) as jest.Mocked<ThresholdManager>;
    mockThresholdManager.getConfig = jest.fn().mockReturnValue({
      level: 'mid',
      blindApprovalTime: 2000,
      minReviewTime: 1000,
      maxAIPercentage: 60,
      streakThreshold: 3
    });

    statusBarManager = new StatusBarManager(mockMetricsRepo, mockConfigRepo, mockThresholdManager);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Initialization', () => {
    it('should create instance', () => {
      expect(statusBarManager).toBeTruthy();
    });

    it('should create status bar item', () => {
      expect(vscode.window.createStatusBarItem).toHaveBeenCalled();
    });

    it('should set command and tooltip', () => {
      expect(mockStatusBarItem.command).toBe('codePause.openDashboard');
      expect(mockStatusBarItem.tooltip).toBe('Click to open CodePause dashboard');
    });

    it('should initialize and show status bar', async () => {
      await statusBarManager.initialize();
      expect(mockStatusBarItem.show).toHaveBeenCalled();
    });

    it('should start periodic updates on initialize', async () => {
      await statusBarManager.initialize();

      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      expect(mockMetricsRepo.getDailyMetrics).toHaveBeenCalledTimes(2); // init + first interval
    });
  });

  describe('Status Updates', () => {
    it('should refresh without errors', async () => {
      await expect(statusBarManager.refresh()).resolves.not.toThrow();
    });

    it('should update status bar with metrics', async () => {
      await statusBarManager.refresh();

      expect(mockStatusBarItem.text).toContain('71% AI');
      expect(mockStatusBarItem.text).toContain('10 suggestions');
    });

    it('should show idle state for null metrics', async () => {
      mockMetricsRepo.getDailyMetrics.mockResolvedValue(null);
      await statusBarManager.refresh();

      expect(mockStatusBarItem.text).toBe('🤖 CodePause');
      expect(mockStatusBarItem.color).toBeUndefined();
    });

    it('should show idle state for zero events', async () => {
      mockMetricsRepo.getDailyMetrics.mockResolvedValue({
        date: '2024-01-01',
        totalEvents: 0,
        totalAILines: 0,
        totalManualLines: 0,
        aiPercentage: 0,
        averageReviewTime: 0,
        sessionCount: 0,
        toolBreakdown: {},
      } as any);

      await statusBarManager.refresh();
      expect(mockStatusBarItem.text).toBe('🤖 CodePause');
    });

    it('should show snoozed state when snoozed', async () => {
      mockConfigRepo.getSnoozeState.mockResolvedValue({ snoozed: true, snoozeUntil: Date.now() + 3600000 });
      await statusBarManager.refresh();

      expect(mockStatusBarItem.text).toBe('🤖 💤 Snoozed');
    });

    it('should handle errors gracefully', async () => {
      mockMetricsRepo.getDailyMetrics.mockRejectedValue(new Error('Database error'));
      await statusBarManager.refresh();

      expect(mockStatusBarItem.text).toBe('🤖 Error');
    });
  });

  describe('Color Indicators', () => {
    it('should show warning color when over threshold by 10%', async () => {
      mockMetricsRepo.getDailyMetrics.mockResolvedValue({
        date: '2024-01-01',
        totalEvents: 10,
        totalAILines: 50,
        totalManualLines: 20,
        aiPercentage: 75, // 15% over threshold of 60%
        averageReviewTime: 2000,
        sessionCount: 1,
        toolBreakdown: {},
      } as any);

      await statusBarManager.refresh();
      expect(mockStatusBarItem.color).toBeDefined();
    });

    it('should show gold color when at threshold', async () => {
      mockMetricsRepo.getDailyMetrics.mockResolvedValue({
        date: '2024-01-01',
        totalEvents: 10,
        totalAILines: 50,
        totalManualLines: 20,
        aiPercentage: 62, // Just over threshold of 60%
        averageReviewTime: 2000,
        sessionCount: 1,
        toolBreakdown: {},
      } as any);

      await statusBarManager.refresh();
      expect(mockStatusBarItem.color).toBe('#FFD700');
    });

    it('should show green color when near threshold', async () => {
      mockMetricsRepo.getDailyMetrics.mockResolvedValue({
        date: '2024-01-01',
        totalEvents: 10,
        totalAILines: 50,
        totalManualLines: 20,
        aiPercentage: 55, // Within 10% of threshold
        averageReviewTime: 2000,
        sessionCount: 1,
        toolBreakdown: {},
      } as any);

      await statusBarManager.refresh();
      expect(mockStatusBarItem.color).toBe('#90EE90');
    });

    it('should use default color when well under threshold', async () => {
      mockMetricsRepo.getDailyMetrics.mockResolvedValue({
        date: '2024-01-01',
        totalEvents: 10,
        totalAILines: 50,
        totalManualLines: 20,
        aiPercentage: 30, // Well under threshold
        averageReviewTime: 2000,
        sessionCount: 1,
        toolBreakdown: {},
      } as any);

      await statusBarManager.refresh();
      expect(mockStatusBarItem.color).toBeUndefined();
    });
  });

  describe('Tooltip', () => {
    it('should build detailed tooltip', async () => {
      await statusBarManager.refresh();

      expect(mockStatusBarItem.tooltip).toContain('Today\'s Stats');
      expect(mockStatusBarItem.tooltip).toContain('71%');
      expect(mockStatusBarItem.tooltip).toContain('10');
      expect(mockStatusBarItem.tooltip).toContain('2.0s');
    });

    it('should format review time in milliseconds', async () => {
      mockMetricsRepo.getDailyMetrics.mockResolvedValue({
        date: '2024-01-01',
        totalEvents: 10,
        totalAILines: 50,
        totalManualLines: 20,
        aiPercentage: 71,
        averageReviewTime: 500, // Less than 1 second
        sessionCount: 1,
        toolBreakdown: {},
      } as any);

      await statusBarManager.refresh();
      expect(mockStatusBarItem.tooltip).toContain('500ms');
    });

    it('should format review time in seconds', async () => {
      mockMetricsRepo.getDailyMetrics.mockResolvedValue({
        date: '2024-01-01',
        totalEvents: 10,
        totalAILines: 50,
        totalManualLines: 20,
        aiPercentage: 71,
        averageReviewTime: 3456, // > 1 second
        sessionCount: 1,
        toolBreakdown: {},
      } as any);

      await statusBarManager.refresh();
      expect(mockStatusBarItem.tooltip).toContain('3.5s');
    });
  });

  describe('Temporary Messages', () => {
    it('should show temporary message', () => {
      statusBarManager.showTemporaryMessage('Test Message', 3000);
      expect(mockStatusBarItem.text).toBe('Test Message');
    });

    it('should restore original text after duration', async () => {
      mockStatusBarItem.text = 'Original Text';
      const originalColor = mockStatusBarItem.color;

      statusBarManager.showTemporaryMessage('Temporary', 1000);
      expect(mockStatusBarItem.text).toBe('Temporary');

      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(mockStatusBarItem.text).toBe('Original Text');
      expect(mockStatusBarItem.color).toBe(originalColor);
    });
  });

  describe('Disposal', () => {
    it('should dispose without errors', () => {
      expect(() => statusBarManager.dispose()).not.toThrow();
    });

    it('should clear interval on dispose', async () => {
      await statusBarManager.initialize();
      statusBarManager.dispose();

      const callCountBefore = mockMetricsRepo.getDailyMetrics.mock.calls.length;
      jest.advanceTimersByTime(10000);
      const callCountAfter = mockMetricsRepo.getDailyMetrics.mock.calls.length;

      expect(callCountAfter).toBe(callCountBefore);
    });

    it('should dispose status bar item', () => {
      statusBarManager.dispose();
      expect(mockStatusBarItem.dispose).toHaveBeenCalled();
    });
  });
});
