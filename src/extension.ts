/**
 * CodePause Extension Entry Point
 * Orchestrates all components and manages extension lifecycle
 */

import * as vscode from 'vscode';
import { DatabaseManager } from './storage/DatabaseManager';
import { DataRetentionManager } from './storage/DataRetentionManager';
import { MetricsRepository } from './storage/MetricsRepository';
import { ConfigRepository } from './storage/ConfigRepository';
import { ConfigManager } from './config/ConfigManager';
import { MetricsCollector } from './core/MetricsCollector';
import { ThresholdManager } from './core/ThresholdManager';
import { StatusBarManager } from './ui/StatusBarManager';
import { NotificationService } from './ui/NotificationService';
import { DashboardProvider } from './ui/DashboardProvider';
import { OnboardingManager } from './onboarding/OnboardingManager';
import { TelemetryService } from './telemetry/TelemetryService';
import { ErrorReporter } from './errors/ErrorReporter';
import { ProgressTracker } from './gamification/ProgressTracker';
import { AchievementSystem } from './gamification/AchievementSystem';
import { SnoozeManager } from './customization/SnoozeManager';
import { DataExporter } from './customization/DataExporter';
import { SettingsProvider } from './ui/SettingsProvider';
import { AlertEngine } from './alerts/AlertEngine';
import { BlindApprovalDetector } from './core/BlindApprovalDetector';
import { EventType, DeveloperLevel } from './types';

// Extension state
let databaseManager: DatabaseManager | null = null;
let dataRetentionManager: DataRetentionManager | null = null;
let metricsRepository: MetricsRepository | null = null;
let configRepository: ConfigRepository | null = null;
let configManager: ConfigManager | null = null;
let metricsCollector: MetricsCollector | null = null;
let thresholdManager: ThresholdManager | null = null;
let statusBarManager: StatusBarManager | null = null;
let notificationService: NotificationService | null = null;
let dashboardProvider: DashboardProvider | null = null;
let onboardingManager: OnboardingManager | null = null;
let telemetryService: TelemetryService | null = null;
let errorReporter: ErrorReporter | null = null;
let progressTracker: ProgressTracker | null = null;
let achievementSystem: AchievementSystem | null = null;
let snoozeManager: SnoozeManager | null = null;
let dataExporter: DataExporter | null = null;
let settingsProvider: SettingsProvider | null = null;
let alertEngine: AlertEngine | null = null;
let blindApprovalDetector: BlindApprovalDetector | null = null;

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext) {
  try {
    // Initialize telemetry first (privacy-first, anonymous)
    telemetryService = new TelemetryService(context);
    telemetryService.initialize();
    telemetryService.trackActivation();

    // Initialize error reporting
    errorReporter = new ErrorReporter(context, telemetryService);

    // Initialize storage
    await initializeStorage(context);

    // Register commands
    registerCommands(context);

    // Initialize metrics collector and trackers (Phase 2)
    await initializeTrackers(context);

    // Initialize UI components (Phase 4)
    await initializeUI(context);

    // Initialize alert system (Phase 5)
    await initializeAlerts(context);

    // Initialize gamification (Phase 6)
    await initializeGamification(context);

    // Initialize customization (Phase 7)
    await initializeCustomization(context);

    // Initialize onboarding manager
    onboardingManager = new OnboardingManager(context, configManager!);

    // Check if user needs onboarding (delay by 2 seconds to let VS Code fully load)
    if (await onboardingManager.needsOnboarding()) {
      setTimeout(async () => {
        if (onboardingManager) {
          await onboardingManager.start();
        }
      }, 2000);
    } else {
      // Show activation message via notification service
      notificationService?.showProgressNotification('CodePause is now tracking your AI usage');
    }
  } catch (error) {
    console.error('Failed to activate CodePause:', error);

    // Report activation error
    if (errorReporter && error instanceof Error) {
      errorReporter.reportError(error, 'activation');
    } else if (telemetryService) {
      // Fallback to telemetry if ErrorReporter not available
      telemetryService.trackError('activation');
    }

    vscode.window.showErrorMessage(
      `CodePause failed to activate: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get the current workspace path
 * Handles single workspace, multi-root, and no workspace scenarios
 */
function getWorkspacePath(): string | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    // No workspace - single file mode
    return undefined;
  }

  if (workspaceFolders.length === 1) {
    // Single workspace (most common)
    return workspaceFolders[0].uri.fsPath;
  }

  // Multi-root workspace: use the first folder as primary
  // In the future, we could let users select which workspace to track
  return workspaceFolders[0].uri.fsPath;
}

/**
 * Extension deactivation
 */
export async function deactivate() {
  // Dispose telemetry (flush remaining events)
  if (telemetryService) {
    await telemetryService.dispose();
    telemetryService = null;
  }

  // Dispose error reporting
  if (errorReporter) {
    errorReporter.dispose();
    errorReporter = null;
  }

  // Dispose customization
  if (snoozeManager) {
    snoozeManager.dispose();
    snoozeManager = null;
  }

  dataExporter = null;
  settingsProvider = null;

  // Dispose gamification
  if (achievementSystem) {
    achievementSystem.dispose();
    achievementSystem = null;
  }

  if (progressTracker) {
    progressTracker.dispose();
    progressTracker = null;
  }

  // Dispose UI components
  if (statusBarManager) {
    statusBarManager.dispose();
    statusBarManager = null;
  }

  if (notificationService) {
    notificationService.clearAll();
    notificationService = null;
  }

  // Dispose metrics collector
  if (metricsCollector) {
    await metricsCollector.dispose();
    metricsCollector = null;
  }

  // Stop data retention cleanup scheduler
  if (dataRetentionManager) {
    dataRetentionManager.stopCleanupScheduler();
    dataRetentionManager = null;
  }

  // Clean up database connection
  if (databaseManager) {
    // Ensure all data is synced before closing
    databaseManager.sync();
    databaseManager.close();
    databaseManager = null;
  }

  // Clean up other resources
  metricsRepository = null;
  configRepository = null;
  configManager = null;
  thresholdManager = null;
  dashboardProvider = null;
}

/**
 * Initialize storage layer
 * Now creates workspace-specific databases for project isolation
 */
async function initializeStorage(_context: vscode.ExtensionContext): Promise<void> {
  const os = require('os');
  const path = require('path');
  const fs = require('fs');
  const storagePath = path.join(os.homedir(), '.codepause');

  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }

  // Get current workspace path for project-specific database
  const workspacePath = getWorkspacePath();

  // Create DatabaseManager with workspace-specific path
  databaseManager = new DatabaseManager(storagePath, workspacePath);
  await databaseManager.initialize();

  // Initialize data retention manager (30-day rolling window for free tier)
  dataRetentionManager = new DataRetentionManager(_context, databaseManager);
  dataRetentionManager.startCleanupScheduler();

  metricsRepository = new MetricsRepository(databaseManager);
  // Pass globalState to ConfigRepository for user-level onboarding persistence
  configRepository = new ConfigRepository(databaseManager, _context.globalState);

  configManager = new ConfigManager(configRepository);
  await configManager.initialize();

}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function initializeTrackers(_context: vscode.ExtensionContext): Promise<void> {
  if (!metricsRepository || !configManager) {
    throw new Error('Storage must be initialized before trackers');
  }

  // Initialize metrics collector with telemetry service
  metricsCollector = new MetricsCollector(metricsRepository, configManager, telemetryService ?? undefined);
  await metricsCollector.initialize();

}

async function initializeUI(context: vscode.ExtensionContext): Promise<void> {
  if (!metricsRepository || !configRepository || !configManager) {
    throw new Error('Storage must be initialized before UI');
  }

  // Initialize threshold manager with user's experience level
  const userConfig = await configRepository.getUserConfig();
  thresholdManager = new ThresholdManager(userConfig.experienceLevel);

  // Initialize notification service
  notificationService = new NotificationService(configRepository);

  // Initialize status bar manager
  statusBarManager = new StatusBarManager(
    metricsRepository,
    configRepository,
    thresholdManager
  );
  await statusBarManager.initialize();

  // Initialize dashboard provider
  dashboardProvider = new DashboardProvider(
    context.extensionUri,
    metricsRepository,
    configRepository,
    thresholdManager,
    telemetryService ?? undefined, // Pass telemetry service for review event tracking
    metricsCollector ?? undefined // Pass metrics collector to access FileReviewSessionTracker
  );

  // Register dashboard view
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      DashboardProvider.viewType,
      dashboardProvider
    )
  );

}

/**
 * Initialize alert system
 */
async function initializeAlerts(context: vscode.ExtensionContext): Promise<void> {
  if (!metricsRepository || !configRepository || !thresholdManager || !notificationService) {
    throw new Error('Required components must be initialized before alerts');
  }

  // Initialize blind approval detector
  const thresholds = thresholdManager.getConfig();
  blindApprovalDetector = new BlindApprovalDetector(thresholds);

  // Initialize alert engine
  alertEngine = new AlertEngine(configRepository);

  // Connect real-time alert system to MetricsCollector
  // This will be called immediately when events are tracked
  if (metricsCollector) {
    metricsCollector.onEvent(async (event) => {
      // Only process suggestion accepted events
      if (event.eventType !== EventType.SuggestionAccepted || !event.acceptanceTimeDelta) {
        return;
      }

      // Skip alerts for scanner/historical events (files detected after creation)
      // These aren't real-time acceptances, so don't trigger blind approval alerts
      const metadata = event.metadata as any;
      if (metadata?.scanner || metadata?.closedFileModification || metadata?.fileCreation) {
        // These are historical events from the scanner, not real-time user actions
        return;
      }

      try {
        // Real-time blind approval detection
        const detection = blindApprovalDetector!.detect(event);


        if (detection.isBlindApproval) {
          const shouldShow = await alertEngine!.shouldShowBlindApprovalAlert(detection);

          if (shouldShow) {
            const alert = alertEngine!.createBlindApprovalAlert(detection);
            await notificationService!.showAlert(alert);
            await alertEngine!.recordAlertShown(alert);
          }
        }
      } catch (error) {
        console.error('[AlertSystem] Error in real-time alert check:', error);
      }
    });

    // Show XP gains for events (with smart filtering)
    metricsCollector.onEvent(async (event) => {
      // Don't show XP for scanner/historical events
      const metadata = event.metadata as any;
      if (metadata?.scanner || metadata?.closedFileModification) {
        return;
      }

      try {
        // Map event types to XP gain descriptions
        let action = '';
        let shouldShow = false;

        switch (event.eventType) {
          case EventType.SuggestionAccepted:
            action = 'Reviewed AI suggestion';
            shouldShow = false; // Don't show for every acceptance (too frequent)
            break;
          case EventType.SuggestionRejected:
            action = 'Rejected AI suggestion';
            shouldShow = false;
            break;
          case EventType.CodeGenerated:
            action = 'Generated code with AI';
            shouldShow = false;
            break;
          case EventType.SessionStart:
            action = 'Started coding session';
            shouldShow = true; // Show for sessions
            break;
          default:
            return;
        }

        if (action && notificationService) {
          await notificationService.showXPGain(1, action, shouldShow);
        }
      } catch (error) {
        console.error('[XPSystem] Error showing XP gain:', error);
      }
    });

    // AUTO-REFRESH FIX: Automatically refresh dashboard when events are processed
    metricsCollector.onEvent(async () => {
      // Refresh dashboard for all event types to keep UI in sync
      if (dashboardProvider) {
        await dashboardProvider.refresh();
      }
    });
  }

  // Function to check thresholds (can be called manually or periodically)
  const checkThresholds = async (force: boolean = false): Promise<void> => {
    if (!alertEngine || !metricsRepository || !thresholdManager) {
      return;
    }

    try {
      const now = Date.now();
      const timeSinceLastCheck = now - lastThresholdCheckTime;

      if (!force && timeSinceLastCheck < 10 * 60 * 1000) {
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const metrics = await metricsRepository.getDailyMetrics(today);

      if (!metrics || metrics.totalEvents <= 10) {
        return;
      }

      const currentThresholds = thresholdManager.getConfig();

      // Check AI percentage threshold
      if (metrics.aiPercentage > currentThresholds.maxAIPercentage) {
        const shouldShow = await alertEngine.shouldShowThresholdAlert(metrics, 'aiPercentage');
        const isSnoozed = configRepository ? await configRepository.isSnoozed() : false;

        if (shouldShow && !isSnoozed) {
          const alert = alertEngine.createThresholdAlert(
            metrics,
            'aiPercentage',
            currentThresholds.maxAIPercentage
          );

          if (alert) {
            await notificationService!.showAlert(alert);
            await alertEngine.recordAlertShown(alert);
            lastThresholdCheckTime = now;
          }
        }
      }
    } catch (error) {
      console.error('CodePause: Error in threshold check:', error);
    }
  };

  // Periodic threshold check (once every 10 minutes for AI percentage warnings)
  let lastThresholdCheckTime = 0;
  const thresholdCheckInterval = setInterval(() => {
    checkThresholds(false);
  }, 5 * 60 * 1000); // Check every 5 minutes, but only alert every 10 min

  context.subscriptions.push({
    dispose: () => clearInterval(thresholdCheckInterval)
  });

  // Manual threshold check command (for testing/debugging)
  const checkThresholdsNow = vscode.commands.registerCommand(
    'codePause.checkThresholds',
    async () => {
      await checkThresholds(true);
      vscode.window.showInformationMessage('Threshold check completed. Check console for details.');
    }
  );
  context.subscriptions.push(checkThresholdsNow);

  // Test notification command (for verifying notification visibility)
  const testNotification = vscode.commands.registerCommand(
    'codePause.testNotification',
    async () => {
      // Test 1: Modal notification
      await vscode.window.showInformationMessage(
        'TEST NOTIFICATION (Modal)',
        { modal: true },
        'I see this!',
        'Not visible'
      );

      // Test 2: Non-modal notification
      await vscode.window.showInformationMessage(
        'TEST NOTIFICATION (Non-Modal) - This should appear in top-right corner or notification center',
        { modal: false },
        'I see this!',
        'Not visible'
      );

      // Test 3: Warning message
      await vscode.window.showWarningMessage(
        'TEST WARNING - Check if you can see this warning notification',
        { modal: false },
        'Visible',
        'Not visible'
      );

      vscode.window.showInformationMessage('Test complete!');
    }
  );
  context.subscriptions.push(testNotification);
}

/**
 * Initialize gamification components
 */
async function initializeGamification(context: vscode.ExtensionContext): Promise<void> {
  if (!metricsRepository || !configRepository) {
    throw new Error('Storage must be initialized before gamification');
  }

  // Check if gamification is enabled
  const config = await configRepository.getUserConfig();
  if (!config.enableGamification) {
    return;
  }

  // Initialize progress tracker
  progressTracker = new ProgressTracker(metricsRepository, configRepository);
  await progressTracker.initialize();

  // Initialize achievement system
  achievementSystem = new AchievementSystem(
    metricsRepository,
    configRepository,
    progressTracker
  );
  await achievementSystem.initialize();

  // Connect event handlers
  if (notificationService && achievementSystem && progressTracker) {
    // Handle achievement unlocks and progress milestones
    achievementSystem.onAchievementUnlocked(async (achievement) => {
      // Check if this is a progress notification vs actual unlock
      const metadata = (achievement as any).metadata;
      if (metadata?.isProgressNotification) {
        // Show progress notification
        await notificationService!.showAchievementProgress(
          achievement.title,
          achievement.progress || 0,
          achievement.icon
        );
      } else {
        // Show unlock notification
        await notificationService!.showAchievementUnlocked(
          achievement.title,
          achievement.description
        );
      }

      // Refresh dashboard and status bar
      if (dashboardProvider) {
        await dashboardProvider.refresh();
      }
      if (statusBarManager) {
        await statusBarManager.refresh();
      }
    });

    // Handle level ups
    progressTracker.onLevelUp(async (level) => {
      const title = progressTracker!.getLevelTitle(level);
      const icon = progressTracker!.getLevelIcon(level);

      await notificationService!.showLevelUp(level, title, icon);

      // Show special message in status bar
      if (statusBarManager) {
        statusBarManager.showTemporaryMessage(`🎉 Level ${level}!`, 5000);
      }
    });
  }

  // Connect gamification with metrics collection
  // Set up periodic checks for achievements based on metrics
  const gamificationCheckInterval = setInterval(async () => {
    if (achievementSystem && progressTracker) {
      // Update progression (adds XP from events)
      await progressTracker.updateProgression();

      // Check relevant achievements periodically
      await achievementSystem.checkRelevantAchievements('daily');
    }
  }, 5 * 60 * 1000); // Check every 5 minutes

  context.subscriptions.push({
    dispose: () => clearInterval(gamificationCheckInterval)
  });
}

/**
 * Initialize customization components
 */
async function initializeCustomization(context: vscode.ExtensionContext): Promise<void> {
  if (!metricsRepository || !configRepository || !thresholdManager) {
    throw new Error('Required components must be initialized before customization');
  }

  // Initialize snooze manager
  snoozeManager = new SnoozeManager(configRepository);
  await snoozeManager.initialize();

  // Initialize data exporter
  dataExporter = new DataExporter(metricsRepository, configRepository);

  // Initialize settings provider
  settingsProvider = new SettingsProvider(
    context.extensionUri,
    configRepository,
    thresholdManager
  );

  // Connect snooze manager to status bar
  if (statusBarManager && snoozeManager) {
    snoozeManager.onSnoozeChanged(async () => {
      await statusBarManager!.refresh();
    });
  }
}

/**
 * Register VSCode commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
  // Open Dashboard command
  const openDashboard = vscode.commands.registerCommand(
    'codePause.openDashboard',
    async () => {
      telemetryService?.trackCommand('openDashboard');

      if (dashboardProvider) {
        // Reveal the view in the sidebar (this will open the sidebar if closed)
        // Using 'workbench.view.extension.codePause' to reveal the entire view container
        await vscode.commands.executeCommand('workbench.view.extension.codePause');

        // Then focus the dashboard view specifically
        await vscode.commands.executeCommand('codePause.dashboardView.focus');

        // Refresh the dashboard content
        await dashboardProvider.refresh();
      } else {
        vscode.window.showErrorMessage('Dashboard not available');
      }
    }
  );

  // Start Onboarding command
  const startOnboarding = vscode.commands.registerCommand(
    'codePause.startOnboarding',
    async () => {
      telemetryService?.trackCommand('startOnboarding');

      if (onboardingManager) {
        await onboardingManager.start();
      } else {
        vscode.window.showErrorMessage('Onboarding not available');
      }
    }
  );

  // Reset Onboarding command (for testing)
  const resetOnboarding = vscode.commands.registerCommand(
    'codePause.resetOnboarding',
    async () => {
      if (onboardingManager) {
        await onboardingManager.reset();
        vscode.window.showInformationMessage(
          'Onboarding reset successfully. Reload VS Code to restart onboarding.',
          'Reload Now'
        ).then(action => {
          if (action === 'Reload Now') {
            vscode.commands.executeCommand('workbench.action.reloadWindow');
          }
        });
      } else {
        vscode.window.showErrorMessage('Onboarding not available');
      }
    }
  );

  // Open Settings command
  const openSettings = vscode.commands.registerCommand(
    'codePause.openSettings',
    async () => {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'codePause'
      );
    }
  );

  // Snooze command (updated to use SnoozeManager)
  const snooze = vscode.commands.registerCommand(
    'codePause.snooze',
    async () => {
      if (!snoozeManager) {
        vscode.window.showErrorMessage('CodePause is not initialized');
        return;
      }

      await snoozeManager.showSnoozeDialog();
    }
  );

  // Show stats command (for testing)
  const showDatabaseInfo = vscode.commands.registerCommand(
    'codePause.showDatabaseInfo',
    async () => {
      if (!databaseManager) {
        vscode.window.showInformationMessage('Database not initialized');
        return;
      }

      // Get database stats to verify it's working
      let statsInfo = '';
      try {
        const stats = await databaseManager.getStats();
        statsInfo = `\n\nDatabase Stats:\n` +
          `• Total Events: ${stats.totalEvents}\n` +
          `• Total Sessions: ${stats.totalSessions}\n` +
          `• Database Size: ${(stats.databaseSize / 1024).toFixed(2)} KB\n` +
          `✅ Database is working correctly!`;
      } catch (error) {
        statsInfo = `\n\n⚠️ Could not read database stats: ${error}`;
      }

      const message = `Database Backend: node-sqlite3-wasm\n\n` +
        `Status: ✅ Active\n\n` +
        `✅ Using node-sqlite3-wasm (WebAssembly SQLite)\n` +
        `• Cross-platform compatibility: Works on all Node.js versions (20+)\n` +
        `• No native compilation required\n` +
        `• Works across all VS Code and Electron versions\n` +
        `• Full SQLite 3.51.1 implementation\n` +
        `• Persistent file system storage\n` +
        `• Zero configuration needed\n\n` +
        `Performance: Excellent for extension use cases\n` +
        `Reliability: 100% - no NODE_MODULE_VERSION issues ever!` +
        statsInfo;

      vscode.window.showInformationMessage(message, { modal: true });
    }
  );

  // Manual data cleanup command (for testing 30-day retention)
  const cleanupOldData = vscode.commands.registerCommand(
    'codePause.cleanupOldData',
    async () => {
      if (!dataRetentionManager) {
        vscode.window.showErrorMessage('Data retention manager not initialized');
        return;
      }

      await dataRetentionManager.triggerManualCleanup();
    }
  );

  const showStats = vscode.commands.registerCommand(
    'codePause.showStats',
    async () => {
      if (!metricsRepository) {
        vscode.window.showErrorMessage('CodePause is not initialized');
        return;
      }

      const stats = await metricsRepository.getStatsSummary();

      vscode.window.showInformationMessage(
        `CodePause Stats:\n` +
        `Total Events: ${stats.totalEvents}\n` +
        `Total Sessions: ${stats.totalSessions}\n` +
        `Database Size: ${(stats.databaseSize / 1024).toFixed(2)} KB`
      );
    }
  );

  // Diagnostic command to check alert system status
  const diagnoseAlerts = vscode.commands.registerCommand(
    'codePause.diagnoseAlerts',
    async () => {
      if (!alertEngine || !configRepository || !snoozeManager || !blindApprovalDetector) {
        vscode.window.showErrorMessage('Alert system not initialized');
        return;
      }

      try {
        // Check snooze status
        const snoozeState = await configRepository.getSnoozeState();
        const isSnoozed = await configRepository.isSnoozed();
        
        // Check rate limits for each alert type
        const alertTypes = [
          { type: 'GentleNudge', limit: 5 * 60 * 1000 },
          { type: 'EducationalMoment', limit: 30 * 60 * 1000 },
          { type: 'StreakWarning', limit: 10 * 60 * 1000 }
        ];
        
        const rateLimitStatus = await Promise.all(
          alertTypes.map(async ({ type, limit }) => {
            const history = await configRepository!.getAlertHistory(type as any);
            if (!history) {
              return `${type}: ✅ Can show (never shown)`;
            }
            const timeSince = Date.now() - history.lastShown;
            const canShow = timeSince >= limit;
            const minutesAgo = Math.floor(timeSince / 60000);
            return `${type}: ${canShow ? '✅' : '⏸️'} ${canShow ? 'Can show' : `Rate limited (${minutesAgo}m ago, need ${Math.floor(limit/60000)}m)`}`;
          })
        );

        // Get blind approval detector stats
        const detectorStats = blindApprovalDetector.getStats();
        
        // Get today's metrics
        const today = new Date().toISOString().split('T')[0];
        const metrics = metricsRepository ? await metricsRepository.getDailyMetrics(today) : null;
        
        const message = `🔍 Alert System Diagnostics\n\n` +
          `📊 Snooze Status:\n` +
          `   ${isSnoozed ? '⏸️ SNOOZED' : '✅ Active'}\n` +
          (isSnoozed && snoozeState.snoozeUntil 
            ? `   Until: ${new Date(snoozeState.snoozeUntil).toLocaleString()}\n`
            : '') +
          `\n⏱️ Rate Limits:\n` +
          rateLimitStatus.map(s => `   ${s}`).join('\n') +
          `\n\n🎯 Blind Approval Detection:\n` +
          `   Recent Acceptances: ${detectorStats.recentCount}\n` +
          `   Rapid Acceptances: ${detectorStats.recentRapidCount}\n` +
          `   Avg Review Time: ${detectorStats.averageReviewTime.toFixed(0)}ms\n` +
          `\n📈 Today's Metrics:\n` +
          (metrics
            ? `   AI Percentage: ${metrics.aiPercentage.toFixed(1)}%\n` +
              `   Avg Review Time: ${metrics.averageReviewTime.toFixed(0)}ms\n` +
              `   Total Events: ${metrics.totalEvents}\n` +
              `   Manual Lines: ${metrics.totalManualLines}`
            : '   No metrics yet') +
          `\n\n💡 Issues Found:\n` +
          (isSnoozed ? '   ⚠️ Alerts are snoozed - no alerts will show\n' : '') +
          (metrics && metrics.aiPercentage > 60 ? '   ⚠️ AI usage exceeds 60% threshold\n' : '') +
          (detectorStats.recentRapidCount >= 3 ? '   ⚠️ Pattern detected (3+ rapid accepts)\n' : '');

        vscode.window.showInformationMessage(message, { modal: true });
      } catch (error) {
        vscode.window.showErrorMessage(`Diagnostic error: ${error}`);
      }
    }
  );

  // Refresh dashboard command
  const refreshDashboard = vscode.commands.registerCommand(
    'codePause.refreshDashboard',
    async () => {
      // Force immediate metrics aggregation
      if (metricsCollector) {
        await metricsCollector.triggerAggregation();
      }

      if (dashboardProvider) {
        await dashboardProvider.refresh(true); // Force HTML update to pick up code changes
      }
      if (statusBarManager) {
        await statusBarManager.refresh();
      }
      if (progressTracker) {
        await progressTracker.updateProgression();
      }
      if (achievementSystem) {
        await achievementSystem.triggerCheck();
      }

      vscode.window.showInformationMessage('Dashboard refreshed (HTML regenerated)');
    }
  );

  // Show progression command
  const showProgression = vscode.commands.registerCommand(
    'codePause.showProgression',
    async () => {
      if (!progressTracker) {
        vscode.window.showErrorMessage('Gamification is not enabled');
        return;
      }

      const summary = await progressTracker.getProgressionSummary();
      const quote = await progressTracker.getMotivationalQuote();

      vscode.window.showInformationMessage(
        `${summary}\n\n💭 "${quote}"`
      );
    }
  );

  // Show achievements command
  const showAchievements = vscode.commands.registerCommand(
    'codePause.showAchievements',
    async () => {
      if (!achievementSystem) {
        vscode.window.showErrorMessage('Gamification is not enabled');
        return;
      }

      const summary = await achievementSystem.getAchievementsSummary();

      vscode.window.showInformationMessage(summary);
    }
  );

  // Show advanced settings command
  const showAdvancedSettings = vscode.commands.registerCommand(
    'codePause.showAdvancedSettings',
    async () => {
      if (!settingsProvider) {
        vscode.window.showErrorMessage('Settings not available');
        return;
      }

      await settingsProvider.show();
    }
  );

  // Export data command
  const exportData = vscode.commands.registerCommand(
    'codePause.exportData',
    async () => {
      if (!dataExporter) {
        vscode.window.showErrorMessage('Data exporter not available');
        return;
      }

      await dataExporter.showExportDialog();
    }
  );

  // Import data command
  const importData = vscode.commands.registerCommand(
    'codePause.importData',
    async () => {
      if (!dataExporter) {
        vscode.window.showErrorMessage('Data importer not available');
        return;
      }

      await dataExporter.importData();
    }
  );

  // Show snooze status command
  const showSnoozeStatus = vscode.commands.registerCommand(
    'codePause.showSnoozeStatus',
    async () => {
      if (!snoozeManager) {
        vscode.window.showErrorMessage('Snooze manager not available');
        return;
      }

      const status = await snoozeManager.getSnoozeStatus();
      vscode.window.showInformationMessage(status);
    }
  );

  // Change experience level command
  const changeExperienceLevel = vscode.commands.registerCommand(
    'codePause.changeExperienceLevel',
    async () => {
      if (!configRepository) {
        vscode.window.showErrorMessage('CodePause is not initialized');
        return;
      }

      const currentConfig = await configRepository.getUserConfig();
      const options = [
        { label: 'Junior Developer', description: 'AI usage limit: 40% (build fundamentals first)', value: DeveloperLevel.Junior },
        { label: 'Mid-Level Developer', description: 'AI usage limit: 60% (have fundamentals, leverage AI)', value: DeveloperLevel.Mid },
        { label: 'Senior Developer', description: 'AI usage limit: 70% (productivity-focused)', value: DeveloperLevel.Senior }
      ];

      const selected = await vscode.window.showQuickPick(options, {
        placeHolder: `Current level: ${currentConfig.experienceLevel}`,
        title: 'Select Your Experience Level'
      });

      if (selected) {
        await configRepository.setExperienceLevel(selected.value);

        // Update threshold manager
        if (thresholdManager) {
          thresholdManager.setLevel(selected.value);
        }

        // Refresh UI
        if (dashboardProvider) {
          await dashboardProvider.refresh();
        }
        if (statusBarManager) {
          await statusBarManager.refresh();
        }

        vscode.window.showInformationMessage(`Experience level changed to: ${selected.label}`);
      }
    }
  );

  // Force full scan command (for debugging/recovery)
  const forceFullScan = vscode.commands.registerCommand(
    'codePause.forceFullScan',
    async () => {
      if (!metricsCollector) {
        vscode.window.showErrorMessage('CodePause is not initialized');
        return;
      }

      vscode.window.showInformationMessage('Scanning workspace for AI-generated files...');

      // Trigger scan on Cursor tracker
      const trackers = (metricsCollector as any).trackers;
      const cursorTracker = trackers?.get('cursor');

      if (cursorTracker && typeof cursorTracker.forceFullScan === 'function') {
        await cursorTracker.forceFullScan();

        // Wait a moment for events to be processed
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Trigger aggregation
        await metricsCollector.triggerAggregation();

        // Refresh UI
        if (dashboardProvider) {
          await dashboardProvider.refresh();
        }
        if (statusBarManager) {
          await statusBarManager.refresh();
        }

        vscode.window.showInformationMessage('Scan complete! Dashboard updated.');
      } else {
        vscode.window.showWarningMessage('Cursor tracker not available');
      }
    }
  );

  const resetAchievements = vscode.commands.registerCommand(
    'codePause.resetAchievements',
    async () => {
      const result = await vscode.window.showWarningMessage(
        'This will reset all achievements and progress. Are you sure?',
        { modal: true },
        'Yes, Reset'
      );

      if (result === 'Yes, Reset' && achievementSystem && configRepository) {
        const achievements = await configRepository.getAllAchievements();
        for (const achievement of achievements) {
          await configRepository.updateAchievementProgress(achievement.id, 0, false);
        }

        if (dashboardProvider) {
          await dashboardProvider.refresh();
        }

        vscode.window.showInformationMessage('All achievements have been reset');
      }
    }
  );

  const clearAllData = vscode.commands.registerCommand(
    'codePause.clearAllData',
    async () => {
      const result = await vscode.window.showWarningMessage(
        'This will delete ALL tracked data, including events, metrics, and achievements. This cannot be undone. Are you sure?',
        { modal: true },
        'Yes, Clear Everything'
      );

      if (result === 'Yes, Clear Everything' && databaseManager) {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');

        // Get the actual database path from the database manager
        const dbPath = (databaseManager as any).dbPath;

        // Close the database connection
        databaseManager.close();

        // Delete the workspace-specific database if it exists
        if (dbPath && fs.existsSync(dbPath)) {
          fs.unlinkSync(dbPath);
        }

        // Also clean up old database location if it exists
        const oldDbPath = path.join(os.homedir(), '.codepause', 'codepause.db');
        if (fs.existsSync(oldDbPath)) {
          fs.unlinkSync(oldDbPath);
        }

        // Clean up global.db if it exists
        const globalDbPath = path.join(os.homedir(), '.codepause', 'global.db');
        if (fs.existsSync(globalDbPath)) {
          fs.unlinkSync(globalDbPath);
        }

        // CORRECT FIX: Clear baseline file when clearing all data
        // This ensures stale baselines from previous tests don't interfere
        // On reload, baselines will be reestablished from:
        //   1. Open files → current line count
        //   2. Git projects → git HEAD
        //   3. Closed files (no git) → treated as new file (correct behavior)
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceFolder) {
          const baselinesPath = path.join(workspaceFolder, '.vscode', 'codepause-baselines.json');
          if (fs.existsSync(baselinesPath)) {
            fs.unlinkSync(baselinesPath);
          }
        }

        vscode.window.showInformationMessage(
          'All data cleared. Please reload the window to reinitialize.',
          'Reload Window'
        ).then(selection => {
          if (selection === 'Reload Window') {
            vscode.commands.executeCommand('workbench.action.reloadWindow');
          }
        });
      }
    }
  );

  // Register all commands
  context.subscriptions.push(
    openDashboard,
    startOnboarding,
    resetOnboarding,
    openSettings,
    snooze,
    showStats,
    showDatabaseInfo,
    cleanupOldData,
    refreshDashboard,
    diagnoseAlerts,
    showProgression,
    showAchievements,
    showAdvancedSettings,
    exportData,
    importData,
    showSnoozeStatus,
    changeExperienceLevel,
    forceFullScan,
    resetAchievements,
    clearAllData
  );
}

// Export for testing
export function getDatabaseManager(): DatabaseManager | null {
  return databaseManager;
}

export function getMetricsRepository(): MetricsRepository | null {
  return metricsRepository;
}

export function getConfigManager(): ConfigManager | null {
  return configManager;
}
