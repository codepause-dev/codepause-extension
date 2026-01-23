/**
 * DiffViewService
 * Core service for file diff operations, statistics, and transformations
 */

import {
  FileReviewStatus,
  FileTreeNode,
  DiffStatistics,
  ChangeBarData,
  FileChangeStatus
} from '../types';

export class DiffViewService {
  /**
   * Calculate aggregate statistics for a list of files
   */
  calculateStatistics(files: FileReviewStatus[]): DiffStatistics {
    if (!files || files.length === 0) {
      return {
        totalFiles: 0,
        totalAdditions: 0,
        totalDeletions: 0,
        totalChanges: 0,
        filesAdded: 0,
        filesModified: 0,
        filesDeleted: 0,
        reviewedFiles: 0,
        unreviewedFiles: 0,
        reviewProgress: 0
      };
    }

    let totalAdditions = 0;
    let totalDeletions = 0;
    let filesAdded = 0;
    let filesModified = 0;
    let filesDeleted = 0;
    let reviewedFiles = 0;

    for (const file of files) {
      const added = file.linesAdded ?? 0;
      const removed = file.linesRemoved ?? 0;

      totalAdditions += added;
      totalDeletions += removed;

      // Determine file status
      const status = this.determineFileStatus(file);
      switch (status) {
        case FileChangeStatus.Added:
          filesAdded++;
          break;
        case FileChangeStatus.Deleted:
          filesDeleted++;
          break;
        case FileChangeStatus.Modified:
          filesModified++;
          break;
      }

      if (file.isReviewed) {
        reviewedFiles++;
      }
    }

    const totalFiles = files.length;
    const unreviewedFiles = totalFiles - reviewedFiles;
    const reviewProgress = totalFiles > 0
      ? Math.round((reviewedFiles / totalFiles) * 100)
      : 0;

    return {
      totalFiles,
      totalAdditions,
      totalDeletions,
      totalChanges: totalAdditions + totalDeletions,
      filesAdded,
      filesModified,
      filesDeleted,
      reviewedFiles,
      unreviewedFiles,
      reviewProgress
    };
  }

  /**
   * Determine file change status based on line changes
   *
   * Logic:
   * - Added: File is NEW (linesGenerated === linesAdded, meaning all content is new)
   * - Modified: File already existed (linesGenerated > linesAdded, OR has deletions)
   * - Deleted: File only has deletions with no additions
   * - Unchanged: No changes at all
   */
  determineFileStatus(file: FileReviewStatus): FileChangeStatus {
    const added = file.linesAdded ?? 0;
    const removed = file.linesRemoved ?? 0;
    const generated = file.linesGenerated ?? 0;

    // No changes at all
    if (added === 0 && removed === 0) {
      return FileChangeStatus.Unchanged;
    }

    // File with only deletions = Deleted
    if (removed > 0 && added === 0) {
      return FileChangeStatus.Deleted;
    }

    // File is NEW only if ALL generated content equals the additions
    // This means the file didn't exist before this AI generation
    // Example: linesGenerated=166, linesAdded=166 → NEW file
    // Example: linesGenerated=477, linesAdded=166 → EXISTING file (had 311 lines before)
    // Special case: linesGenerated=0 indicates new file (no prior content)
    if (added > 0 && removed === 0 && (generated === added || generated === 0)) {
      return FileChangeStatus.Added;
    }

    // File already had content (modified) - either:
    // - Has both additions and deletions
    // - Has additions but file already had content (linesGenerated > linesAdded)
    if (added > 0 || removed > 0) {
      return FileChangeStatus.Modified;
    }

    return FileChangeStatus.Unchanged;
  }

  /**
   * Generate change bar visualization data
   * Handles edge cases: zero changes, only additions, only deletions
   */
  generateChangeBar(linesAdded: number, linesRemoved: number): ChangeBarData {
    const added = Math.max(0, linesAdded || 0);
    const removed = Math.max(0, linesRemoved || 0);
    const total = added + removed;

    // Handle zero changes
    if (total === 0) {
      return {
        additionsWidth: 0,
        deletionsWidth: 0,
        totalChanges: 0,
        showBar: false
      };
    }

    return {
      additionsWidth: Math.round((added / total) * 100),
      deletionsWidth: Math.round((removed / total) * 100),
      totalChanges: total,
      showBar: true
    };
  }

  /**
   * Group files by their parent directory
   */
  groupByDirectory(files: FileReviewStatus[]): Map<string, FileReviewStatus[]> {
    const grouped = new Map<string, FileReviewStatus[]>();

    for (const file of files) {
      const dir = this.getParentDirectory(file.filePath);

      if (!grouped.has(dir)) {
        grouped.set(dir, []);
      }
      grouped.get(dir)!.push(file);
    }

    return grouped;
  }

  /**
   * Get parent directory from file path
   */
  private getParentDirectory(filePath: string): string {
    // Handle both Unix and Windows paths
    const normalizedPath = filePath.replace(/\\/g, '/');
    const lastSlash = normalizedPath.lastIndexOf('/');

    if (lastSlash === -1) {
      return '.'; // Root directory
    }

    return normalizedPath.substring(0, lastSlash) || '.';
  }

  /**
   * Format line count for display (e.g., 1.2K for large numbers)
   */
  formatLineCount(count: number): string {
    if (count >= 10000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  }

  /**
   * Calculate aggregate stats for a tree node and its children
   */
  calculateNodeStats(node: FileTreeNode): void {
    if (node.type === 'file' && node.file) {
      node.stats = {
        filesChanged: 1,
        filesReviewed: node.file.isReviewed ? 1 : 0,
        linesAdded: node.file.linesAdded ?? 0,
        linesRemoved: node.file.linesRemoved ?? 0
      };
      return;
    }

    // Directory: aggregate from children
    let filesChanged = 0;
    let filesReviewed = 0;
    let linesAdded = 0;
    let linesRemoved = 0;

    for (const child of node.children) {
      this.calculateNodeStats(child);
      filesChanged += child.stats.filesChanged;
      filesReviewed += child.stats.filesReviewed;
      linesAdded += child.stats.linesAdded;
      linesRemoved += child.stats.linesRemoved;
    }

    node.stats = {
      filesChanged,
      filesReviewed,
      linesAdded,
      linesRemoved
    };
  }
}
