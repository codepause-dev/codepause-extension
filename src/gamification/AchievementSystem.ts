/**
 * AchievementSystem
 * Manages achievement unlocking and progress tracking
 */

import { MetricsRepository } from '../storage/MetricsRepository';
import { ConfigRepository } from '../storage/ConfigRepository';
import { ProgressTracker } from './ProgressTracker';
import { Achievement, DailyMetrics } from '../types';
import * as vscode from 'vscode';

export class AchievementSystem {
  private metricsRepository: MetricsRepository;
  private configRepository: ConfigRepository;
  private progressTracker: ProgressTracker;
  private readonly onAchievementUnlockedEmitter: vscode.EventEmitter<Achievement>;
  public readonly onAchievementUnlocked: vscode.Event<Achievement>;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(
    metricsRepository: MetricsRepository,
    configRepository: ConfigRepository,
    progressTracker: ProgressTracker
  ) {
    this.metricsRepository = metricsRepository;
    this.configRepository = configRepository;
    this.progressTracker = progressTracker;

    // Create achievement unlocked event
    this.onAchievementUnlockedEmitter = new vscode.EventEmitter<Achievement>();
    this.onAchievementUnlocked = this.onAchievementUnlockedEmitter.event;
  }

  async initialize(): Promise<void> {
    // Check achievements on startup
    await this.checkAllAchievements();

    // Set up periodic checking (every 5 minutes)
    this.checkInterval = setInterval(async () => {
      await this.checkAllAchievements();
    }, 5 * 60 * 1000);
  }

  async checkAllAchievements(): Promise<void> {
    // CRITICAL: Don't check achievements with insufficient data
    // Require at least some real activity before triggering achievements
    const eventCount = await this.metricsRepository.getRealUserEventCount();
    if (eventCount < 5) {
      console.log(`[AchievementSystem] Insufficient data for achievements (${eventCount} events, need 5+)`);
      return;
    }

    const achievements = await this.configRepository.getAllAchievements();

    for (const achievement of achievements) {
      if (!achievement.unlocked) {
        await this.checkAchievement(achievement);
      }
    }
  }

  private async checkAchievement(achievement: Achievement): Promise<void> {
    const { requirement } = achievement;
    const previousProgress = achievement.progress || 0;
    let progress = 0;
    let shouldUnlock = false;

    switch (requirement.type) {
      case 'count':
        progress = await this.checkCountRequirement(requirement.metric, requirement.timeframe);
        shouldUnlock = progress >= requirement.target;
        break;

      case 'percentage':
        progress = await this.checkPercentageRequirement(requirement.metric, requirement.timeframe);
        shouldUnlock = this.checkPercentageTarget(
          achievement.id,
          progress,
          requirement.target
        );
        break;

      case 'threshold':
        progress = await this.checkThresholdRequirement(requirement.metric, requirement.timeframe);
        shouldUnlock = progress >= requirement.target;
        break;

      case 'streak':
        progress = await this.checkStreakRequirement(requirement.metric);
        shouldUnlock = progress >= requirement.target;
        break;
    }

    // Calculate progress percentage based on achievement type
    const progressPercentage = this.calculateProgressPercentage(
      achievement.id,
      requirement.type,
      progress,
      requirement.target
    );

    await this.configRepository.updateAchievementProgress(
      achievement.id,
      progressPercentage,
      shouldUnlock
    );

    // Fire progress milestone events (50%, 75%, 90%)
    const milestones = [50, 75, 90];
    for (const milestone of milestones) {
      if (previousProgress < milestone && progressPercentage >= milestone && !shouldUnlock) {
        // Fire event for this milestone
        this.onAchievementUnlockedEmitter.fire({
          ...achievement,
          progress: progressPercentage,
          // Use a special metadata field to indicate this is a progress notification
          metadata: { isProgressNotification: true, milestone }
        } as any);
      }
    }

    // Unlock if criteria met
    if (shouldUnlock && !achievement.unlocked) {
      await this.unlockAchievement(achievement);
    }
  }

  private async checkCountRequirement(metric: string, _timeframe?: string): Promise<number> {
    switch (metric) {
      case 'reviews': {
        return await this.metricsRepository.getRealUserEventCount();
      }

      case 'blind-approvals':
        // Note: Blind approval count tracking disabled
        return 0;

      default:
        return 0;
    }
  }

  private async checkPercentageRequirement(metric: string, timeframe?: string): Promise<number> {
    switch (metric) {
      case 'ai-percentage': {
        if (timeframe === 'week') {
          const last7Days = await this.getLast7DaysMetrics();
          const avgAI = this.calculateAverage(last7Days.map(m => m.aiPercentage));
          return Math.round(avgAI);
        } else if (timeframe === 'day') {
          const today = this.getTodayDateString();
          const metrics = await this.metricsRepository.getDailyMetrics(today);
          return Math.round(metrics?.aiPercentage || 0);
        }
        return 0;
      }

      case 'rejection-rate': {
        // Note: Acceptance rate tracking disabled, cannot calculate rejection rate
        return 0;
      }

      default:
        return 0;
    }
  }

  private async checkThresholdRequirement(metric: string, timeframe?: string): Promise<number> {
    switch (metric) {
      case 'average-review-time': {
        if (timeframe === 'day') {
          const today = this.getTodayDateString();
          const metrics = await this.metricsRepository.getDailyMetrics(today);
          return metrics?.averageReviewTime || 0;
        }
        return 0;
      }

      case 'level': {
        const level = await this.progressTracker.getLevel();
        return level;
      }

      default:
        return 0;
    }
  }

  private async checkStreakRequirement(metric: string): Promise<number> {
    switch (metric) {
      case 'daily-sessions': {
        return await this.progressTracker.getStreakDays();
      }

      default:
        return 0;
    }
  }

  /**
   * Calculate progress percentage for an achievement
   * Handles special cases like range-based achievements
   */
  private calculateProgressPercentage(
    achievementId: string,
    type: string,
    progress: number,
    target: number
  ): number {
    // Special handling for range-based percentage achievements
    if (type === 'percentage') {
      // Balanced Coder: needs to be in 40-60% range
      if (achievementId === 'balanced-coder') {
        const minTarget = 40;
        const maxTarget = 60;
        const idealTarget = 50;

        // If within range, perfect!
        if (progress >= minTarget && progress <= maxTarget) {
          return 100;
        }

        // If below range, show progress towards minimum
        if (progress < minTarget) {
          return Math.round((progress / minTarget) * 100);
        }

        // If above range, show distance from ideal (getting worse as you go higher)
        if (progress > maxTarget) {
          const distanceFromIdeal = Math.abs(progress - idealTarget);
          const maxDistance = 50; // 100% - 50% = 50% max distance
          const progressCalc = Math.max(0, 100 - (distanceFromIdeal / maxDistance) * 100);
          return Math.round(progressCalc);
        }
      }

      // Independent Thinker: wants AI under 40%
      if (achievementId === 'independent-thinker') {
        if (progress <= target) {
          return 100;
        }
        // Show progress as you get closer to target
        const distanceFromTarget = progress - target;
        const maxDistance = 60; // Assume 100% is worst case
        return Math.max(0, Math.round(100 - (distanceFromTarget / maxDistance) * 100));
      }
    }

    // Default: simple percentage calculation
    return Math.min(100, Math.round((progress / target) * 100));
  }

  private checkPercentageTarget(achievementId: string, current: number, target: number): boolean {
    // Independent Thinker: wants AI under 40%
    if (achievementId === 'independent-thinker') {
      return current <= target;
    }

    // Balanced Coder: wants AI between 40-60%
    if (achievementId === 'balanced-coder') {
      return current >= 40 && current <= 60;
    }

    // Quality Over Quantity: wants rejection rate >= 50%
    if (achievementId === 'quality-over-quantity') {
      return current >= target;
    }

    // Default: meet or exceed target
    return current >= target;
  }

  private async unlockAchievement(achievement: Achievement): Promise<void> {
    await this.configRepository.unlockAchievement(achievement.id);

    // Update the achievement object
    achievement.unlocked = true;
    achievement.unlockedAt = Date.now();
    achievement.progress = 100;

    // Emit event
    this.onAchievementUnlockedEmitter.fire(achievement);
  }

  async getAllAchievements(): Promise<Achievement[]> {
    return await this.configRepository.getAllAchievements();
  }

  async getUnlockedAchievements(): Promise<Achievement[]> {
    const all = await this.getAllAchievements();
    return all.filter(a => a.unlocked);
  }

  async getLockedAchievements(): Promise<Achievement[]> {
    const all = await this.getAllAchievements();
    return all.filter(a => !a.unlocked);
  }

  async getAchievementsByCategory(category: Achievement['category']): Promise<Achievement[]> {
    const all = await this.getAllAchievements();
    return all.filter(a => a.category === category);
  }

  async getAchievementProgress(achievementId: string): Promise<number> {
    const achievements = await this.getAllAchievements();
    const achievement = achievements.find(a => a.id === achievementId);
    return achievement?.progress || 0;
  }

  async getClosestAchievement(): Promise<Achievement | null> {
    const locked = await this.getLockedAchievements();

    if (locked.length === 0) {
      return null;
    }

    // Sort by progress (highest first)
    locked.sort((a, b) => (b.progress || 0) - (a.progress || 0));

    return locked[0];
  }

  async getAchievementsSummary(): Promise<string> {
    const all = await this.getAllAchievements();
    const unlocked = all.filter(a => a.unlocked);
    const byCategory = {
      review: all.filter(a => a.category === 'review'),
      balance: all.filter(a => a.category === 'balance'),
      consistency: all.filter(a => a.category === 'consistency'),
      learning: all.filter(a => a.category === 'learning')
    };

    const lines = [
      `🏆 Achievements: ${unlocked.length}/${all.length}`,
      '',
      `Review: ${byCategory.review.filter(a => a.unlocked).length}/${byCategory.review.length}`,
      `Balance: ${byCategory.balance.filter(a => a.unlocked).length}/${byCategory.balance.length}`,
      `Consistency: ${byCategory.consistency.filter(a => a.unlocked).length}/${byCategory.consistency.length}`,
      `Learning: ${byCategory.learning.filter(a => a.unlocked).length}/${byCategory.learning.length}`
    ];

    const closest = await this.getClosestAchievement();
    if (closest) {
      lines.push('');
      lines.push(`Next: ${closest.icon} ${closest.title} (${closest.progress}%)`);
    }

    return lines.join('\n');
  }

  async triggerCheck(): Promise<void> {
    await this.checkAllAchievements();
  }

  async checkRelevantAchievements(eventType: 'review' | 'session' | 'daily'): Promise<void> {
    const achievements = await this.configRepository.getAllAchievements();
    const relevant = achievements.filter(a => !a.unlocked);

    for (const achievement of relevant) {
      // Check based on event type
      if (eventType === 'review' && achievement.category === 'review') {
        await this.checkAchievement(achievement);
      } else if (eventType === 'session' && achievement.category === 'consistency') {
        await this.checkAchievement(achievement);
      } else if (eventType === 'daily') {
        // Daily checks can check all types
        await this.checkAchievement(achievement);
      }
    }
  }

  private async getLast7DaysMetrics(): Promise<DailyMetrics[]> {
    const metrics: DailyMetrics[] = [];
    const today = new Date();

    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const dayMetrics = await this.metricsRepository.getDailyMetrics(dateStr);
      if (dayMetrics) {
        metrics.push(dayMetrics);
      }
    }

    return metrics;
  }

  private calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) {return 0;}
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  }

  private getTodayDateString(): string {
    return new Date().toISOString().split('T')[0];
  }

  dispose(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.onAchievementUnlockedEmitter.dispose();
  }
}
