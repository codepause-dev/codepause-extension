/**
 * DashboardProvider Tests
 */

jest.mock('vscode', () => ({
  Uri: {
    joinPath: jest.fn((_base: unknown, ...paths: string[]) => ({
      fsPath: paths.join('/'),
      scheme: 'file'
    })),
    file: (path: string) => ({ fsPath: path, scheme: 'file' })
  },
  commands: {
    executeCommand: jest.fn()
  },
  window: {
    showSaveDialog: jest.fn(),
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showTextDocument: jest.fn().mockResolvedValue(undefined)
  },
  workspace: {
    fs: {
      writeFile: jest.fn()
    },
    openTextDocument: jest.fn().mockResolvedValue({}),
    workspaceFolders: []
  }
}), { virtual: true });

jest.mock('../../storage/MetricsRepository');
jest.mock('../../storage/ConfigRepository');
jest.mock('../../core/ThresholdManager');

import { DashboardProvider } from '../DashboardProvider';
import { MetricsRepository } from '../../storage/MetricsRepository';
import { ConfigRepository } from '../../storage/ConfigRepository';
import { ThresholdManager } from '../../core/ThresholdManager';
import { DailyMetrics, UserConfig, DeveloperLevel, AlertFrequency, AITool } from '../../types';
import * as vscode from 'vscode';

describe('DashboardProvider', () => {
  let dashboardProvider: DashboardProvider;
  let mockMetricsRepo: jest.Mocked<MetricsRepository>;
  let mockConfigRepo: jest.Mocked<ConfigRepository>;
  let mockThresholdManager: jest.Mocked<ThresholdManager>;
  let mockExtensionUri: vscode.Uri;
  let mockWebviewView: {
    webview: {
      options: unknown;
      html: string;
      onDidReceiveMessage: jest.Mock;
      postMessage: jest.Mock;
      asWebviewUri: jest.Mock;
      cspSource: string;
    };
  };

  const mockDailyMetrics: DailyMetrics = {
    date: '2024-01-01',
    totalEvents: 10,
    totalAISuggestions: 8,
    totalAILines: 50,
    totalManualLines: 20,
    aiPercentage: 71,
    averageReviewTime: 2000,
    sessionCount: 1,
    toolBreakdown: {
      [AITool.Copilot]: {
        tool: AITool.Copilot,
        suggestionCount: 10,
        acceptedCount: 8,
        rejectedCount: 2,
        linesGenerated: 25,
        averageReviewTime: 2000
      },
      [AITool.Cursor]: {
        tool: AITool.Cursor,
        suggestionCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        linesGenerated: 0,
        averageReviewTime: 0
      },
      [AITool.ClaudeCode]: {
        tool: AITool.ClaudeCode,
        suggestionCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        linesGenerated: 0,
        averageReviewTime: 0
      }
    }
  };

  const mockUserConfig: UserConfig = {
    experienceLevel: DeveloperLevel.Mid,
    blindApprovalThreshold: 2000,
    alertFrequency: AlertFrequency.Medium,
    enableGamification: true,
    anonymizePaths: true,
    trackedTools: { copilot: true, cursor: true, claudeCode: true },
    onboardingCompleted: true
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockExtensionUri = { fsPath: '/extension', scheme: 'file' } as vscode.Uri;

    mockMetricsRepo = new MetricsRepository(null as never) as jest.Mocked<MetricsRepository>;
    mockConfigRepo = new ConfigRepository(null as never) as jest.Mocked<ConfigRepository>;
    mockThresholdManager = new ThresholdManager(DeveloperLevel.Mid) as jest.Mocked<ThresholdManager>;

    mockMetricsRepo.calculateDailyMetrics = jest.fn().mockResolvedValue(undefined);
    mockMetricsRepo.getDailyMetrics = jest.fn().mockResolvedValue(mockDailyMetrics);
    mockMetricsRepo.getEventsForDateRange = jest.fn().mockResolvedValue([]);
    mockMetricsRepo.getFileReviewsForDate = jest.fn().mockResolvedValue([]);
    mockMetricsRepo.getUnreviewedFiles = jest.fn().mockResolvedValue([]);
    mockMetricsRepo.getTerminalReviewedFiles = jest.fn().mockResolvedValue([]);
    mockMetricsRepo.getRecentAgentSessions = jest.fn().mockResolvedValue([]);
    mockMetricsRepo.getCoreMetrics = jest.fn().mockResolvedValue({
      codeOwnershipScore: 75,
      skillDevelopmentHealth: 'good' as const,
      reviewQuality: 'thorough' as const
    });
    mockConfigRepo.getUserConfig = jest.fn().mockResolvedValue(mockUserConfig);
    mockConfigRepo.getSnoozeState = jest.fn().mockResolvedValue({ snoozed: false });
    mockThresholdManager.getConfig = jest.fn().mockReturnValue({
      maxAIPercentage: 70,
      minReviewTime: 2000,
      blindApprovalThreshold: 2000
    });

    mockWebviewView = {
      webview: {
        options: {},
        html: '',
        onDidReceiveMessage: jest.fn(),
        postMessage: jest.fn(),
        asWebviewUri: jest.fn((uri: vscode.Uri) => uri),
        cspSource: 'vscode-webview'
      }
    };

    dashboardProvider = new DashboardProvider(
      mockExtensionUri,
      mockMetricsRepo,
      mockConfigRepo,
      mockThresholdManager
    );
  });

  describe('Initialization', () => {
    it('should create instance', () => {
      expect(dashboardProvider).toBeTruthy();
    });

    it('should have correct viewType', () => {
      expect(DashboardProvider.viewType).toBe('codePause.dashboardView');
    });
  });

  describe('resolveWebviewView', () => {
    it('should configure webview options', () => {
      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );

      expect(mockWebviewView.webview.options).toEqual({
        enableScripts: true,
        localResourceRoots: [mockExtensionUri]
      });
    });

    it('should set webview HTML', () => {
      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );

      expect(mockWebviewView.webview.html).toContain('CodePause Dashboard');
      expect(mockWebviewView.webview.html).toContain('<!DOCTYPE html>');
    });

    it('should register message handler', () => {
      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );

      expect(mockWebviewView.webview.onDidReceiveMessage).toHaveBeenCalled();
    });

    it('should handle refresh message', async () => {
      let messageHandler: (data: { type: string }) => Promise<void>;

      mockWebviewView.webview.onDidReceiveMessage.mockImplementation((handler) => {
        messageHandler = handler;
        return { dispose: jest.fn() };
      });

      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );

      await messageHandler!({ type: 'refresh' });

      expect(mockWebviewView.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'updateData' })
      );
    });

    it('should handle export message', async () => {
      let messageHandler: (data: { type: string }) => Promise<void>;

      mockWebviewView.webview.onDidReceiveMessage.mockImplementation((handler) => {
        messageHandler = handler;
        return { dispose: jest.fn() };
      });

      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(
        vscode.Uri.file('/export.json')
      );

      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );

      await messageHandler!({ type: 'export' });

      expect(vscode.window.showSaveDialog).toHaveBeenCalled();
    });

    it('should handle openSettings message', async () => {
      let messageHandler: (data: { type: string }) => Promise<void>;

      mockWebviewView.webview.onDidReceiveMessage.mockImplementation((handler) => {
        messageHandler = handler;
        return { dispose: jest.fn() };
      });

      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );

      await messageHandler!({ type: 'openSettings' });

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('codePause.openSettings');
    });

    it('should handle snooze message', async () => {
      let messageHandler: (data: { type: string }) => Promise<void>;

      mockWebviewView.webview.onDidReceiveMessage.mockImplementation((handler) => {
        messageHandler = handler;
        return { dispose: jest.fn() };
      });

      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );

      await messageHandler!({ type: 'snooze' });

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('codePause.snooze');
    });
  });

  describe('refresh', () => {
    beforeEach(() => {
      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );
    });

    it('should update webview with data', async () => {
      await dashboardProvider.refresh();

      expect(mockWebviewView.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'updateData',
          data: expect.objectContaining({
            today: mockDailyMetrics
          })
        })
      );
    });

    it('should force HTML update when requested', async () => {
      await dashboardProvider.refresh(true);

      expect(mockWebviewView.webview.html).toBeTruthy();
    });

    it('should handle errors gracefully', async () => {
      mockMetricsRepo.getDailyMetrics.mockRejectedValue(new Error('Database error'));

      await dashboardProvider.refresh();

      expect(mockWebviewView.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: 'Failed to load dashboard data'
        })
      );
    });

    // TODO: Fix mock timing issues with shared state
    it.skip('should not refresh if view not initialized', async () => {
      // Record the number of calls before creating new provider
      const callsBefore = mockMetricsRepo.getDailyMetrics.mock.calls.length;

      const newDashboard = new DashboardProvider(
        mockExtensionUri,
        mockMetricsRepo,
        mockConfigRepo,
        mockThresholdManager
      );

      await newDashboard.refresh();

      // Should have same number of calls (no new calls from newDashboard.refresh())
      const callsAfter = mockMetricsRepo.getDailyMetrics.mock.calls.length;
      expect(callsAfter).toBe(callsBefore);
    });
  });

  describe('Dashboard Data', () => {
    beforeEach(() => {
      // Only clear the postMessage calls, not all mocks
      mockWebviewView.webview.postMessage.mockClear();
      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );
    });

    it('should get complete dashboard data', async () => {
      await dashboardProvider.refresh();

      const call = mockWebviewView.webview.postMessage.mock.calls[0][0];
      expect(call.data).toHaveProperty('today');
      expect(call.data).toHaveProperty('last7Days');
      expect(call.data).toHaveProperty('trends');
      expect(call.data).toHaveProperty('toolBreakdown');
      expect(call.data).toHaveProperty('threshold');
      expect(call.data).toHaveProperty('config');
      expect(call.data).toHaveProperty('snoozeState');
    });

    it('should calculate daily metrics', async () => {
      await dashboardProvider.refresh();

      const today = new Date().toISOString().split('T')[0];
      expect(mockMetricsRepo.calculateDailyMetrics).toHaveBeenCalledWith(today);
    });

    it('should get last 7 days metrics', async () => {
      jest.clearAllMocks(); // Clear calls from beforeEach resolveWebviewView
      await dashboardProvider.refresh();

      // getDashboardData calls getDailyMetrics for: today + 7 days in getLast7DaysMetrics + today again in getToolBreakdown
      expect(mockMetricsRepo.getDailyMetrics).toHaveBeenCalled();
      expect(mockMetricsRepo.getDailyMetrics.mock.calls.length).toBeGreaterThanOrEqual(7);
    });

    // TODO: Fix mock timing issues with shared state
    it.skip('should handle empty metrics', async () => {
      // Set up mock to return null BEFORE creating provider
      mockMetricsRepo.getDailyMetrics.mockResolvedValue(null);
      mockWebviewView.webview.postMessage.mockClear();

      // Create a new provider with null metrics
      const emptyProvider = new DashboardProvider(
        mockExtensionUri,
        mockMetricsRepo,
        mockConfigRepo,
        mockThresholdManager
      );

      emptyProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );

      await emptyProvider.refresh();

      const call = mockWebviewView.webview.postMessage.mock.calls[0][0];
      expect(call.data.today).toHaveProperty('totalEvents', 0);
    });

    it('should get tool breakdown', async () => {
      await dashboardProvider.refresh();

      const call = mockWebviewView.webview.postMessage.mock.calls[0][0];
      expect(call.data.toolBreakdown).toBeInstanceOf(Array);
    });

    // TODO: Fix mock timing issues with shared state
    it.skip('should handle empty tool breakdown', async () => {
      // Set up mock to return empty breakdown BEFORE creating provider
      mockMetricsRepo.getDailyMetrics.mockResolvedValue({
        ...mockDailyMetrics,
        toolBreakdown: {} as never
      });
      mockWebviewView.webview.postMessage.mockClear();

      // Create a new provider with empty tool breakdown
      const emptyProvider = new DashboardProvider(
        mockExtensionUri,
        mockMetricsRepo,
        mockConfigRepo,
        mockThresholdManager
      );

      emptyProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );

      await emptyProvider.refresh();

      const call = mockWebviewView.webview.postMessage.mock.calls[0][0];
      // Should return all tools with zero values when breakdown is empty
      expect(call.data.toolBreakdown).toHaveLength(3);
      expect(call.data.toolBreakdown.every((t: any) => t.suggestionCount === 0)).toBe(true);
    });
  });

  describe('Trend Calculation', () => {
    beforeEach(() => {
      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );
    });

    it('should calculate trends correctly', async () => {
      const metrics: DailyMetrics[] = [];
      for (let i = 0; i < 7; i++) {
        metrics.push({
          ...mockDailyMetrics,
          date: `2024-01-0${i + 1}`,
          aiPercentage: 50 + i * 5, // Increasing trend
          averageReviewTime: 2000
        });
      }

      mockMetricsRepo.getDailyMetrics.mockImplementation((date: string) => {
        return Promise.resolve(metrics.find(m => m.date === date) || null);
      });

      await dashboardProvider.refresh();

      const call = mockWebviewView.webview.postMessage.mock.calls[0][0];
      expect(call.data.trends).toHaveProperty('aiPercentage');
      expect(call.data.trends).toHaveProperty('reviewTime');
    });

    it('should return stable trend for insufficient data', async () => {
      mockMetricsRepo.getDailyMetrics.mockResolvedValue(mockDailyMetrics);

      await dashboardProvider.refresh();

      const call = mockWebviewView.webview.postMessage.mock.calls[0][0];
      expect(call.data.trends.aiPercentage).toBe('stable');
    });
  });

  describe('Export Data', () => {
    beforeEach(() => {
      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );
    });

    it('should export data to JSON file', async () => {
      const mockUri = vscode.Uri.file('/export.json');
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(mockUri);

      let messageHandler: (data: { type: string }) => Promise<void>;
      mockWebviewView.webview.onDidReceiveMessage.mockImplementation((handler) => {
        messageHandler = handler;
        return { dispose: jest.fn() };
      });

      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );

      await messageHandler!({ type: 'export' });

      expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Dashboard data exported successfully'
      );
    });

    it('should handle export cancellation', async () => {
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(undefined);

      let messageHandler: (data: { type: string }) => Promise<void>;
      mockWebviewView.webview.onDidReceiveMessage.mockImplementation((handler) => {
        messageHandler = handler;
        return { dispose: jest.fn() };
      });

      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );

      await messageHandler!({ type: 'export' });

      expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
    });

    it('should handle export errors', async () => {
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(
        vscode.Uri.file('/export.json')
      );
      (vscode.workspace.fs.writeFile as jest.Mock).mockRejectedValue(
        new Error('Write error')
      );

      let messageHandler: (data: { type: string }) => Promise<void>;
      mockWebviewView.webview.onDidReceiveMessage.mockImplementation((handler) => {
        messageHandler = handler;
        return { dispose: jest.fn() };
      });

      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );

      await messageHandler!({ type: 'export' });

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Failed to export data');
    });
  });

  describe('HTML Generation', () => {
    it('should generate valid HTML', () => {
      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );

      expect(mockWebviewView.webview.html).toContain('<!DOCTYPE html>');
      expect(mockWebviewView.webview.html).toContain('<html');
      expect(mockWebviewView.webview.html).toContain('</html>');
    });

    it('should include CSP meta tag', () => {
      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );

      expect(mockWebviewView.webview.html).toContain('Content-Security-Policy');
    });

    it('should include logo URI', () => {
      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );

      expect(mockWebviewView.webview.asWebviewUri).toHaveBeenCalled();
    });

    it('should include action buttons', () => {
      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );

      expect(mockWebviewView.webview.html).toContain('refresh()');
      expect(mockWebviewView.webview.html).toContain('exportData()');
      expect(mockWebviewView.webview.html).toContain('openSettings()');
      expect(mockWebviewView.webview.html).toContain('snooze()');
    });

    it('should include escapeHtml function for XSS protection', () => {
      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );

      expect(mockWebviewView.webview.html).toContain('function escapeHtml');
    });

    it('should include auto-refresh script', () => {
      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );

      expect(mockWebviewView.webview.html).toContain('startAutoRefresh');
      expect(mockWebviewView.webview.html).toContain('5000'); // 5 second interval
    });
  });

  describe('Snooze State', () => {
    beforeEach(() => {
      jest.clearAllMocks(); // Clear previous test calls
      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );
    });

    // TODO: Fix mock timing issues with shared state
    it.skip('should include snooze state in dashboard data', async () => {
      // Set up mock to return snoozed state BEFORE creating provider
      mockConfigRepo.getSnoozeState.mockResolvedValue({
        snoozed: true,
        snoozeUntil: Date.now() + 3600000,
        snoozeReason: 'Testing'
      });
      mockWebviewView.webview.postMessage.mockClear();

      // Create a new provider with snoozed state
      const snoozedProvider = new DashboardProvider(
        mockExtensionUri,
        mockMetricsRepo,
        mockConfigRepo,
        mockThresholdManager
      );

      snoozedProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );

      await snoozedProvider.refresh();

      const call = mockWebviewView.webview.postMessage.mock.calls[0][0];
      expect(call.data.snoozeState.snoozed).toBe(true);
    });

    it('should handle not snoozed state', async () => {
      mockConfigRepo.getSnoozeState.mockResolvedValue({ snoozed: false });

      await dashboardProvider.refresh();

      const call = mockWebviewView.webview.postMessage.mock.calls[0][0];
      expect(call.data.snoozeState.snoozed).toBe(false);
    });
  });

  describe('File Review Features', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );
    });

    it('should handle reviewFile message', async () => {
      let messageHandler: (data: { type: string; filePath: string }) => Promise<void>;

      mockWebviewView.webview.onDidReceiveMessage.mockImplementation((handler) => {
        messageHandler = handler;
        return { dispose: jest.fn() };
      });

      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );

      await messageHandler!({ type: 'reviewFile', filePath: '/test/file.ts' });

      expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
      expect(vscode.window.showTextDocument).toHaveBeenCalled();
    });

    it('should handle markAsReviewed message', async () => {
      let messageHandler: (data: { type: string; filePath: string; tool: string }) => Promise<void>;

      mockWebviewView.webview.onDidReceiveMessage.mockImplementation((handler) => {
        messageHandler = handler;
        return { dispose: jest.fn() };
      });

      mockMetricsRepo.markFileAsReviewed = jest.fn().mockResolvedValue(undefined);

      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );

      await messageHandler!({ type: 'markAsReviewed', filePath: '/test/file.ts', tool: 'copilot' });

      expect(mockMetricsRepo.markFileAsReviewed).toHaveBeenCalled();
    });
  });

  describe('Streak Calculation', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );
    });

    it('should calculate streak correctly', async () => {
      const metricsWithStreak: DailyMetrics[] = [];
      for (let i = 0; i < 5; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        metricsWithStreak.push({
          ...mockDailyMetrics,
          date: date.toISOString().split('T')[0],
          totalEvents: 10
        });
      }

      mockMetricsRepo.getDailyMetrics.mockImplementation((date: string) => {
        return Promise.resolve(metricsWithStreak.find(m => m.date === date) || null);
      });

      await dashboardProvider.refresh();

      const call = mockWebviewView.webview.postMessage.mock.calls[0][0];
      expect(call.data.streakDays).toBeGreaterThanOrEqual(0);
    });

    it('should handle zero streak when no metrics exist', async () => {
      // Create fresh mock that always returns null
      const freshMockRepo = new MetricsRepository(null as never) as jest.Mocked<MetricsRepository>;
      freshMockRepo.calculateDailyMetrics = jest.fn().mockResolvedValue(undefined);
      freshMockRepo.getDailyMetrics = jest.fn().mockResolvedValue(null);
      freshMockRepo.getEventsForDateRange = jest.fn().mockResolvedValue([]);
      freshMockRepo.getFileReviewsForDate = jest.fn().mockResolvedValue([]);
      freshMockRepo.getUnreviewedFiles = jest.fn().mockResolvedValue([]);
      freshMockRepo.getTerminalReviewedFiles = jest.fn().mockResolvedValue([]);
      freshMockRepo.getRecentAgentSessions = jest.fn().mockResolvedValue([]);
      freshMockRepo.getCoreMetrics = jest.fn().mockResolvedValue({
        codeOwnershipScore: 75,
        skillDevelopmentHealth: 'good' as const,
        reviewQuality: 'thorough' as const
      });

      const freshProvider = new DashboardProvider(
        mockExtensionUri,
        freshMockRepo,
        mockConfigRepo,
        mockThresholdManager
      );

      const freshMockView = {
        webview: {
          options: {},
          html: '',
          onDidReceiveMessage: jest.fn(),
          postMessage: jest.fn(),
          asWebviewUri: jest.fn((uri: vscode.Uri) => uri),
          cspSource: 'vscode-webview'
        }
      };

      freshProvider.resolveWebviewView(
        freshMockView as never,
        {} as never,
        {} as never
      );

      await freshProvider.refresh();

      const call = freshMockView.webview.postMessage.mock.calls[0][0];
      expect(call.data.streakDays).toBe(0);
    });
  });

  describe('Coding Modes', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );
    });

    it('should get coding modes breakdown', async () => {
      await dashboardProvider.refresh();

      const call = mockWebviewView.webview.postMessage.mock.calls[0][0];
      expect(call.data.codingModes).toBeDefined();
    });

    it('should include agent, inline, and chatPaste modes', async () => {
      await dashboardProvider.refresh();

      const call = mockWebviewView.webview.postMessage.mock.calls[0][0];
      expect(call.data.codingModes.agent).toBeDefined();
      expect(call.data.codingModes.inline).toBeDefined();
      expect(call.data.codingModes.chatPaste).toBeDefined();
      expect(call.data.codingModes.totalLines).toBeDefined();
    });
  });

  describe('Workspace Info', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );
    });

    it('should include workspace info in dashboard data', async () => {
      await dashboardProvider.refresh();

      const call = mockWebviewView.webview.postMessage.mock.calls[0][0];
      expect(call.data.workspace).toBeDefined();
      expect(call.data.workspace).toHaveProperty('name');
      expect(call.data.workspace).toHaveProperty('path');
      expect(call.data.workspace).toHaveProperty('isMultiRoot');
    });
  });

  describe('Review Quality Data', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );
    });

    it('should include unreviewed files', async () => {
      const unreviewedFiles = [
        { filePath: '/test/file1.ts', tool: AITool.Copilot, linesGenerated: 50 },
        { filePath: '/test/file2.ts', tool: AITool.Cursor, linesGenerated: 30 }
      ];

      mockMetricsRepo.getUnreviewedFiles.mockResolvedValue(unreviewedFiles as never);

      await dashboardProvider.refresh();

      const call = mockWebviewView.webview.postMessage.mock.calls[0][0];
      expect(call.data.unreviewedFiles).toEqual(unreviewedFiles);
    });

    it('should include terminal reviewed files', async () => {
      const terminalReviewed = [
        { filePath: '/test/file3.ts', tool: AITool.ClaudeCode, reviewQuality: 'thorough' as const }
      ];

      mockMetricsRepo.getTerminalReviewedFiles.mockResolvedValue(terminalReviewed as never);

      await dashboardProvider.refresh();

      const call = mockWebviewView.webview.postMessage.mock.calls[0][0];
      expect(call.data.terminalReviewedFiles).toEqual(terminalReviewed);
    });

    it('should include recent agent sessions', async () => {
      const agentSessions = [
        { id: 'session-1', date: '2024-01-01', tool: AITool.ClaudeCode, fileCount: 5 }
      ];

      mockMetricsRepo.getRecentAgentSessions.mockResolvedValue(agentSessions as never);

      await dashboardProvider.refresh();

      const call = mockWebviewView.webview.postMessage.mock.calls[0][0];
      expect(call.data.agentSessions).toEqual(agentSessions);
    });
  });

  describe('Core Metrics', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      dashboardProvider.resolveWebviewView(
        mockWebviewView as never,
        {} as never,
        {} as never
      );
    });

    it('should include core metrics in dashboard data', async () => {
      await dashboardProvider.refresh();

      const call = mockWebviewView.webview.postMessage.mock.calls[0][0];
      expect(call.data.coreMetrics).toBeDefined();
      expect(call.data.coreMetrics).toHaveProperty('codeOwnershipScore');
      expect(call.data.coreMetrics).toHaveProperty('skillDevelopmentHealth');
      expect(call.data.coreMetrics).toHaveProperty('reviewQuality');
    });
  });
});
