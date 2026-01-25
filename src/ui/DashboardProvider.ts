/**
 * DashboardProvider
 * Provides a webview panel with detailed metrics and insights
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { MetricsRepository } from '../storage/MetricsRepository';
import { ConfigRepository } from '../storage/ConfigRepository';
import { ThresholdManager } from '../core/ThresholdManager';
import { TelemetryService } from '../telemetry/TelemetryService';
import { MetricsCollector } from '../core/MetricsCollector';
import { DailyMetrics, ToolMetrics, AITool, FileTreeNode, DiffStatistics } from '../types';
import { getDashboardHtml } from './DashboardHtml';
import { DiffViewService } from './DiffViewService';
import { FileTreeBuilder } from './FileTreeBuilder';
import { DiffViewerHelper } from './DiffViewerHelper';

export class DashboardProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'codePause.dashboardView';

  private _view?: vscode.WebviewView;
  private metricsRepository: MetricsRepository;
  private configRepository: ConfigRepository;
  private thresholdManager: ThresholdManager;
  private telemetryService?: TelemetryService;
  private metricsCollector?: MetricsCollector;
  private diffViewService: DiffViewService;
  private fileTreeBuilder: FileTreeBuilder;
  private diffViewerHelper: DiffViewerHelper;
  private directoryExpansionState: Map<string, boolean> = new Map();

  constructor(
    private readonly _extensionUri: vscode.Uri,
    metricsRepository: MetricsRepository,
    configRepository: ConfigRepository,
    thresholdManager: ThresholdManager,
    telemetryService?: TelemetryService,
    metricsCollector?: MetricsCollector
  ) {
    this.metricsRepository = metricsRepository;
    this.configRepository = configRepository;
    this.thresholdManager = thresholdManager;
    this.telemetryService = telemetryService;
    this.metricsCollector = metricsCollector;
    this.diffViewService = new DiffViewService();
    this.fileTreeBuilder = new FileTreeBuilder();
    this.diffViewerHelper = new DiffViewerHelper();
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: vscode.WebviewViewResolveContext,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    // BUG #4 FIX: Enable retainContextWhenHidden to preserve webview state (including scroll)
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    // BUG #4 FIX: Set retainContextWhenHidden on the view itself
    // This preserves scroll position and other state when view is hidden
    (webviewView as any).retainContextWhenHidden = true;

    webviewView.webview.html = getDashboardHtml(webviewView.webview, this._extensionUri);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async data => {
      switch (data.type) {
        case 'refresh':
          // User-triggered refresh should be immediate (bypass debouncing)
          await this.refresh(true);
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
        case 'viewDiff':
          await this.handleViewDiff(data.filePath);
          break;
        case 'toggleDirectory':
          this.handleToggleDirectory(data.path);
          await this.refresh();
          break;
      }
    });

    // Initial data load
    this.refresh();
  }

  // BUG #3 FIX: Debounce dashboard refresh to prevent excessive queries
  private refreshDebounceTimer: NodeJS.Timeout | undefined;
  private readonly REFRESH_DEBOUNCE_MS = 3000; // 3-5 seconds as validated
  private refreshCallCount = 0; // Debug counter

  public async refresh(forceHtmlUpdate: boolean = false) {
    if (!this._view) {
      return;
    }

    // BUG #3 FIX: Immediate refresh for user-triggered actions (force update)
    if (forceHtmlUpdate) {
      await this.refreshImmediate(forceHtmlUpdate);
      return;
    }

    // BUG #3 FIX: Debounced refresh for automatic updates
    if (this.refreshDebounceTimer) {
      clearTimeout(this.refreshDebounceTimer);
    }

    this.refreshDebounceTimer = setTimeout(() => {
      this.refreshImmediate(forceHtmlUpdate);
      this.refreshDebounceTimer = undefined;
    }, this.REFRESH_DEBOUNCE_MS);
  }

  // BUG #3 FIX: Immediate refresh (bypasses debouncing)
  private async refreshImmediate(forceHtmlUpdate: boolean = false) {
    if (!this._view) {
      return;
    }

    // BUG #3 FIX: Track refresh count to detect infinite refresh loops
    this.refreshCallCount++;
    if (this.refreshCallCount > 100) {
      console.error('[DashboardProvider] Possible infinite refresh loop detected! Refresh count:', this.refreshCallCount);
      // Don't return - still allow refresh, but log the warning
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
      const threshold = this.thresholdManager.getConfig();
      const config = await this.configRepository.getUserConfig();

      // Calculate and get today's metrics in one call (avoid double query)
      const todayMetrics = await this.metricsRepository.calculateDailyMetrics(today) || this.getEmptyMetrics(today);

      // Get yesterday's metrics for empty state continuity
      const yesterdayMetrics = await this.metricsRepository.getYesterdayMetrics();

      // Get last 7 days metrics
      const last7Days = await this.getLast7DaysMetrics();

      const toolBreakdown = await this.getToolBreakdown(today);

      // Get coding modes breakdown
      const codingModes = await this.getCodingModes(today);

      // Get trends
      const trends = this.calculateTrends(last7Days);

      // Get snooze state
      const snoozeState = await this.configRepository.getSnoozeState();

      // Calculate streak (balanced usage days)
      const streakDays = await this.metricsRepository.calculateStreakDays(config.experienceLevel);

      // Get review quality data
      const unreviewedFiles = await this.metricsRepository.getUnreviewedFiles(today);
      const terminalReviewedFiles = await this.metricsRepository.getTerminalReviewedFiles(today);
      const agentSessions = await this.metricsRepository.getRecentAgentSessions(5);

      // Get workspace info
      const workspace = this.getWorkspaceInfo();

      // Get core metrics for improved dashboard
      const coreMetrics = await this.metricsRepository.getCoreMetrics(config.experienceLevel, threshold);

      // NEW: Prepare file tree data
      const fileTreeData = await this.prepareFileTreeData(today);

      const data = {
        today: todayMetrics,
        yesterday: yesterdayMetrics,
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
        coreMetrics,
        // NEW: File tree data
        fileTree: fileTreeData.fileTree,
        fileTreeStats: fileTreeData.fileTreeStats
      };

      return data;
    } catch (error) {
      console.error('CodePause: Error loading dashboard data:', error);
      throw error;
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
      // AGENT MODE FIX: Count total AI activity (additions + deletions), not just additions
      const lines = event.linesOfCode || 0;
      const totalAIActivity = (event.linesOfCode || 0) + (event.linesRemoved || 0);

      // CRITICAL FIX: Skip manual code events - they should NOT be counted in AI coding modes
      // Manual code is tracked separately in the manual vs AI metrics
      if (event.source === 'manual') {
        continue;
      }

      // Check if this is from an AI agent (Claude Code, etc.) vs user chat/paste
      // Indicators of agent mode:
      // - agentSessionId is set (from agent session tracking)
      // - isAgentGenerated flag is true (in event or metadata)
      // - tool is 'claude-code' or similar
      // NOTE: isAgentMode is checked separately in the if-condition below
      // NOTE: Do NOT use event.source === 'ai' here - inline completions also have source='ai'
      const isFromAgent = event.agentSessionId ||
                          (event as any).isAgentGenerated ||
                          (metadata as any)?.isAgentGenerated ||
                          event.tool === 'claude-code';

      // CRITICAL: Check detectionMethod FIRST - it has absolute priority
      // This ensures correct categorization even for old events with wrong flags

      // Inline Autocomplete: Real-time suggestions (Copilot, Cursor inline)
      if (detectionMethod === 'inline-completion-api' || event.eventType === 'suggestion-accepted') {
        modes.inline.lines += lines;
        modes.inline.events++;
        if (event.eventType === 'suggestion-accepted') {
          modes.inline.acceptances++;
          if (event.acceptanceTimeDelta && event.acceptanceTimeDelta < 2000) {
            modes.inline.quickAcceptances++;
          }
        }
      }
      // Agent Mode: Large AI completions in OPEN files (Gravity fast mode, etc.)
      // OR files modified while closed by AI agents
      else if (detectionMethod === 'large-paste' && event.fileWasOpen !== false) {
        modes.agent.lines += totalAIActivity;
        modes.agent.events++;
      }
      // Chat/Paste Mode: Large code blocks in CLOSED files (manual paste from ChatGPT web, etc.)
      else if (detectionMethod === 'large-paste') {
        modes.chatPaste.lines += lines;
        modes.chatPaste.events++;
      }
      // Agent Mode: Files modified while closed OR from AI agent tools
      else if (detectionMethod === 'external-file-change' ||
               metadata?.closedFileModification ||
               event.isAgentMode ||
               isFromAgent) {
        modes.agent.lines += totalAIActivity; // Use totalAIActivity to include deletions
        modes.agent.events++;
      }
      // Change-velocity detection is MEDIUM confidence - don't count it as a specific mode
      // It was already filtered out by not being emitted (in UnifiedAITracker)
      // If somehow it got into the DB, it's better to ignore it than misclassify it
      // Fallback: Unknown AI detection method, assume agent mode
      // (Should rarely hit this - indicates missing detection method on AI event)
      else if (lines > 0) {
        modes.agent.lines += totalAIActivity; // CONSISTENCY FIX: Use totalAIActivity like the main agent mode branch
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

      // Get actual review time from FileReviewSessionTracker if available
      let actualReviewTime: number | undefined = undefined;
      if (this.metricsCollector) {
        const fileReviewSessionTracker = this.metricsCollector.getFileReviewSessionTracker();
        if (fileReviewSessionTracker) {
          const session = fileReviewSessionTracker.getSession(filePath);
          if (session && session.totalTimeInFocus > 0) {
            // Use the actual time the user spent reviewing the file
            actualReviewTime = session.totalTimeInFocus;
          }
        }
      }

      // Update the file review status to mark as reviewed with MANUAL method
      // This distinguishes from automatic review detection
      // Pass actualReviewTime so manual reviews contribute to average review time
      await this.metricsRepository.markFileAsReviewed(
        filePath,
        tool,
        today,
        config.experienceLevel,
        'manual', // NEW: Mark as manually reviewed (user clicked button)
        actualReviewTime // CRITICAL: Include actual time spent reviewing
      );

      // CRITICAL FIX: Update the in-memory cache to reflect the reviewed status
      // This prevents stale cache from being used in subsequent event processing
      // Without this, existingStatus would return stale data when next event arrives
      if (this.metricsCollector) {
        const fileReviewTracker = this.metricsCollector.getFileReviewTracker();
        if (fileReviewTracker) {
          const existingStatus = fileReviewTracker.getFileStatus(filePath, today, tool as any);
          if (existingStatus) {
            fileReviewTracker.updateFileStatus(filePath, today, tool as any, {
              isReviewed: true,
              reviewScore: 100,
              reviewQuality: 'thorough' as any,
              linesSinceReview: 0,
              lastReviewedAt: Date.now(),
              totalReviewTime: actualReviewTime // Also update cache with actual review time
            });
          } else {
            // Create cache entry if none exists (e.g., after extension reload)
            fileReviewTracker.trackFile({
              filePath: filePath,
              date: today,
              tool: tool as any,
              reviewQuality: 'thorough' as any,
              reviewScore: 100,
              isReviewed: true,
              linesGenerated: 0,
              linesChanged: 0,
              linesSinceReview: 0,
              charactersCount: 0,
              isAgentGenerated: true,
              wasFileOpen: true,
              firstGeneratedAt: Date.now(),
              lastReviewedAt: Date.now(),
              totalReviewTime: 0,
              modificationCount: 0,
              totalTimeInFocus: 0,
              scrollEventCount: 0,
              cursorMovementCount: 0,
              editsMade: false,
              reviewSessionsCount: 1,
              reviewedInTerminal: false
            });
          }
        }
      }

      // Get session data from FileReviewSessionTracker if available
      const sessionTracker = this.metricsCollector?.getFileReviewSessionTracker();
      const session = sessionTracker?.getSession(filePath);

      // Track telemetry event for manual review with session data
      this.telemetryService?.track('file.reviewed', {
        method: 'manual',
        triggeredBy: 'user',
        ...(session && {
          timeInFocus: session.totalTimeInFocus,
          reviewScore: session.currentReviewScore,
          reviewQuality: session.currentReviewQuality
        })
      });

      const fileName = filePath.split('/').pop();
      vscode.window.showInformationMessage(`Marked ${fileName} as reviewed`);
    } catch (error) {
      console.error('[CodePause] Mark as reviewed error:', error);
      vscode.window.showErrorMessage(`Failed to mark file as reviewed`);
    }
  }

  /**
   * Handle view diff request
   */
  private async handleViewDiff(filePath: string): Promise<void> {
    try {
      await this.diffViewerHelper.openDiff(filePath);
    } catch (error) {
      console.error('[CodePause] View diff error:', error);
      vscode.window.showErrorMessage(`Failed to open diff: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Handle directory toggle request
   */
  private handleToggleDirectory(path: string): void {
    const currentState = this.directoryExpansionState.get(path);
    // Default is expanded (true), so toggle to collapsed (false) if not set
    this.directoryExpansionState.set(path, currentState === undefined ? false : !currentState);
  }

  /**
   * Prepare file tree data for dashboard
   */
  private async prepareFileTreeData(date: string): Promise<{
    fileTree: FileTreeNode;
    fileTreeStats: DiffStatistics;
  }> {
    // Get unreviewed files
    const allUnreviewedFiles = await this.metricsRepository.getUnreviewedFiles(date);

    // FIX: Filter out files that weren't actually modified today
    // Check: has changes AND timestamp is within today
    const dayStart = new Date(date + 'T00:00:00.000Z').getTime();
    const dayEnd = dayStart + 86399999;

    const unreviewedFiles = allUnreviewedFiles.filter(file => {
      const hasChanges = (file.linesAdded || 0) > 0 || (file.linesRemoved || 0) > 0;
      if (!hasChanges) {
        return false;
      }
      const timestamp = file.firstGeneratedAt || 0;
      return timestamp >= dayStart && timestamp <= dayEnd;
    });

    // Get workspace root
    const workspaceRoot = this.getWorkspaceInfo().path || '';

    // Build file tree with current expansion state
    const fileTree = this.fileTreeBuilder.build(
      unreviewedFiles,
      this.directoryExpansionState,
      workspaceRoot
    );

    // Calculate statistics
    const fileTreeStats = this.diffViewService.calculateStatistics(unreviewedFiles);

    return { fileTree, fileTreeStats };
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

  /**
   * Clean up resources
   */
  public dispose(): void {
    this.diffViewerHelper.dispose();
  }
}
