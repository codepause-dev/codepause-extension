/**
 * FileTreeBuilder
 * Builds hierarchical file tree from flat file list
 * Handles sorting, grouping, and state management
 */

import {
  FileReviewStatus,
  FileTreeNode
} from '../types';
import { DiffViewService } from './DiffViewService';

export class FileTreeBuilder {
  private diffViewService: DiffViewService;

  constructor() {
    this.diffViewService = new DiffViewService();
  }

  /**
   * Build file tree from flat file list
   * @param files - Flat list of file review statuses
   * @param expansionState - Map of directory paths to expansion state
   * @param workspaceRoot - Workspace root path (to compute relative paths)
   */
  build(
    files: FileReviewStatus[],
    expansionState: Map<string, boolean> = new Map(),
    workspaceRoot: string = ''
  ): FileTreeNode {
    // Create root node
    const root: FileTreeNode = {
      name: 'root',
      path: '',
      type: 'directory',
      children: [],
      stats: { filesChanged: 0, filesReviewed: 0, linesAdded: 0, linesRemoved: 0 },
      isExpanded: true,
      depth: 0
    };

    if (!files || files.length === 0) {
      return root;
    }

    // Insert each file into the tree
    for (const file of files) {
      this.insertFile(root, file, expansionState, workspaceRoot);
    }

    // Sort the tree (directories first, then alphabetically)
    this.sortTree(root);

    // Calculate aggregate statistics for all nodes
    this.diffViewService.calculateNodeStats(root);

    return root;
  }

  /**
   * Insert a file into the tree, creating parent directories as needed
   */
  private insertFile(
    root: FileTreeNode,
    file: FileReviewStatus,
    expansionState: Map<string, boolean>,
    workspaceRoot: string
  ): void {
    // Compute relative path from workspace root
    let relativePath = file.filePath;
    if (workspaceRoot && file.filePath.startsWith(workspaceRoot)) {
      relativePath = file.filePath.substring(workspaceRoot.length);
      // Remove leading slash
      if (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
        relativePath = relativePath.substring(1);
      }
    }

    // Parse path into segments
    const segments = this.parsePath(relativePath);

    if (segments.length === 0) {
      return;
    }

    // Navigate/create directory structure
    let currentNode = root;
    let currentPath = '';

    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;

      // Find or create directory node
      let childNode = currentNode.children.find(
        c => c.type === 'directory' && c.name === segment
      );

      if (!childNode) {
        // Determine expansion state (default: expanded)
        const isExpanded = expansionState.has(currentPath)
          ? expansionState.get(currentPath)!
          : true;

        childNode = {
          name: segment,
          path: currentPath,
          type: 'directory',
          children: [],
          stats: { filesChanged: 0, filesReviewed: 0, linesAdded: 0, linesRemoved: 0 },
          isExpanded,
          depth: i + 1
        };
        currentNode.children.push(childNode);
      }

      currentNode = childNode;
    }

    // Add file node
    const fileName = segments[segments.length - 1];
    const filePath = currentPath ? `${currentPath}/${fileName}` : fileName;
    const status = this.diffViewService.determineFileStatus(file);

    const fileNode: FileTreeNode = {
      name: fileName,
      path: filePath,
      type: 'file',
      children: [],
      file: file,
      stats: {
        filesChanged: 1,
        filesReviewed: file.isReviewed ? 1 : 0,
        linesAdded: file.linesAdded ?? 0,
        linesRemoved: file.linesRemoved ?? 0
      },
      isExpanded: false,
      depth: segments.length,
      status
    };

    currentNode.children.push(fileNode);
  }

  /**
   * Parse file path into segments
   * Handles both Unix (/) and Windows (\) paths
   */
  parsePath(filePath: string): string[] {
    if (!filePath) {
      return [];
    }

    // Normalize to forward slashes
    const normalized = filePath.replace(/\\/g, '/');

    // Split and filter empty segments
    return normalized.split('/').filter(s => s.length > 0);
  }

  /**
   * Sort tree nodes recursively
   * Order: directories first, then files, both alphabetically
   */
  sortTree(node: FileTreeNode): void {
    if (node.children.length === 0) {
      return;
    }

    node.children.sort((a, b) => {
      // Directories come before files
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }

      // Alphabetical within same type (case-insensitive)
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    // Recursively sort children
    for (const child of node.children) {
      if (child.type === 'directory') {
        this.sortTree(child);
      }
    }
  }

  /**
   * Find a node by path
   */
  findNode(root: FileTreeNode, path: string): FileTreeNode | null {
    if (root.path === path) {
      return root;
    }

    for (const child of root.children) {
      if (child.path === path) {
        return child;
      }
      if (child.type === 'directory') {
        const found = this.findNode(child, path);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }

  /**
   * Get all file nodes (flattened)
   */
  getAllFiles(node: FileTreeNode): FileTreeNode[] {
    const files: FileTreeNode[] = [];

    if (node.type === 'file') {
      files.push(node);
    } else {
      for (const child of node.children) {
        files.push(...this.getAllFiles(child));
      }
    }

    return files;
  }

  /**
   * Get maximum depth of the tree
   */
  getMaxDepth(node: FileTreeNode): number {
    if (node.children.length === 0) {
      return node.depth;
    }

    let maxDepth = node.depth;
    for (const child of node.children) {
      maxDepth = Math.max(maxDepth, this.getMaxDepth(child));
    }

    return maxDepth;
  }
}
