/**
 * OnboardingManager
 * Orchestrates the first-run experience for new users
 *
 * Features:
 * - Modern webview-based onboarding
 * - Experience level selection (Junior/Mid/Senior)
 * - Interactive multi-step setup
 * - Dashboard preview option
 * - Skip functionality for power users
 */

import * as vscode from 'vscode';
import { ConfigManager } from '../config/ConfigManager';
import { DeveloperLevel } from '../types';

export class OnboardingManager {
  private context: vscode.ExtensionContext;
  private configManager: ConfigManager;
  private panel: vscode.WebviewPanel | null = null;

  constructor(context: vscode.ExtensionContext, configManager: ConfigManager) {
    this.context = context;
    this.configManager = configManager;
  }

  /**
   * Check if user needs onboarding
   */
  async needsOnboarding(): Promise<boolean> {
    const completed = this.context.globalState.get<boolean>('onboarding.completed', false);
    const skipped = this.context.globalState.get<boolean>('onboarding.skipped', false);

    // If skipped, don't show again unless manually restarted
    return !completed && !skipped;
  }

  /**
   * Start onboarding flow with modern webview
   */
  async start(): Promise<void> {
    try {
      // Create or show webview panel
      if (this.panel) {
        this.panel.reveal();
        return;
      }

      this.panel = vscode.window.createWebviewPanel(
        'codePauseOnboarding',
        'CodePause Setup',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: []
        }
      );

      this.panel.webview.html = this.getWebviewContent();

      // Handle messages from webview
      this.panel.webview.onDidReceiveMessage(
        async (message) => {
          switch (message.command) {
            case 'complete':
              await this.handleComplete(message.data);
              break;
            case 'skip':
              await this.handleSkip();
              break;
            case 'openDashboard':
              await vscode.commands.executeCommand('codePause.openDashboard');
              this.panel?.dispose();
              break;
          }
        },
        undefined,
        this.context.subscriptions
      );

      this.panel.onDidDispose(() => {
        this.panel = null;
      });
    } catch (error) {
      console.error('[CodePause] Onboarding error:', error);
      vscode.window.showErrorMessage(
        'CodePause onboarding encountered an error. You can restart it later with: Ctrl+Shift+P → "CodePause: Start Onboarding"'
      );
    }
  }

  /**
   * Handle onboarding completion
   */
  private async handleComplete(data: { experienceLevel: DeveloperLevel }): Promise<void> {
    try {
      // Save experience level
      if (data.experienceLevel) {
        await this.configManager.setExperienceLevel(data.experienceLevel);
      }

      // Mark as completed
      await this.context.globalState.update('onboarding.completed', true);
      await this.context.globalState.update('onboarding.completedAt', Date.now());
      await this.context.globalState.update('onboarding.skipped', false);

      // Close panel
      this.panel?.dispose();

      // Show success notification
      vscode.window.showInformationMessage(
        '✅ Setup complete! CodePause is now tracking in the background.',
        'Open Dashboard'
      ).then(action => {
        if (action === 'Open Dashboard') {
          vscode.commands.executeCommand('codePause.openDashboard');
        }
      });
    } catch (error) {
      console.error('[CodePause] Failed to complete onboarding:', error);
      vscode.window.showErrorMessage('Failed to save onboarding preferences');
    }
  }

  /**
   * Handle onboarding skip
   */
  private async handleSkip(): Promise<void> {
    await this.context.globalState.update('onboarding.skipped', true);
    await this.context.globalState.update('onboarding.skippedAt', Date.now());
    await this.context.globalState.update('onboarding.completed', false);

    this.panel?.dispose();

    vscode.window.showInformationMessage(
      'Onboarding skipped. You can restart anytime from the command palette.',
      'Got it'
    );
  }

  /**
   * Get modern webview HTML content
   */
  private getWebviewContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CodePause Setup</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            padding: 0;
            line-height: 1.5;
            overflow: hidden;
        }

        .container {
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* Minimal Header */
        .header {
            padding: 32px;
            background: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-sideBar-border);
        }

        .header-title {
            font-size: 24px;
            font-weight: 600;
            color: var(--vscode-foreground);
            margin-bottom: 4px;
        }

        .header-subtitle {
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
        }

        /* Progress Bar */
        .progress {
            display: flex;
            align-items: center;
            padding: 20px 32px;
            gap: 16px;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-widget-border);
        }

        .progress-steps {
            display: flex;
            gap: 8px;
            flex: 1;
        }

        .progress-step {
            flex: 1;
            height: 3px;
            background: var(--vscode-widget-border);
            border-radius: 2px;
            transition: background 0.3s ease;
        }

        .progress-step.active {
            background: var(--vscode-button-background);
        }

        .progress-text {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            font-variant-numeric: tabular-nums;
        }

        /* Content Area */
        .content {
            flex: 1;
            overflow-y: auto;
            padding: 40px 32px;
        }

        .step {
            display: none;
            max-width: 640px;
            margin: 0 auto;
        }

        .step.active {
            display: block;
            animation: fadeIn 0.3s ease-out;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
        }

        h2 {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 12px;
            color: var(--vscode-foreground);
        }

        .description {
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 32px;
            line-height: 1.6;
        }

        /* Feature List */
        .feature-list {
            display: flex;
            flex-direction: column;
            gap: 16px;
            margin-bottom: 32px;
        }

        .feature-item {
            display: flex;
            gap: 16px;
            padding: 16px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 6px;
        }

        .feature-icon {
            width: 20px;
            height: 20px;
            flex-shrink: 0;
            color: var(--vscode-button-foreground);
        }

        .feature-content {
            flex: 1;
        }

        .feature-title {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 4px;
        }

        .feature-desc {
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
            line-height: 1.5;
        }

        /* Privacy Section */
        .privacy-section {
            padding: 16px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 6px;
            margin-bottom: 24px;
        }

        .privacy-title {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .privacy-desc {
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
            line-height: 1.5;
        }

        /* Level Selection */
        .level-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .level-option {
            padding: 16px;
            background: var(--vscode-input-background);
            border: 2px solid var(--vscode-widget-border);
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .level-option:hover {
            border-color: var(--vscode-button-background);
        }

        .level-option.selected {
            border-color: var(--vscode-button-background);
            background: var(--vscode-list-hoverBackground);
        }

        .level-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 6px;
        }

        .level-title {
            font-size: 15px;
            font-weight: 600;
        }

        .level-years {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .level-detail {
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
            line-height: 1.5;
        }

        /* Success State */
        .success-content {
            text-align: center;
            padding: 32px 0;
        }

        .success-icon {
            width: 48px;
            height: 48px;
            margin: 0 auto 16px;
            color: #4ec9b0;
        }

        .success-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 8px;
        }

        .success-desc {
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 32px;
        }

        .info-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            margin-bottom: 24px;
        }

        .info-item {
            padding: 16px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 6px;
            text-align: center;
        }

        .info-item-title {
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 4px;
        }

        .info-item-desc {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        /* Buttons */
        .buttons {
            display: flex;
            gap: 12px;
            padding: 24px 32px;
            border-top: 1px solid var(--vscode-widget-border);
            background: var(--vscode-editor-background);
        }

        button {
            padding: 10px 20px;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
            font-family: var(--vscode-font-family);
            border: none;
        }

        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            margin-left: auto;
        }

        .btn-primary:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .btn-secondary {
            background: transparent;
            color: var(--vscode-foreground);
            border: 1px solid var(--vscode-widget-border);
        }

        .btn-secondary:hover {
            background: var(--vscode-list-hoverBackground);
        }

        /* Scrollbar */
        ::-webkit-scrollbar {
            width: 10px;
        }

        ::-webkit-scrollbar-track {
            background: transparent;
        }

        ::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-background);
            border-radius: 5px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-hoverBackground);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-title">CodePause Setup</div>
            <div class="header-subtitle">AI usage tracking for developers</div>
        </div>

        <div class="progress">
            <div class="progress-steps">
                <div class="progress-step active" id="progress1"></div>
                <div class="progress-step" id="progress2"></div>
                <div class="progress-step" id="progress3"></div>
            </div>
            <div class="progress-text" id="progressText">Step 1 of 3</div>
        </div>

        <div class="content">
            <!-- Step 1: Welcome -->
            <div class="step active" id="step1">
                <h2>Welcome</h2>
                <p class="description">
                    CodePause helps you maintain code ownership while using AI assistants like Copilot, Cursor, and Claude Code.
                </p>

                <div class="feature-list">
                    <div class="feature-item">
                        <svg class="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 20V10M18 20V4M6 20v-4"/>
                        </svg>
                        <div class="feature-content">
                            <div class="feature-title">Real-time Tracking</div>
                            <div class="feature-desc">Monitor your AI usage patterns and review quality</div>
                        </div>
                    </div>

                    <div class="feature-item">
                        <svg class="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 6v6l4 2"/>
                        </svg>
                        <div class="feature-content">
                            <div class="feature-title">Smart Alerts</div>
                            <div class="feature-desc">Get notifications when acceptance time is too fast</div>
                        </div>
                    </div>

                    <div class="feature-item">
                        <svg class="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                        </svg>
                        <div class="feature-content">
                            <div class="feature-title">Language Support</div>
                            <div class="feature-desc">Works with 15+ programming languages</div>
                        </div>
                    </div>
                </div>

                <div class="privacy-section">
                    <div class="privacy-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                        Privacy First
                    </div>
                    <div class="privacy-desc">
                        All data stored locally. No code content, no telemetry, no cloud sync.
                    </div>
                </div>
            </div>

            <!-- Step 2: Experience Level -->
            <div class="step" id="step2">
                <h2>Experience Level</h2>
                <p class="description">
                    Select your experience level to set appropriate AI usage thresholds.
                </p>

                <div class="level-list">
                    <div class="level-option" onclick="selectLevel('junior')" data-level="junior">
                        <div class="level-header">
                            <div class="level-title">Junior Developer</div>
                            <div class="level-years">0-2 years</div>
                        </div>
                        <div class="level-detail">Build fundamentals with AI assistance. More lenient thresholds.</div>
                    </div>

                    <div class="level-option selected" onclick="selectLevel('mid')" data-level="mid">
                        <div class="level-header">
                            <div class="level-title">Mid-Level Developer</div>
                            <div class="level-years">2-5 years</div>
                        </div>
                        <div class="level-detail">Balance AI productivity with skill maintenance. Recommended.</div>
                    </div>

                    <div class="level-option" onclick="selectLevel('senior')" data-level="senior">
                        <div class="level-header">
                            <div class="level-title">Senior Developer</div>
                            <div class="level-years">5+ years</div>
                        </div>
                        <div class="level-detail">Maximize AI productivity while maintaining expert judgment.</div>
                    </div>
                </div>
            </div>

            <!-- Step 3: Success -->
            <div class="step" id="step3">
                <div class="success-content">
                    <svg class="success-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    <div class="success-title">Setup Complete</div>
                    <div class="success-desc">CodePause is now tracking your AI usage in the background.</div>
                </div>

                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-item-title">View Dashboard</div>
                        <div class="info-item-desc">Activity bar icon</div>
                    </div>
                    <div class="info-item">
                        <div class="info-item-title">Status Bar</div>
                        <div class="info-item-desc">AI % at a glance</div>
                    </div>
                    <div class="info-item">
                        <div class="info-item-title">Settings</div>
                        <div class="info-item-desc">Cmd+Shift+P</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="buttons">
            <button class="btn-secondary" onclick="skip()" id="skipBtn">Skip</button>
            <button class="btn-primary" onclick="nextStep()" id="nextBtn">Continue</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentStep = 1;
        let selectedLevel = 'mid';

        function showStep(stepNum) {
            document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
            document.getElementById('step' + stepNum).classList.add('active');

            // Update progress bar
            for (let i = 1; i <= 3; i++) {
                const progressEl = document.getElementById('progress' + i);
                if (progressEl) {
                    progressEl.classList.toggle('active', i <= stepNum);
                }
            }

            // Update progress text
            document.getElementById('progressText').textContent = 'Step ' + stepNum + ' of 3';

            // Update buttons
            const skipBtn = document.getElementById('skipBtn');
            const nextBtn = document.getElementById('nextBtn');

            if (stepNum === 3) {
                skipBtn.style.display = 'none';
                nextBtn.textContent = 'Open Dashboard';
                nextBtn.onclick = openDashboard;
            } else {
                skipBtn.style.display = 'block';
                nextBtn.onclick = nextStep;
                nextBtn.textContent = 'Continue';
            }
        }

        function nextStep() {
            if (currentStep < 3) {
                currentStep++;
                showStep(currentStep);
            }
        }

        function selectLevel(level) {
            selectedLevel = level;
            document.querySelectorAll('.level-option').forEach(el => el.classList.remove('selected'));
            document.querySelector('[data-level="' + level + '"]').classList.add('selected');
        }

        function complete() {
            vscode.postMessage({
                command: 'complete',
                data: { experienceLevel: selectedLevel }
            });
        }

        function skip() {
            if (confirm('Skip setup and use default settings?')) {
                vscode.postMessage({ command: 'skip' });
            }
        }

        function openDashboard() {
            complete();
            vscode.postMessage({ command: 'openDashboard' });
        }

        showStep(1);
    </script>
</body>
</html>`;
  }

  /**
   * Reset onboarding (for testing or user-requested restart)
   */
  async reset(): Promise<void> {
    await this.context.globalState.update('onboarding.completed', false);
    await this.context.globalState.update('onboarding.skipped', false);
    await this.context.globalState.update('onboarding.completedAt', undefined);
    await this.context.globalState.update('onboarding.skippedAt', undefined);
  }

  /**
   * Check if onboarding was completed
   */
  async isCompleted(): Promise<boolean> {
    return this.context.globalState.get<boolean>('onboarding.completed', false);
  }

  /**
   * Check if onboarding was skipped
   */
  async wasSkipped(): Promise<boolean> {
    return this.context.globalState.get<boolean>('onboarding.skipped', false);
  }

  /**
   * Get onboarding completion timestamp
   */
  async getCompletionTimestamp(): Promise<number | undefined> {
    return this.context.globalState.get<number>('onboarding.completedAt');
  }
}
