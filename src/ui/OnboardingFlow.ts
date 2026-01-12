/**
 * OnboardingFlow
 * Guides first-time users through initial setup and configuration
 */

import * as vscode from 'vscode';
import { ConfigRepository } from '../storage/ConfigRepository';
import { DeveloperLevel, UserConfig } from '../types';

export class OnboardingFlow {
  private configRepository: ConfigRepository;
  private panel: vscode.WebviewPanel | null = null;

  constructor(configRepository: ConfigRepository) {
    this.configRepository = configRepository;
  }

  async start(context: vscode.ExtensionContext): Promise<void> {
    // Check if already completed
    const config = await this.configRepository.getUserConfig();
    if (config.onboardingCompleted) {
      const restart = await vscode.window.showInformationMessage(
        'You have already completed onboarding. Would you like to restart it?',
        'Yes',
        'No'
      );

      if (restart !== 'Yes') {
        return;
      }
    }

    // Create webview panel
    this.panel = vscode.window.createWebviewPanel(
      'codePauseOnboarding',
      'CodePause Setup',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    this.panel.webview.html = this.getOnboardingHtml();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      async message => {
        switch (message.type) {
          case 'complete':
            await this.completeOnboarding(message.data);
            break;
          case 'skip':
            await this.skipOnboarding();
            break;
        }
      },
      undefined,
      context.subscriptions
    );
  }

  private async completeOnboarding(data: {
    experienceLevel: DeveloperLevel;
    enableGamification: boolean;
    alertFrequency: string;
  }): Promise<void> {
    try {
      // Get current config
      const config = await this.configRepository.getUserConfig();

      // Update with user choices
      const updatedConfig: UserConfig = {
        ...config,
        experienceLevel: data.experienceLevel,
        enableGamification: data.enableGamification,
        alertFrequency: data.alertFrequency as any,
        onboardingCompleted: true
      };

      // Save config (will save to global state via configRepository)
      await this.configRepository.saveUserConfig(updatedConfig);
      await this.configRepository.completeOnboarding();

      // Close onboarding panel first
      if (this.panel) {
        this.panel.dispose();
        this.panel = null;
      }

      // Show brief success message
      vscode.window.showInformationMessage(
        'CodePause is ready! Start coding and we\'ll help you maintain balanced AI usage.'
      );

      // Automatically open dashboard
      await vscode.commands.executeCommand('codePause.openDashboard');
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      vscode.window.showErrorMessage('Failed to save onboarding preferences');
    }
  }

  private async skipOnboarding(): Promise<void> {
    try {
      // Mark as completed with defaults
      await this.configRepository.completeOnboarding();

      vscode.window.showInformationMessage(
        'CodePause is ready with default settings. You can customize later in settings.'
      );

      // Close panel
      if (this.panel) {
        this.panel.dispose();
        this.panel = null;
      }
    } catch (error) {
      console.error('Failed to skip onboarding:', error);
    }
  }

  private getOnboardingHtml(): string {
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
            background-color: var(--vscode-editor-background);
            padding: 32px;
            line-height: 1.6;
        }

        .container {
            max-width: 600px;
            margin: 0 auto;
        }

        .step {
            display: none;
            animation: fadeIn 0.3s;
        }

        .step.active {
            display: block;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        h1 {
            font-size: 32px;
            margin-bottom: 16px;
            text-align: center;
        }

        .logo {
            text-align: center;
            font-size: 64px;
            margin-bottom: 24px;
        }

        p {
            margin-bottom: 16px;
            color: var(--vscode-descriptionForeground);
        }

        .highlight {
            background-color: var(--vscode-input-background);
            border-left: 3px solid var(--vscode-button-background);
            padding: 16px;
            margin: 24px 0;
            border-radius: 4px;
        }

        .option-group {
            margin: 24px 0;
        }

        .option-label {
            display: block;
            margin-bottom: 12px;
            font-weight: 600;
        }

        .radio-group {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .radio-option {
            background-color: var(--vscode-input-background);
            border: 2px solid transparent;
            border-radius: 4px;
            padding: 16px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .radio-option:hover {
            border-color: var(--vscode-button-background);
        }

        .radio-option.selected {
            border-color: var(--vscode-button-background);
            background-color: var(--vscode-list-hoverBackground);
        }

        .radio-option input[type="radio"] {
            margin-right: 8px;
        }

        .option-title {
            font-weight: 600;
            margin-bottom: 4px;
        }

        .option-description {
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
        }

        .checkbox-option {
            display: flex;
            align-items: center;
            background-color: var(--vscode-input-background);
            border-radius: 4px;
            padding: 16px;
            margin: 12px 0;
        }

        .checkbox-option input[type="checkbox"] {
            margin-right: 12px;
            width: 20px;
            height: 20px;
        }

        .checkbox-label {
            flex: 1;
        }

        .buttons {
            display: flex;
            gap: 12px;
            margin-top: 32px;
            justify-content: space-between;
        }

        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 14px;
            font-family: var(--vscode-font-family);
        }

        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        button.secondary {
            background-color: transparent;
            border: 1px solid var(--vscode-button-background);
            color: var(--vscode-button-background);
        }

        .progress {
            display: flex;
            justify-content: center;
            gap: 8px;
            margin-bottom: 32px;
        }

        .progress-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background-color: var(--vscode-input-background);
        }

        .progress-dot.active {
            background-color: var(--vscode-button-background);
        }

        .features-list {
            list-style: none;
            margin: 24px 0;
        }

        .features-list li {
            padding: 8px 0;
            padding-left: 28px;
            position: relative;
        }

        .features-list li:before {
            content: "✓";
            position: absolute;
            left: 0;
            color: var(--vscode-button-background);
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="progress">
            <div class="progress-dot active" id="dot1"></div>
            <div class="progress-dot" id="dot2"></div>
            <div class="progress-dot" id="dot3"></div>
        </div>

        <!-- Step 1: Welcome -->
        <div class="step active" id="step1">
            <div class="logo">🧘‍♂️</div>
            <h1>Welcome to CodePause</h1>
            <p style="text-align: center; font-size: 16px; margin-bottom: 32px;">
                Track and improve your AI coding habits with intelligent alerts and gamification
            </p>

            <div class="highlight">
                <h3 style="margin-bottom: 12px;">🛡️ Privacy First</h3>
                <p style="color: var(--vscode-foreground); margin-bottom: 0;">
                    All your data stays 100% local on your machine. We never collect, store, or transmit
                    your code or metrics to any server. CodePause is a personal coaching tool, not a surveillance system.
                </p>
            </div>

            <h3 style="margin: 24px 0 12px 0;">What CodePause does:</h3>
            <ul class="features-list">
                <li>Tracks your AI tool usage across Copilot, Cursor, and Claude Code</li>
                <li>Detects when you might be accepting suggestions too quickly</li>
                <li>Provides gentle coaching to maintain balanced AI usage</li>
                <li>Shows insights about your coding patterns and trends</li>
                <li>Rewards thoughtful development with achievements</li>
            </ul>

            <p style="margin-top: 24px;">
                Research shows that <strong>balanced AI usage</strong> helps maintain critical thinking skills
                and long-term productivity. Let's set up CodePause for your needs!
            </p>

            <div class="buttons">
                <button class="secondary" onclick="skip()">Skip Setup</button>
                <button onclick="nextStep()">Let's Get Started →</button>
            </div>
        </div>

        <!-- Step 2: Experience Level -->
        <div class="step" id="step2">
            <h1>What's your experience level?</h1>
            <p style="text-align: center;">
                This helps us set appropriate thresholds for review time and AI usage percentage
            </p>

            <div class="option-group">
                <div class="radio-group">
                    <label class="radio-option" onclick="selectLevel('junior')">
                        <input type="radio" name="level" value="junior">
                        <div>
                            <div class="option-title">🌱 Junior Developer (0-2 years)</div>
                            <div class="option-description">
                                More lenient thresholds. Encourages learning from AI suggestions while building fundamentals.
                            </div>
                        </div>
                    </label>

                    <label class="radio-option" onclick="selectLevel('mid')">
                        <input type="radio" name="level" value="mid" checked>
                        <div>
                            <div class="option-title">🚀 Mid-Level Developer (2-5 years)</div>
                            <div class="option-description">
                                Balanced thresholds. Helps maintain skills while leveraging AI for productivity.
                            </div>
                        </div>
                    </label>

                    <label class="radio-option" onclick="selectLevel('senior')">
                        <input type="radio" name="level" value="senior">
                        <div>
                            <div class="option-title">⭐ Senior Developer (5+ years)</div>
                            <div class="option-description">
                                Stricter thresholds. Maximizes AI productivity while maintaining expert judgment.
                            </div>
                        </div>
                    </label>
                </div>
            </div>

            <div class="buttons">
                <button class="secondary" onclick="prevStep()">← Back</button>
                <button onclick="nextStep()">Continue →</button>
            </div>
        </div>

        <!-- Step 3: Preferences -->
        <div class="step" id="step3">
            <h1>Customize Your Experience</h1>
            <p style="text-align: center;">Choose how CodePause coaches you</p>

            <div class="option-group">
                <label class="option-label">Alert Frequency</label>
                <div class="radio-group">
                    <label class="radio-option" onclick="selectFrequency('low')">
                        <input type="radio" name="frequency" value="low">
                        <div>
                            <div class="option-title">Low - Minimal Interruptions</div>
                            <div class="option-description">Occasional tips and insights</div>
                        </div>
                    </label>

                    <label class="radio-option" onclick="selectFrequency('medium')">
                        <input type="radio" name="frequency" value="medium" checked>
                        <div>
                            <div class="option-title">Medium - Balanced Coaching (Recommended)</div>
                            <div class="option-description">Regular gentle nudges and educational moments</div>
                        </div>
                    </label>

                    <label class="radio-option" onclick="selectFrequency('high')">
                        <input type="radio" name="frequency" value="high">
                        <div>
                            <div class="option-title">High - Active Guidance</div>
                            <div class="option-description">Frequent coaching for maximum awareness</div>
                        </div>
                    </label>
                </div>
            </div>

            <div class="checkbox-option">
                <input type="checkbox" id="gamification" checked>
                <div class="checkbox-label">
                    <div class="option-title">🎮 Enable Gamification</div>
                    <div class="option-description">
                        Unlock achievements and level up as you develop mindful coding habits
                    </div>
                </div>
            </div>

            <div class="buttons">
                <button class="secondary" onclick="prevStep()">← Back</button>
                <button onclick="complete()">Complete Setup ✓</button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentStep = 1;
        let selectedLevel = 'mid';
        let selectedFrequency = 'medium';

        function nextStep() {
            if (currentStep < 3) {
                document.getElementById('step' + currentStep).classList.remove('active');
                document.getElementById('dot' + currentStep).classList.remove('active');
                currentStep++;
                document.getElementById('step' + currentStep).classList.add('active');
                document.getElementById('dot' + currentStep).classList.add('active');
            }
        }

        function prevStep() {
            if (currentStep > 1) {
                document.getElementById('step' + currentStep).classList.remove('active');
                document.getElementById('dot' + currentStep).classList.remove('active');
                currentStep--;
                document.getElementById('step' + currentStep).classList.add('active');
                document.getElementById('dot' + currentStep).classList.add('active');
            }
        }

        function selectLevel(level) {
            selectedLevel = level;
            document.querySelectorAll('.radio-option').forEach(el => {
                el.classList.remove('selected');
            });
            event.currentTarget.classList.add('selected');
        }

        function selectFrequency(frequency) {
            selectedFrequency = frequency;
            document.querySelectorAll('#step3 .radio-option').forEach(el => {
                el.classList.remove('selected');
            });
            event.currentTarget.classList.add('selected');
        }

        function complete() {
            const enableGamification = document.getElementById('gamification').checked;

            vscode.postMessage({
                type: 'complete',
                data: {
                    experienceLevel: selectedLevel,
                    alertFrequency: selectedFrequency,
                    enableGamification: enableGamification
                }
            });
        }

        function skip() {
            vscode.postMessage({ type: 'skip' });
        }

        // Initialize selected states
        document.addEventListener('DOMContentLoaded', () => {
            document.querySelector('input[value="mid"]').parentElement.classList.add('selected');
        });
    </script>
</body>
</html>`;
  }
}
