import * as vscode from 'vscode';
import { DatabaseManager } from './DatabaseManager';

/**
 * Manages data retention policies based on user tier
 * - Free tier: 30 days rolling window (auto-delete older data)
 * - Pro/Team tier: Unlimited history (no deletion)
 */
export class DataRetentionManager {
  private static readonly FREE_TIER_RETENTION_DAYS = 30;
  private context: vscode.ExtensionContext;
  private dbManager: DatabaseManager;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(context: vscode.ExtensionContext, dbManager: DatabaseManager) {
    this.context = context;
    this.dbManager = dbManager;
  }

  /**
   * Start the data retention cleanup scheduler
   * Runs daily at midnight
   */
  startCleanupScheduler(): void {
    // Run cleanup on startup
    this.performCleanup();

    // Schedule daily cleanup at midnight
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0); // Next midnight

    const msUntilMidnight = midnight.getTime() - now.getTime();

    // First cleanup at midnight
    setTimeout(() => {
      this.performCleanup();

      // Then run every 24 hours
      this.cleanupTimer = setInterval(() => {
        this.performCleanup();
      }, 24 * 60 * 60 * 1000); // 24 hours
    }, msUntilMidnight);
  }

  /**
   * Stop the cleanup scheduler (cleanup on deactivation)
   */
  stopCleanupScheduler(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Perform data cleanup based on user tier
   */
  async performCleanup(): Promise<void> {
    const tier = this.getUserTier();

    if (tier === 'free') {
      await this.cleanupFreeUserData();
    }
    // Pro/Team users keep all data
  }

  /**
   * Cleanup old data for free users (older than 30 days)
   */
  private async cleanupFreeUserData(): Promise<void> {
    try {
      const thirtyDaysAgo = Date.now() - (DataRetentionManager.FREE_TIER_RETENTION_DAYS * 24 * 60 * 60 * 1000);

      // Delete events older than 30 days
      await this.dbManager.deleteEventsBefore(thirtyDaysAgo);

      // Update last cleanup timestamp
      this.context.globalState.update('lastCleanupTimestamp', Date.now());
    } catch (error) {
      console.error('[DataRetention] Cleanup failed:', error);
    }
  }

  /**
   * Get count of events in database
   */
  async getEventCount(): Promise<number> {
    return await this.dbManager.countEvents();
  }

  /**
   * Get oldest event timestamp
   */
  async getOldestEventDate(): Promise<Date | null> {
    const oldest = await this.dbManager.getOldestEvent();
    return oldest ? new Date(oldest.timestamp) : null;
  }

  /**
   * Get newest event timestamp
   */
  async getNewestEventDate(): Promise<Date | null> {
    const newest = await this.dbManager.getNewestEvent();
    return newest ? new Date(newest.timestamp) : null;
  }

  /**
   * Get date range of available data
   */
  async getDataRange(): Promise<{ start: Date | null; end: Date | null; days: number }> {
    const start = await this.getOldestEventDate();
    const end = await this.getNewestEventDate();

    let days = 0;
    if (start && end) {
      days = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    }

    return { start, end, days };
  }

  /**
   * Check if user has Pro/Team license
   */
  private getUserTier(): 'free' | 'pro' | 'team' {
    const licenseKey = this.context.globalState.get('licenseKey');

    if (!licenseKey) {
      return 'free';
    }

    // Validate license and get tier (implement later with license system)
    const tier = this.context.globalState.get('licenseTier', 'free');
    return tier as 'free' | 'pro' | 'team';
  }

  /**
   * Manual cleanup trigger (for testing and user commands)
   */
  async triggerManualCleanup(): Promise<void> {
    await this.performCleanup();

    const range = await this.getDataRange();

    vscode.window.showInformationMessage(
      `Cleanup complete. You have ${range.days} days of data (${range.start?.toLocaleDateString()} - ${range.end?.toLocaleDateString()})`
    );
  }
}
