/**
 * FileReviewTracker
 * Maintains file-level review status and provides file review history
 */

import {
  FileReviewStatus,
  ReviewQuality,
  AITool
} from '../types';

/**
 * File review query options
 */
export interface FileReviewQuery {
  date?: string; // Filter by date (YYYY-MM-DD)
  tool?: AITool; // Filter by tool
  isReviewed?: boolean; // Filter by review status
  minScore?: number; // Minimum review score
  maxScore?: number; // Maximum review score
}

/**
 * File review statistics
 */
export interface FileReviewStats {
  totalFiles: number;
  reviewedFiles: number;
  unreviewedFiles: number;
  averageScore: number;
  thoroughCount: number;
  lightCount: number;
  noneCount: number;
  totalLines: number;
  reviewedLines: number;
  unreviewedLines: number;
}

export class FileReviewTracker {
  private fileStatuses: Map<string, FileReviewStatus> = new Map();

  /**
   * Track or update file review status
   */
  trackFile(status: FileReviewStatus): void {
    const key = this.getFileKey(status.filePath, status.date, status.tool);
    this.fileStatuses.set(key, status);
  }

  /**
   * Get review status for a specific file
   */
  getFileStatus(filePath: string, date: string, tool: AITool): FileReviewStatus | null {
    const key = this.getFileKey(filePath, date, tool);
    return this.fileStatuses.get(key) ?? null;
  }

  /**
   * Update review status for a file
   */
  updateFileStatus(
    filePath: string,
    date: string,
    tool: AITool,
    updates: Partial<FileReviewStatus>
  ): void {
    const key = this.getFileKey(filePath, date, tool);
    const existing = this.fileStatuses.get(key);

    if (existing) {
      this.fileStatuses.set(key, {
        ...existing,
        ...updates
      });
    }
  }

  /**
   * Mark file as reviewed
   */
  markAsReviewed(
    filePath: string,
    date: string,
    tool: AITool,
    reviewQuality: ReviewQuality,
    reviewScore: number
  ): void {
    this.updateFileStatus(filePath, date, tool, {
      isReviewed: true,
      reviewQuality,
      reviewScore,
      lastReviewedAt: Date.now()
    });
  }

  /**
   * Get all unreviewed files
   */
  getUnreviewedFiles(query?: FileReviewQuery): FileReviewStatus[] {
    return this.queryFiles({
      ...query,
      isReviewed: false
    });
  }

  /**
   * Get all reviewed files
   */
  getReviewedFiles(query?: FileReviewQuery): FileReviewStatus[] {
    return this.queryFiles({
      ...query,
      isReviewed: true
    });
  }

  /**
   * Query files with filters
   */
  queryFiles(query?: FileReviewQuery): FileReviewStatus[] {
    let results = Array.from(this.fileStatuses.values());

    if (!query) {
      return results;
    }

    // Filter by date
    if (query.date) {
      results = results.filter(f => f.date === query.date);
    }

    // Filter by tool
    if (query.tool) {
      results = results.filter(f => f.tool === query.tool);
    }

    // Filter by review status
    if (query.isReviewed !== undefined) {
      results = results.filter(f => f.isReviewed === query.isReviewed);
    }

    // Filter by score range
    if (query.minScore !== undefined) {
      results = results.filter(f => f.reviewScore >= query.minScore!);
    }

    if (query.maxScore !== undefined) {
      results = results.filter(f => f.reviewScore <= query.maxScore!);
    }

    return results;
  }

  /**
   * Get files from a specific agent session
   */
  getAgentSessionFiles(agentSessionId: string): FileReviewStatus[] {
    return Array.from(this.fileStatuses.values()).filter(
      f => f.agentSessionId === agentSessionId
    );
  }

  /**
   * Get review history for a specific file
   */
  getFileHistory(filePath: string): FileReviewStatus[] {
    return Array.from(this.fileStatuses.values()).filter(
      f => f.filePath === filePath
    ).sort((a, b) => b.firstGeneratedAt - a.firstGeneratedAt);
  }

  /**
   * Get statistics for files
   */
  getStats(query?: FileReviewQuery): FileReviewStats {
    const files = this.queryFiles(query);

    let totalFiles = 0;
    let reviewedFiles = 0;
    let unreviewedFiles = 0;
    let totalScore = 0;
    let thoroughCount = 0;
    let lightCount = 0;
    let noneCount = 0;
    let totalLines = 0;
    let reviewedLines = 0;
    let unreviewedLines = 0;

    for (const file of files) {
      totalFiles++;
      totalLines += file.linesGenerated;

      if (file.isReviewed) {
        reviewedFiles++;
        reviewedLines += file.linesGenerated;
      } else {
        unreviewedFiles++;
        unreviewedLines += file.linesGenerated;
      }

      totalScore += file.reviewScore;

      if (file.reviewQuality === ReviewQuality.Thorough) {
        thoroughCount++;
      } else if (file.reviewQuality === ReviewQuality.Light) {
        lightCount++;
      } else {
        noneCount++;
      }
    }

    return {
      totalFiles,
      reviewedFiles,
      unreviewedFiles,
      averageScore: totalFiles > 0 ? Math.round(totalScore / totalFiles) : 0,
      thoroughCount,
      lightCount,
      noneCount,
      totalLines,
      reviewedLines,
      unreviewedLines
    };
  }

  /**
   * Get files that need review (unreviewed or light review)
   */
  getFilesNeedingReview(date?: string): FileReviewStatus[] {
    const files = this.queryFiles({ date });

    return files.filter(f =>
      !f.isReviewed ||
      f.reviewQuality === ReviewQuality.None ||
      f.reviewQuality === ReviewQuality.Light
    ).sort((a, b) => {
      // Sort by priority: None > Light > unreviewed
      const priorityA = this.getReviewPriority(a);
      const priorityB = this.getReviewPriority(b);
      return priorityB - priorityA;
    });
  }

  /**
   * Calculate review priority (higher = more urgent)
   */
  private getReviewPriority(file: FileReviewStatus): number {
    let priority = 0;

    // Not reviewed = highest priority
    if (!file.isReviewed) {
      priority += 100;
    }

    // Review quality priority
    if (file.reviewQuality === ReviewQuality.None) {
      priority += 50;
    } else if (file.reviewQuality === ReviewQuality.Light) {
      priority += 25;
    }

    // Agent-generated = higher priority
    if (file.isAgentGenerated) {
      priority += 20;
    }

    // Lines of code (more lines = higher priority, capped at 20)
    priority += Math.min(file.linesGenerated / 10, 20);

    // Age (older = higher priority)
    const ageInHours = (Date.now() - file.firstGeneratedAt) / (1000 * 60 * 60);
    priority += Math.min(ageInHours, 10);

    return priority;
  }

  /**
   * Generate a unique key for file status lookup
   */
  private getFileKey(filePath: string, date: string, tool: AITool): string {
    return `${filePath}|${date}|${tool}`;
  }

  /**
   * Clear all tracked files
   */
  clear(): void {
    this.fileStatuses.clear();
  }

  /**
   * Clear files for a specific date
   */
  clearDate(date: string): void {
    for (const [key, status] of this.fileStatuses.entries()) {
      if (status.date === date) {
        this.fileStatuses.delete(key);
      }
    }
  }

  /**
   * Get total number of tracked files
   */
  getFileCount(): number {
    return this.fileStatuses.size;
  }

  /**
   * Check if a file is being tracked
   */
  hasFile(filePath: string, date: string, tool: AITool): boolean {
    const key = this.getFileKey(filePath, date, tool);
    return this.fileStatuses.has(key);
  }

  /**
   * Remove a file from tracking
   */
  removeFile(filePath: string, date: string, tool: AITool): boolean {
    const key = this.getFileKey(filePath, date, tool);
    return this.fileStatuses.delete(key);
  }

  /**
   * Get files grouped by review quality
   */
  getFilesByQuality(): {
    thorough: FileReviewStatus[];
    light: FileReviewStatus[];
    none: FileReviewStatus[];
  } {
    const files = Array.from(this.fileStatuses.values());

    return {
      thorough: files.filter(f => f.reviewQuality === ReviewQuality.Thorough),
      light: files.filter(f => f.reviewQuality === ReviewQuality.Light),
      none: files.filter(f => f.reviewQuality === ReviewQuality.None)
    };
  }

  /**
   * Get files grouped by tool
   */
  getFilesByTool(): Record<AITool, FileReviewStatus[]> {
    const files = Array.from(this.fileStatuses.values());

    const grouped: Record<AITool, FileReviewStatus[]> = {
      [AITool.Copilot]: [],
      [AITool.Cursor]: [],
      [AITool.ClaudeCode]: []
    };

    for (const file of files) {
      grouped[file.tool].push(file);
    }

    return grouped;
  }

  /**
   * Get recent files (last N files, sorted by generation time)
   */
  getRecentFiles(limit: number = 10): FileReviewStatus[] {
    const files = Array.from(this.fileStatuses.values());

    return files
      .sort((a, b) => b.firstGeneratedAt - a.firstGeneratedAt)
      .slice(0, limit);
  }

  /**
   * Export all file statuses as array
   */
  exportAll(): FileReviewStatus[] {
    return Array.from(this.fileStatuses.values());
  }

  /**
   * Import file statuses from array
   */
  importAll(statuses: FileReviewStatus[]): void {
    for (const status of statuses) {
      this.trackFile(status);
    }
  }
}
