/**
 * SettingsProvider
 * Provides a webview for advanced configuration
 */

import * as vscode from 'vscode';
import { ConfigRepository } from '../storage/ConfigRepository';
import { ThresholdManager } from '../core/ThresholdManager';
import { UserConfig, DeveloperLevel, AlertFrequency, DEFAULT_THRESHOLDS } from '../types';

export class SettingsProvider {
  private panel: vscode.WebviewPanel | null = null;
  private configRepository: ConfigRepository;
  private thresholdManager: ThresholdManager;

  constructor(
    _extensionUri: vscode.Uri,
    configRepository: ConfigRepository,
    thresholdManager: ThresholdManager
  ) {
    this.configRepository = configRepository;
    this.thresholdManager = thresholdManager;
  }

  async show(): Promise<void> {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'codePauseSettings',
      'CodePause Settings',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    this.panel.webview.html = await this.getHtmlForWebview();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(async message => {
      switch (message.type) {
        case 'saveSettings':
          await this.saveSettings(message.data);
          break;
        case 'resetToDefaults':
          await this.resetToDefaults();
          break;
        case 'requestData':
          await this.sendCurrentSettings();
          break;
      }
    });

    // Clean up when panel is closed
    this.panel.onDidDispose(() => {
      this.panel = null;
    });

    // Send initial settings
    await this.sendCurrentSettings();
  }

  private async sendCurrentSettings(): Promise<void> {
    if (!this.panel) {return;}

    const config = await this.configRepository.getUserConfig();
    const thresholds = DEFAULT_THRESHOLDS;

    this.panel.webview.postMessage({
      type: 'updateSettings',
      data: { config, thresholds }
    });
  }

  private async saveSettings(data: UserConfig): Promise<void> {
    try {
      await this.configRepository.saveUserConfig(data);

      // Update threshold manager if level changed
      this.thresholdManager.setLevel(data.experienceLevel);

      vscode.window.showInformationMessage('Settings saved successfully');

      // Refresh settings display
      await this.sendCurrentSettings();
    } catch (error) {
      vscode.window.showErrorMessage('Failed to save settings');
      console.error('Settings save error:', error);
    }
  }

  private async resetToDefaults(): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      'Reset all settings to defaults? This cannot be undone.',
      { modal: true },
      'Reset',
      'Cancel'
    );

    if (confirm !== 'Reset') {
      return;
    }

    const defaultConfig: UserConfig = {
      experienceLevel: DeveloperLevel.Mid,
      blindApprovalThreshold: DEFAULT_THRESHOLDS[DeveloperLevel.Mid].blindApprovalTime,
      alertFrequency: AlertFrequency.Medium,
      enableGamification: true,
      anonymizePaths: true,
      trackedTools: {
        copilot: true,
        cursor: true,
        claudeCode: true
      },
      onboardingCompleted: true
    };

    await this.configRepository.saveUserConfig(defaultConfig);
    await this.sendCurrentSettings();

    vscode.window.showInformationMessage('Settings reset to defaults');
  }

  private async getHtmlForWebview(): Promise<string> {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CodePause Settings</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 24px;
            line-height: 1.6;
        }

        .header {
            margin-bottom: 32px;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 16px;
        }

        h1 {
            font-size: 24px;
            margin-bottom: 8px;
        }

        .subtitle {
            color: var(--vscode-descriptionForeground);
        }

        .section {
            margin-bottom: 32px;
        }

        .section-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .section-description {
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 16px;
        }

        .setting-group {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 16px;
            margin-bottom: 12px;
        }

        .setting-label {
            display: block;
            font-weight: 600;
            margin-bottom: 8px;
        }

        .setting-description {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 12px;
        }

        select, input[type="number"] {
            width: 100%;
            padding: 6px 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            font-family: var(--vscode-font-family);
            font-size: 13px;
        }

        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }

        input[type="checkbox"] {
            width: 20px;
            height: 20px;
        }

        .threshold-info {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-top: 16px;
        }

        .threshold-card {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 12px;
            text-align: center;
        }

        .threshold-card.active {
            border-color: var(--vscode-button-background);
            background-color: var(--vscode-list-hoverBackground);
        }

        .threshold-title {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
            text-transform: uppercase;
        }

        .threshold-value {
            font-size: 20px;
            font-weight: 600;
        }

        .actions {
            display: flex;
            gap: 12px;
            margin-top: 32px;
            padding-top: 16px;
            border-top: 1px solid var(--vscode-panel-border);
        }

        button {
            padding: 8px 16px;
            border: none;
            border-radius: 2px;
            cursor: pointer;
            font-family: var(--vscode-font-family);
            font-size: 13px;
        }

        button.primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        button.primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        button.secondary {
            background-color: transparent;
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-background);
        }

        .info-box {
            background-color: var(--vscode-inputValidation-infoBackground);
            border: 1px solid var(--vscode-inputValidation-infoBorder);
            border-radius: 4px;
            padding: 12px;
            margin-top: 16px;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>⚙️ CodePause Settings</h1>
        <p class="subtitle">Customize your mindful coding experience</p>
    </div>

    <div class="section">
        <div class="section-title">
            <span>👤</span>
            <span>Developer Profile</span>
        </div>
        <div class="section-description">
            Your experience level determines thresholds for AI usage and review times
        </div>

        <div class="setting-group">
            <label class="setting-label">Experience Level</label>
            <p class="setting-description">
                This affects default thresholds and coaching approach
            </p>
            <select id="experienceLevel">
                <option value="junior">Junior Developer (0-2 years)</option>
                <option value="mid">Mid-Level Developer (2-5 years)</option>
                <option value="senior">Senior Developer (5+ years)</option>
            </select>

            <div class="threshold-info" id="thresholdInfo">
                <div class="threshold-card">
                    <div class="threshold-title">Blind Approval</div>
                    <div class="threshold-value">2000ms</div>
                </div>
                <div class="threshold-card">
                    <div class="threshold-title">Max AI %</div>
                    <div class="threshold-value">60%</div>
                </div>
                <div class="threshold-card">
                    <div class="threshold-title">Streak Alert</div>
                    <div class="threshold-value">4</div>
                </div>
            </div>
        </div>
    </div>

    <div class="section">
        <div class="section-title">
            <span>🔔</span>
            <span>Alerts & Notifications</span>
        </div>

        <div class="setting-group">
            <label class="setting-label">Alert Frequency</label>
            <p class="setting-description">
                How often you want to receive coaching alerts
            </p>
            <select id="alertFrequency">
                <option value="low">Low - Minimal interruptions</option>
                <option value="medium">Medium - Balanced coaching</option>
                <option value="high">High - Active guidance</option>
            </select>
        </div>
    </div>

    <div class="section">
        <div class="section-title">
            <span>🎮</span>
            <span>Features</span>
        </div>

        <div class="setting-group">
            <div class="checkbox-group">
                <input type="checkbox" id="enableGamification">
                <label for="enableGamification" class="setting-label" style="margin: 0;">
                    Enable Gamification
                </label>
            </div>
            <p class="setting-description">
                Unlock achievements and track your progression level
            </p>
        </div>

        <div class="setting-group">
            <div class="checkbox-group">
                <input type="checkbox" id="anonymizePaths">
                <label for="anonymizePaths" class="setting-label" style="margin: 0;">
                    Anonymize File Paths
                </label>
            </div>
            <p class="setting-description">
                Store only file extensions, not full paths (recommended for privacy)
            </p>
        </div>
    </div>

    <div class="section">
        <div class="section-title">
            <span>🤖</span>
            <span>Tracked AI Tools</span>
        </div>
        <div class="section-description">
            Choose which AI coding assistants to monitor
        </div>

        <div class="setting-group">
            <div class="checkbox-group">
                <input type="checkbox" id="trackCopilot">
                <label for="trackCopilot">GitHub Copilot</label>
            </div>
            <div class="checkbox-group">
                <input type="checkbox" id="trackCursor">
                <label for="trackCursor">Cursor AI</label>
            </div>
            <div class="checkbox-group">
                <input type="checkbox" id="trackClaudeCode">
                <label for="trackClaudeCode">Claude Code</label>
            </div>
        </div>
    </div>

    <div class="info-box">
        💡 <strong>Tip:</strong> Changes take effect immediately. Some settings may require a window reload.
    </div>

    <div class="actions">
        <button class="primary" onclick="saveSettings()">Save Settings</button>
        <button class="secondary" onclick="resetToDefaults()">Reset to Defaults</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentConfig = null;
        let thresholds = null;

        // Request initial data
        vscode.postMessage({ type: 'requestData' });

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;

            if (message.type === 'updateSettings') {
                currentConfig = message.data.config;
                thresholds = message.data.thresholds;
                loadSettings(currentConfig);
            }
        });

        function loadSettings(config) {
            document.getElementById('experienceLevel').value = config.experienceLevel;
            document.getElementById('alertFrequency').value = config.alertFrequency;
            document.getElementById('enableGamification').checked = config.enableGamification;
            document.getElementById('anonymizePaths').checked = config.anonymizePaths;
            document.getElementById('trackCopilot').checked = config.trackedTools.copilot;
            document.getElementById('trackCursor').checked = config.trackedTools.cursor;
            document.getElementById('trackClaudeCode').checked = config.trackedTools.claudeCode;

            updateThresholdDisplay(config.experienceLevel);
        }

        function updateThresholdDisplay(level) {
            if (!thresholds) return;

            const threshold = thresholds[level];
            const cards = document.querySelectorAll('.threshold-card');

            cards[0].querySelector('.threshold-value').textContent = threshold.blindApprovalTime + 'ms';
            cards[1].querySelector('.threshold-value').textContent = threshold.maxAIPercentage + '%';
            cards[2].querySelector('.threshold-value').textContent = threshold.streakThreshold;
        }

        // Update threshold display when level changes
        document.getElementById('experienceLevel').addEventListener('change', (e) => {
            updateThresholdDisplay(e.target.value);
        });

        function saveSettings() {
            const config = {
                ...currentConfig,
                experienceLevel: document.getElementById('experienceLevel').value,
                alertFrequency: document.getElementById('alertFrequency').value,
                enableGamification: document.getElementById('enableGamification').checked,
                anonymizePaths: document.getElementById('anonymizePaths').checked,
                trackedTools: {
                    copilot: document.getElementById('trackCopilot').checked,
                    cursor: document.getElementById('trackCursor').checked,
                    claudeCode: document.getElementById('trackClaudeCode').checked
                }
            };

            vscode.postMessage({
                type: 'saveSettings',
                data: config
            });
        }

        function resetToDefaults() {
            vscode.postMessage({ type: 'resetToDefaults' });
        }
    </script>
</body>
</html>`;
  }
}
