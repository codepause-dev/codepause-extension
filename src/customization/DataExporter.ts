/**
 * DataExporter
 * Handles data export and import for portability
 */

import * as vscode from 'vscode';
import { MetricsRepository } from '../storage/MetricsRepository';
import { ConfigRepository } from '../storage/ConfigRepository';
import { ExportData } from '../types';
import { safeJsonParse, isValidImportFileSize } from '../utils/SecurityUtils';

export class DataExporter {
  private metricsRepository: MetricsRepository;
  private configRepository: ConfigRepository;

  constructor(
    metricsRepository: MetricsRepository,
    configRepository: ConfigRepository
  ) {
    this.metricsRepository = metricsRepository;
    this.configRepository = configRepository;
  }

  async exportAllData(): Promise<void> {
    try {
      // Get date range for export
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 6); // Last 6 months

      // Collect all data
      const exportData = await this.collectExportData(startDate, endDate);

      // Convert to JSON
      const json = JSON.stringify(exportData, null, 2);

      // Show save dialog
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const uri = await vscode.window.showSaveDialog({
        filters: { 'JSON': ['json'] },
        defaultUri: vscode.Uri.file(`codepause-export-${timestamp}.json`),
        saveLabel: 'Export Data'
      });

      if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf8'));
        vscode.window.showInformationMessage(
          `Data exported successfully to ${uri.fsPath}`
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to export data: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      console.error('Export error:', error);
    }
  }

  async exportMetrics(): Promise<void> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 6);

      const metrics = await this.getMetricsForDateRange(startDate, endDate);

      const exportData = {
        exportDate: new Date().toISOString(),
        dateRange: {
          start: startDate.toISOString().split('T')[0],
          end: endDate.toISOString().split('T')[0]
        },
        metrics,
        summary: this.calculateSummary(metrics)
      };

      const json = JSON.stringify(exportData, null, 2);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const uri = await vscode.window.showSaveDialog({
        filters: { 'JSON': ['json'] },
        defaultUri: vscode.Uri.file(`codepause-metrics-${timestamp}.json`)
      });

      if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf8'));
        vscode.window.showInformationMessage('Metrics exported successfully');
      }
    } catch (error) {
      vscode.window.showErrorMessage('Failed to export metrics');
      console.error('Export error:', error);
    }
  }

  async exportConfiguration(): Promise<void> {
    try {
      const config = await this.configRepository.getUserConfig();
      const achievements = await this.configRepository.getAllAchievements();

      const exportData = {
        exportDate: new Date().toISOString(),
        config,
        achievements: achievements.filter(a => a.unlocked)
      };

      const json = JSON.stringify(exportData, null, 2);

      const uri = await vscode.window.showSaveDialog({
        filters: { 'JSON': ['json'] },
        defaultUri: vscode.Uri.file('codepause-config.json')
      });

      if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf8'));
        vscode.window.showInformationMessage('Configuration exported successfully');
      }
    } catch (error) {
      vscode.window.showErrorMessage('Failed to export configuration');
      console.error('Export error:', error);
    }
  }

  async importData(): Promise<void> {
    try {
      // Show open dialog
      const uris = await vscode.window.showOpenDialog({
        filters: { 'JSON': ['json'] },
        canSelectMany: false,
        openLabel: 'Import Data'
      });

      if (!uris || uris.length === 0) {
        return;
      }

      // Read file
      const fileData = await vscode.workspace.fs.readFile(uris[0]);

      // Security: Check file size (max 10MB)
      if (!isValidImportFileSize(fileData.length)) {
        vscode.window.showErrorMessage('Import file is too large (max 10MB)');
        return;
      }

      const json = Buffer.from(fileData).toString('utf8');

      // Security: Safe JSON parsing with error handling
      const importData = safeJsonParse(json, null);
      if (!importData) {
        vscode.window.showErrorMessage('Failed to parse import file - invalid JSON');
        return;
      }

      // Security: Strict validation of import data
      const validation = this.validateImportData(importData);
      if (!validation.valid) {
        vscode.window.showErrorMessage(`Invalid import file: ${validation.error}`);
        return;
      }

      // Ask for confirmation
      const confirm = await vscode.window.showWarningMessage(
        'Importing data will overwrite your current configuration. Continue?',
        { modal: true },
        'Import',
        'Cancel'
      );

      if (confirm !== 'Import') {
        return;
      }

      // Import configuration if present
      if ((importData as any).config) {
        await this.configRepository.saveUserConfig((importData as any).config);
      }

      // Import achievements if present
      if ((importData as any).achievements) {
        for (const achievement of (importData as any).achievements) {
          if (achievement.unlocked) {
            await this.configRepository.unlockAchievement(achievement.id);
          }
        }
      }

      vscode.window.showInformationMessage(
        'Data imported successfully. Please reload the window for changes to take effect.',
        'Reload Window'
      ).then(selection => {
        if (selection === 'Reload Window') {
          vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
      });
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to import data: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      console.error('Import error:', error);
    }
  }

  async exportToCSV(): Promise<void> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 6);

      const metrics = await this.getMetricsForDateRange(startDate, endDate);

      // Convert to CSV
      const csv = this.metricsToCSV(metrics);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const uri = await vscode.window.showSaveDialog({
        filters: { 'CSV': ['csv'] },
        defaultUri: vscode.Uri.file(`codepause-metrics-${timestamp}.csv`)
      });

      if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(csv, 'utf8'));
        vscode.window.showInformationMessage('Data exported to CSV successfully');
      }
    } catch (error) {
      vscode.window.showErrorMessage('Failed to export to CSV');
      console.error('Export error:', error);
    }
  }

  private async collectExportData(startDate: Date, endDate: Date): Promise<ExportData> {
    const metrics = await this.getMetricsForDateRange(startDate, endDate);
    const config = await this.configRepository.getUserConfig();
    const achievements = await this.configRepository.getAllAchievements();

    return {
      exportDate: new Date().toISOString(),
      dateRange: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      },
      metrics,
      summary: this.calculateSummary(metrics),
      config,
      achievements: achievements.filter(a => a.unlocked)
    } as any;
  }

  private async getMetricsForDateRange(startDate: Date, endDate: Date) {
    const metrics = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const dayMetrics = await this.metricsRepository.getDailyMetrics(dateStr);

      if (dayMetrics) {
        metrics.push(dayMetrics);
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return metrics;
  }

  private calculateSummary(metrics: any[]) {
    if (metrics.length === 0) {
      return {
        totalEvents: 0,
        averageAIPercentage: 0,
        averageReviewTime: 0,
        totalBlindApprovals: 0
      };
    }

    const totalEvents = metrics.reduce((sum, m) => sum + m.totalEvents, 0);
    const totalBlindApprovals = metrics.reduce((sum, m) => sum + m.blindApprovalCount, 0);

    const avgAIPercentage = metrics.reduce((sum, m) => sum + m.aiPercentage, 0) / metrics.length;
    const avgReviewTime = metrics.reduce((sum, m) => sum + m.averageReviewTime, 0) / metrics.length;

    return {
      totalEvents,
      averageAIPercentage: Math.round(avgAIPercentage * 100) / 100,
      averageReviewTime: Math.round(avgReviewTime),
      totalBlindApprovals
    };
  }

  private metricsToCSV(metrics: any[]): string {
    const headers = [
      'Date',
      'Total Events',
      'AI Percentage',
      'Acceptance Rate',
      'Average Review Time (ms)',
      'Blind Approvals',
      'Sessions'
    ];

    const rows = metrics.map(m => [
      m.date,
      m.totalEvents,
      m.aiPercentage.toFixed(2),
      m.acceptanceRate.toFixed(2),
      m.averageReviewTime.toFixed(0),
      m.blindApprovalCount,
      m.sessionCount
    ]);

    return [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
  }

  private validateImportData(data: any): { valid: boolean; error?: string } {
    // Security: Comprehensive validation of imported data

    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Data must be an object' };
    }

    // Must have at least one valid data type
    if (!data.config && !data.achievements && !data.metrics) {
      return { valid: false, error: 'Must contain config, achievements, or metrics' };
    }

    // Validate config if present
    if (data.config) {
      if (typeof data.config !== 'object') {
        return { valid: false, error: 'Config must be an object' };
      }

      // Validate experience level enum
      const validLevels = ['junior', 'mid', 'senior'];
      if (data.config.experienceLevel !== undefined && !validLevels.includes(data.config.experienceLevel)) {
        return { valid: false, error: 'Invalid experience level' };
      }

      // Validate alert frequency enum
      const validFrequencies = ['low', 'medium', 'high'];
      if (data.config.alertFrequency !== undefined && !validFrequencies.includes(data.config.alertFrequency)) {
        return { valid: false, error: 'Invalid alert frequency' };
      }

      // Validate boolean fields
      if (data.config.enableGamification !== undefined && typeof data.config.enableGamification !== 'boolean') {
        return { valid: false, error: 'enableGamification must be boolean' };
      }

      if (data.config.anonymizePaths !== undefined && typeof data.config.anonymizePaths !== 'boolean') {
        return { valid: false, error: 'anonymizePaths must be boolean' };
      }

      // Validate numeric threshold
      if (data.config.blindApprovalThreshold !== undefined) {
        // Reject non-number types explicitly (including strings)
        if (typeof data.config.blindApprovalThreshold !== 'number') {
          return { valid: false, error: 'Blind approval threshold must be a number' };
        }
        const threshold = data.config.blindApprovalThreshold;
        if (!Number.isFinite(threshold) || threshold < 0 || threshold > 10000) {
          return { valid: false, error: 'Invalid blind approval threshold (must be 0-10000)' };
        }
      }
    }

    // Validate achievements if present
    if (data.achievements) {
      if (!Array.isArray(data.achievements)) {
        return { valid: false, error: 'Achievements must be an array' };
      }

      // Limit number of achievements (prevent DoS)
      if (data.achievements.length > 100) {
        return { valid: false, error: 'Too many achievements (max 100)' };
      }

      for (const achievement of data.achievements) {
        if (!achievement.id || typeof achievement.id !== 'string') {
          return { valid: false, error: 'Achievement must have string ID' };
        }

        // Sanitize ID (prevent XSS)
        if (achievement.id.length > 100 || /[<>"]/.test(achievement.id)) {
          return { valid: false, error: 'Invalid achievement ID format' };
        }
      }
    }

    // Validate metrics if present
    if (data.metrics) {
      if (!Array.isArray(data.metrics)) {
        return { valid: false, error: 'Metrics must be an array' };
      }

      // Limit number of metrics records (prevent DoS)
      if (data.metrics.length > 365) {
        return { valid: false, error: 'Too many metrics records (max 365 days)' };
      }
    }

    return { valid: true };
  }

  async showExportDialog(): Promise<void> {
    const options = [
      { label: 'Export All Data', description: 'Configuration, metrics, and achievements' },
      { label: 'Export Metrics Only', description: 'Last 6 months of usage data' },
      { label: 'Export Configuration', description: 'Settings and unlocked achievements' },
      { label: 'Export to CSV', description: 'Metrics in CSV format for spreadsheets' }
    ];

    const selected = await vscode.window.showQuickPick(options, {
      placeHolder: 'What would you like to export?'
    });

    if (!selected) {
      return;
    }

    switch (selected.label) {
      case 'Export All Data':
        await this.exportAllData();
        break;
      case 'Export Metrics Only':
        await this.exportMetrics();
        break;
      case 'Export Configuration':
        await this.exportConfiguration();
        break;
      case 'Export to CSV':
        await this.exportToCSV();
        break;
    }
  }
}
