/**
 * ProgressTracker
 * Manages user XP, leveling, and progression system
 */

import { MetricsRepository } from '../storage/MetricsRepository';
import { ConfigRepository } from '../storage/ConfigRepository';
import { UserProgression, XP_THRESHOLDS } from '../types';
import * as vscode from 'vscode';

export class ProgressTracker {
  private metricsRepository: MetricsRepository;
  private configRepository: ConfigRepository;
  private currentProgression: UserProgression | null = null;
  private readonly onLevelUpEmitter: vscode.EventEmitter<number>;
  public readonly onLevelUp: vscode.Event<number>;

  constructor(
    metricsRepository: MetricsRepository,
    configRepository: ConfigRepository
  ) {
    this.metricsRepository = metricsRepository;
    this.configRepository = configRepository;

    // Create level up event emitter
    this.onLevelUpEmitter = new vscode.EventEmitter<number>();
    this.onLevelUp = this.onLevelUpEmitter.event;
  }

  async initialize(): Promise<void> {
    await this.updateProgression();
  }

  async getProgression(): Promise<UserProgression> {
    if (!this.currentProgression) {
      await this.updateProgression();
    }

    return this.currentProgression!;
  }

  async updateProgression(): Promise<void> {
    const stats = await this.metricsRepository.getStatsSummary();
    const achievements = await this.configRepository.getAllAchievements();

    const totalXP = stats.totalEvents; // Each event = 1 XP
    const level = this.calculateLevel(totalXP);
    const currentLevelXP = XP_THRESHOLDS[level - 1] || 0;
    const nextLevelXP = XP_THRESHOLDS[level] || XP_THRESHOLDS[XP_THRESHOLDS.length - 1];

    const previousProgression = this.currentProgression;

    this.currentProgression = {
      level,
      currentXP: totalXP - currentLevelXP,
      nextLevelXP: nextLevelXP - currentLevelXP,
      totalEvents: stats.totalEvents,
      achievements,
      unlockedAchievements: achievements.filter(a => a.unlocked).length,
      totalAchievements: achievements.length
    };

    // Check if user leveled up
    if (previousProgression && previousProgression.level < level) {
      this.onLevelUpEmitter.fire(level);
    }
  }

  private calculateLevel(xp: number): number {
    for (let i = XP_THRESHOLDS.length - 1; i >= 0; i--) {
      if (xp >= XP_THRESHOLDS[i]) {
        return i + 1;
      }
    }
    return 1; // Minimum level
  }

  async getLevel(): Promise<number> {
    const progression = await this.getProgression();
    return progression.level;
  }

  async getProgressPercentage(): Promise<number> {
    const progression = await this.getProgression();

    if (progression.nextLevelXP === 0) {
      return 100; // Max level reached
    }

    return Math.round((progression.currentXP / progression.nextLevelXP) * 100);
  }

  async getXPToNextLevel(): Promise<number> {
    const progression = await this.getProgression();
    return Math.max(0, progression.nextLevelXP - progression.currentXP);
  }

  getLevelTitle(level: number): string {
    const titles: Record<number, string> = {
      1: 'Mindful Novice',
      2: 'Aware Apprentice',
      3: 'Conscious Coder',
      4: 'Thoughtful Developer',
      5: 'Balanced Builder',
      6: 'Mindful Master',
      7: 'Zen Engineer',
      8: 'Enlightened Architect',
      9: 'Transcendent Technologist'
    };

    return titles[level] || 'Mindful Coder';
  }

  getLevelIcon(level: number): string {
    const icons: Record<number, string> = {
      1: '🌱',
      2: '🌿',
      3: '🍀',
      4: '🌳',
      5: '⚖️',
      6: '🧘',
      7: '☯️',
      8: '💫',
      9: '✨'
    };

    return icons[level] || '⏸️';
  }

  async getLevelMessage(): Promise<string> {
    const level = await this.getLevel();

    const messages: Record<number, string> = {
      1: 'Starting your journey to mindful coding!',
      2: 'You\'re becoming more aware of your AI usage!',
      3: 'Great progress in developing conscious coding habits!',
      4: 'Your thoughtful approach is paying off!',
      5: 'You\'ve found your balance with AI tools!',
      6: 'Mastering the art of mindful development!',
      7: 'Your coding zen is inspiring!',
      8: 'Architecting with wisdom and intention!',
      9: 'You\'ve transcended - teaching others through example!'
    };

    return messages[level] || 'Keep up the mindful coding!';
  }

  async addXP(_amount: number = 1): Promise<void> {
    // XP is automatically calculated from total events
    // This method updates the progression
    await this.updateProgression();
  }

  async getProgressionSummary(): Promise<string> {
    const progression = await this.getProgression();
    const level = progression.level;
    const title = this.getLevelTitle(level);
    const icon = this.getLevelIcon(level);
    const percentage = await this.getProgressPercentage();
    const xpNeeded = await this.getXPToNextLevel();

    const lines = [
      `${icon} Level ${level}: ${title}`,
      `Progress: ${percentage}% (${xpNeeded} XP to next level)`,
      `Achievements: ${progression.unlockedAchievements}/${progression.totalAchievements}`,
      `Total Events: ${progression.totalEvents}`
    ];

    return lines.join('\n');
  }

  async exportProgression(): Promise<UserProgression> {
    return await this.getProgression();
  }

  static getLevelThresholds(): number[] {
    return [...XP_THRESHOLDS];
  }

  static getMaxLevel(): number {
    return XP_THRESHOLDS.length;
  }

  static calculateLevelFromXP(xp: number): number {
    for (let i = XP_THRESHOLDS.length - 1; i >= 0; i--) {
      if (xp >= XP_THRESHOLDS[i]) {
        return i + 1;
      }
    }
    return 1;
  }

  async isMaxLevel(): Promise<boolean> {
    const level = await this.getLevel();
    return level >= ProgressTracker.getMaxLevel();
  }

  async getStreakDays(): Promise<number> {
    const today = new Date();
    let streak = 0;

    for (let i = 0; i < 365; i++) {
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
  }

  async getMotivationalQuote(): Promise<string> {
    const level = await this.getLevel();
    const percentage = await this.getProgressPercentage();

    const quotes: string[] = [
      'The journey of a thousand lines begins with a single keystroke.',
      'Mindfulness in code leads to mastery in craft.',
      'Balance is not something you find, it\'s something you create.',
      'AI is a tool. Wisdom is knowing when to use it.',
      'Great developers don\'t just write code, they craft solutions.',
      'Every review is an opportunity to learn.',
      'Slow is smooth, smooth is fast.',
      'The code you understand is code you can maintain.',
      'Thoughtful development beats hasty implementation.',
      'Your judgment is your most valuable tool.'
    ];

    // Pick quote based on level and progress
    const index = (level + Math.floor(percentage / 10)) % quotes.length;
    return quotes[index];
  }

  dispose(): void {
    this.onLevelUpEmitter.dispose();
  }
}
