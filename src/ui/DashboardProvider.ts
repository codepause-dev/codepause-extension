/**
 * DashboardProvider
 * Provides a webview panel with detailed metrics and insights
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { MetricsRepository } from '../storage/MetricsRepository';
import { ConfigRepository } from '../storage/ConfigRepository';
import { ThresholdManager } from '../core/ThresholdManager';
import { DailyMetrics, ToolMetrics, AITool } from '../types';
import { getDashboardHtml } from './DashboardHtml';

export class DashboardProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'codePause.dashboardView';

  private _view?: vscode.WebviewView;
  private metricsRepository: MetricsRepository;
  private configRepository: ConfigRepository;
  private thresholdManager: ThresholdManager;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    metricsRepository: MetricsRepository,
    configRepository: ConfigRepository,
    thresholdManager: ThresholdManager
  ) {
    this.metricsRepository = metricsRepository;
    this.configRepository = configRepository;
    this.thresholdManager = thresholdManager;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: vscode.WebviewViewResolveContext,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = getDashboardHtml(webviewView.webview, this._extensionUri);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async data => {
      switch (data.type) {
        case 'refresh':
          await this.refresh();
          break;
        case 'export':
          await this.exportData();
          break;
        case 'openSettings':
          await vscode.commands.executeCommand('codePause.openSettings');
          break;
        case 'snooze':
          await vscode.commands.executeCommand('codePause.snooze');
          break;
        case 'reviewFile':
          // ENHANCED: Open file for review
          await this.openFileForReview(data.filePath);
          break;
        case 'markAsReviewed':
          // NEW: Manually mark file as reviewed
          await this.markFileAsReviewed(data.filePath, data.tool);
          await this.refresh();
          break;
      }
    });

    // Initial data load
    this.refresh();
  }

  public async refresh(forceHtmlUpdate: boolean = false) {
    if (!this._view) {
      return;
    }

    try {
      // If force update, regenerate HTML (for code changes)
      if (forceHtmlUpdate) {
        this._view.webview.html = getDashboardHtml(this._view.webview, this._extensionUri);
        // Wait a bit for HTML to load before sending data
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const data = await this.getDashboardData();
      this._view.webview.postMessage({ type: 'updateData', data });
    } catch (error) {
      console.error('Failed to refresh dashboard:', error);
      this._view.webview.postMessage({
        type: 'error',
        message: 'Failed to load dashboard data'
      });
    }
  }

  private async getDashboardData() {
    try {
      const today = this.getTodayDateString();
      console.log('========================================');
      console.log('[DashboardProvider] 📊 GETTING DASHBOARD DATA');
      console.log('[DashboardProvider] 📅 Today:', today);
      console.log('========================================');

      const threshold = this.thresholdManager.getConfig();
      const config = await this.configRepository.getUserConfig();

      // Force aggregation of today's metrics to show latest data in chart
      await this.metricsRepository.calculateDailyMetrics(today);

      // Get today's metrics
      const todayMetrics = await this.metricsRepository.getDailyMetrics(today) || this.getEmptyMetrics(today);

      console.log('[DashboardProvider] 📊 Today metrics:', {
        totalEvents: todayMetrics.totalEvents,
        totalAiLines: todayMetrics.totalAILines,
        totalManualLines: todayMetrics.totalManualLines,
        aiPercentage: todayMetrics.aiPercentage,
        reviewQualityScore: todayMetrics.reviewQualityScore
      });

      // Get last 7 days metrics
      const last7Days = await this.getLast7DaysMetrics();

      const toolBreakdown = await this.getToolBreakdown(today);

      // Get coding modes breakdown
      const codingModes = await this.getCodingModes(today);

      // Get trends
      const trends = this.calculateTrends(last7Days);

      // Get snooze state
      const snoozeState = await this.configRepository.getSnoozeState();

      // Calculate streak
      const streakDays = await this.calculateStreak();

      // Get review quality data
      const unreviewedFiles = await this.metricsRepository.getUnreviewedFiles(today);
      const terminalReviewedFiles = await this.metricsRepository.getTerminalReviewedFiles(today);
      const agentSessions = await this.metricsRepository.getRecentAgentSessions(5);

      // Get workspace info
      const workspace = this.getWorkspaceInfo();

      // Get core metrics for improved dashboard
      const coreMetrics = await this.metricsRepository.getCoreMetrics(config.experienceLevel, threshold);

      const data = {
        today: todayMetrics,
        last7Days,
        trends,
        toolBreakdown,
        codingModes,
        threshold,
        config,
        snoozeState,
        streakDays,
        unreviewedFiles,
        terminalReviewedFiles,
        agentSessions,
        workspace,
        coreMetrics
      };

      return data;
    } catch (error) {
      console.error('CodePause: Error loading dashboard data:', error);
      throw error;
    }
  }

  private async calculateStreak(): Promise<number> {
    try {
      const today = new Date();
      let streak = 0;

      // Check up to 30 days for performance (most streaks won't be longer than this)
      for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        const metrics = await this.metricsRepository.getDailyMetrics(dateStr);

        if (metrics && metrics.totalEvents > 0) {
          streak++;
        } else {
          break; // Streak broken
        }
      }

      return streak;
    } catch (error) {
      console.error('Error calculating streak:', error);
      return 0;
    }
  }

  private async getLast7DaysMetrics(): Promise<DailyMetrics[]> {
    const metrics: DailyMetrics[] = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const dayMetrics = await this.metricsRepository.getDailyMetrics(dateStr);
      metrics.push(dayMetrics || this.getEmptyMetrics(dateStr));
    }

    return metrics;
  }

  private async getToolBreakdown(date: string): Promise<ToolMetrics[]> {
    // Get tool metrics from daily metrics breakdown
    const metrics = await this.metricsRepository.getDailyMetrics(date);
    if (!metrics || !metrics.toolBreakdown) {
      // Return empty tool metrics for all tools when no data exists
      return [
        { tool: 'copilot' as AITool, suggestionCount: 0, acceptedCount: 0, rejectedCount: 0, linesGenerated: 0, averageReviewTime: 0 },
        { tool: 'cursor' as AITool, suggestionCount: 0, acceptedCount: 0, rejectedCount: 0, linesGenerated: 0, averageReviewTime: 0 },
        { tool: 'claude-code' as AITool, suggestionCount: 0, acceptedCount: 0, rejectedCount: 0, linesGenerated: 0, averageReviewTime: 0 }
      ];
    }

    const breakdown = Object.values(metrics.toolBreakdown);

    // Ensure all tools are present with at least zero values
    const allTools: AITool[] = [AITool.Copilot, AITool.Cursor, AITool.ClaudeCode];
    const existingTools = new Set(breakdown.map(t => t.tool));

    for (const tool of allTools) {
      if (!existingTools.has(tool)) {
        breakdown.push({
          tool,
          suggestionCount: 0,
          acceptedCount: 0,
          rejectedCount: 0,
          linesGenerated: 0,
          averageReviewTime: 0
        });
      }
    }

    return breakdown;
  }

  private async getCodingModes(date: string) {
    // Get all events for the day to analyze modes
    const events = await this.metricsRepository.getEventsForDateRange(date, date);

    // Initialize mode stats
    const modes = {
      agent: { lines: 0, events: 0, reviewedFiles: 0, totalFiles: 0, avgReviewScore: 0 },
      inline: { lines: 0, events: 0, acceptances: 0, quickAcceptances: 0 },
      chatPaste: { lines: 0, events: 0, avgReviewScore: 0 }
    };

    // Categorize events by mode based on detection method
    for (const event of events) {
      const metadata = event.metadata as Record<string, unknown>;
      const detectionMethod = event.detectionMethod;
      const lines = event.linesOfCode || 0;

      // CRITICAL FIX: Skip manual code events - they should NOT be counted in AI coding modes
      // Manual code is tracked separately in the manual vs AI metrics
      if (event.source === 'manual') {
        continue;
      }

      // Agent Mode: Files modified while closed
      if (detectionMethod === 'external-file-change' || metadata?.closedFileModification || event.isAgentMode) {
        modes.agent.lines += lines;
        modes.agent.events++;
      }
      // Inline Autocomplete: Real-time suggestions
      else if (detectionMethod === 'inline-completion-api' || event.eventType === 'suggestion-accepted') {
        modes.inline.lines += lines;
        modes.inline.events++;
        if (event.eventType === 'suggestion-accepted') {
          modes.inline.acceptances++;
          if (event.acceptanceTimeDelta && event.acceptanceTimeDelta < 2000) {
            modes.inline.quickAcceptances++;
          }
        }
      }
      // Chat/Paste Mode: Large code blocks
      else if (detectionMethod === 'large-paste' || (detectionMethod === 'change-velocity' && lines > 50)) {
        modes.chatPaste.lines += lines;
        modes.chatPaste.events++;
      }
      // Fallback: Unknown AI detection method, assume agent mode
      // (Should rarely hit this - indicates missing detection method on AI event)
      else if (lines > 0) {
        modes.agent.lines += lines;
        modes.agent.events++;
      }
    }

    // Get file review stats for agent mode
    const fileReviews = await this.metricsRepository.getFileReviewsForDate(date);
    const agentFiles = fileReviews.filter(f => f.wasFileOpen === false || !f.wasFileOpen);
    modes.agent.totalFiles = agentFiles.length;
    modes.agent.reviewedFiles = agentFiles.filter(f => f.isReviewed || f.reviewScore >= 70).length;
    if (agentFiles.length > 0) {
      modes.agent.avgReviewScore = agentFiles.reduce((sum, f) => sum + (f.reviewScore || 0), 0) / agentFiles.length;
    }

    // Calculate percentages
    const totalLines = modes.agent.lines + modes.inline.lines + modes.chatPaste.lines;
    return {
      agent: {
        ...modes.agent,
        percentage: totalLines > 0 ? Math.round((modes.agent.lines / totalLines) * 100) : 0
      },
      inline: {
        ...modes.inline,
        percentage: totalLines > 0 ? Math.round((modes.inline.lines / totalLines) * 100) : 0
      },
      chatPaste: {
        ...modes.chatPaste,
        percentage: totalLines > 0 ? Math.round((modes.chatPaste.lines / totalLines) * 100) : 0
      },
      totalLines
    };
  }

  private calculateTrends(metrics: DailyMetrics[]) {
    if (metrics.length < 2) {
      return {
        aiPercentage: 'stable' as const,
        reviewTime: 'stable' as const
      };
    }

    const recent = metrics.slice(-3);
    const older = metrics.slice(0, 3);

    const avgRecentAI = this.average(recent.map(m => m.aiPercentage));
    const avgOlderAI = this.average(older.map(m => m.aiPercentage));

    const avgRecentReview = this.average(recent.map(m => m.averageReviewTime));
    const avgOlderReview = this.average(older.map(m => m.averageReviewTime));

    return {
      aiPercentage: this.getTrend(avgRecentAI, avgOlderAI, 5),
      reviewTime: this.getTrend(avgRecentReview, avgOlderReview, 200)
    };
  }

  private average(numbers: number[]): number {
    if (numbers.length === 0) {
      return 0;
    }
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  }

  private getTrend(recent: number, older: number, threshold: number): 'increasing' | 'decreasing' | 'stable' {
    const diff = recent - older;
    if (Math.abs(diff) < threshold) {
      return 'stable';
    }
    return diff > 0 ? 'increasing' : 'decreasing';
  }

  private getEmptyMetrics(date: string): DailyMetrics {
    return {
      date,
      totalEvents: 0,
      totalAISuggestions: 0,
      totalAILines: 0,
      totalManualLines: 0,
      aiPercentage: 0,
      averageReviewTime: 0,
      sessionCount: 0,
      toolBreakdown: {} as Record<AITool, ToolMetrics>
    };
  }

  private async exportData() {
    try {
      const data = await this.getDashboardData();
      const json = JSON.stringify(data, null, 2);

      const uri = await vscode.window.showSaveDialog({
        filters: { 'json': ['json'] },
        defaultUri: vscode.Uri.file(`codepause-export-${Date.now()}.json`)
      });

      if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf8'));
        vscode.window.showInformationMessage('Dashboard data exported successfully');
      }
    } catch (error) {
      vscode.window.showErrorMessage('Failed to export data');
      console.error('Export error:', error);
    }
  }

  /**
   * ENHANCED: Open a file for review in the editor
   */
  private async openFileForReview(filePath: string) {
    try {
      // Convert to URI
      const uri = vscode.Uri.file(filePath);

      // Open the file in the editor
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document, {
        preview: false, // Open in a non-preview tab so it stays open
        preserveFocus: false // Give focus to the editor
      });

      vscode.window.showInformationMessage(`Opened ${filePath.split('/').pop()} for review`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
      console.error('Open file error:', error);
    }
  }

  private async markFileAsReviewed(filePath: string, tool: string) {
    try {
      const today = this.getTodayDateString();
      const config = await this.configRepository.getUserConfig();

      // Update the file review status to mark as reviewed
      // Passes developer level to calculate expected review time
      await this.metricsRepository.markFileAsReviewed(filePath, tool, today, config.experienceLevel);

      const fileName = filePath.split('/').pop();
      vscode.window.showInformationMessage(`Marked ${fileName} as reviewed`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to mark file as reviewed`);
      console.error('Mark as reviewed error:', error);
    }
  }

  private getTodayDateString(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Get workspace information for display
   */
  private getWorkspaceInfo(): { name: string; path: string | null; isMultiRoot: boolean } {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      return {
        name: 'No Workspace',
        path: null,
        isMultiRoot: false
      };
    }

    const primaryFolder = workspaceFolders[0];
    const folderName = primaryFolder.name || path.basename(primaryFolder.uri.fsPath);

    return {
      name: folderName,
      path: primaryFolder.uri.fsPath,
      isMultiRoot: workspaceFolders.length > 1
    };
  }
}
