/**
 * FileTreeBuilder Tests
 */

import { FileTreeBuilder } from '../FileTreeBuilder';
import { FileReviewStatus, AITool, ReviewQuality } from '../../types';

describe('FileTreeBuilder', () => {
  let builder: FileTreeBuilder;

  beforeEach(() => {
    builder = new FileTreeBuilder();
  });

  const createMockFile = (filePath: string, overrides: Partial<FileReviewStatus> = {}): FileReviewStatus => ({
    filePath,
    date: '2026-01-14',
    tool: AITool.ClaudeCode,
    reviewQuality: ReviewQuality.None,
    reviewScore: 0,
    isReviewed: false,
    linesGenerated: 100,
    linesAdded: 50,
    linesRemoved: 20,
    charactersCount: 1000,
    isAgentGenerated: true,
    wasFileOpen: false,
    firstGeneratedAt: Date.now(),
    totalReviewTime: 0,
    modificationCount: 1,
    totalTimeInFocus: 0,
    scrollEventCount: 0,
    cursorMovementCount: 0,
    editsMade: false,
    reviewSessionsCount: 0,
    reviewedInTerminal: false,
    ...overrides
  });

  describe('build', () => {
    it('should build tree from file list', () => {
      const files = [
        createMockFile('/workspace/src/components/Button.tsx'),
        createMockFile('/workspace/src/utils/helpers.ts')
      ];

      const tree = builder.build(files, new Map(), '/workspace');

      expect(tree.name).toBe('root');
      expect(tree.children.length).toBe(1); // 'src' directory
      expect(tree.children[0].name).toBe('src');
      expect(tree.children[0].children.length).toBe(2); // 'components' and 'utils'
    });

    it('should handle empty file list', () => {
      const tree = builder.build([], new Map());

      expect(tree.name).toBe('root');
      expect(tree.children.length).toBe(0);
    });

    it('should respect expansion state', () => {
      const files = [
        createMockFile('/src/components/Button.tsx')
      ];
      const expansionState = new Map([['src', false]]);

      const tree = builder.build(files, expansionState);

      const srcNode = tree.children.find(c => c.name === 'src');
      expect(srcNode?.isExpanded).toBe(false);
    });

    it('should calculate aggregate stats for directories', () => {
      const files = [
        createMockFile('/src/a.ts', { linesAdded: 100, linesRemoved: 20 }),
        createMockFile('/src/b.ts', { linesAdded: 50, linesRemoved: 30 })
      ];

      const tree = builder.build(files, new Map());

      const srcNode = tree.children.find(c => c.name === 'src');
      expect(srcNode?.stats.filesChanged).toBe(2);
      expect(srcNode?.stats.linesAdded).toBe(150);
      expect(srcNode?.stats.linesRemoved).toBe(50);
    });
  });

  describe('parsePath', () => {
    it('should parse Unix paths', () => {
      const segments = builder.parsePath('/src/components/Button.tsx');
      expect(segments).toEqual(['src', 'components', 'Button.tsx']);
    });

    it('should parse Windows paths', () => {
      const segments = builder.parsePath('src\\components\\Button.tsx');
      expect(segments).toEqual(['src', 'components', 'Button.tsx']);
    });

    it('should handle empty path', () => {
      const segments = builder.parsePath('');
      expect(segments).toEqual([]);
    });

    it('should filter empty segments', () => {
      const segments = builder.parsePath('//src///file.ts');
      expect(segments).toEqual(['src', 'file.ts']);
    });
  });

  describe('sortTree', () => {
    it('should sort directories before files', () => {
      const files = [
        createMockFile('/file.ts'),
        createMockFile('/src/a.ts'),
        createMockFile('/utils/b.ts')
      ];

      const tree = builder.build(files, new Map());

      // Directories should come first
      expect(tree.children[0].type).toBe('directory');
      expect(tree.children[1].type).toBe('directory');
      expect(tree.children[2].type).toBe('file');
    });

    it('should sort alphabetically within same type', () => {
      const files = [
        createMockFile('/z.ts'),
        createMockFile('/a.ts'),
        createMockFile('/m.ts')
      ];

      const tree = builder.build(files, new Map());

      const fileNames = tree.children.map(c => c.name);
      expect(fileNames).toEqual(['a.ts', 'm.ts', 'z.ts']);
    });
  });

  describe('getMaxDepth', () => {
    it('should calculate correct max depth', () => {
      const files = [
        createMockFile('/a/b/c/d/file.ts')
      ];

      const tree = builder.build(files, new Map());
      const maxDepth = builder.getMaxDepth(tree);

      expect(maxDepth).toBe(5); // root(0) -> a(1) -> b(2) -> c(3) -> d(4) -> file(5)
    });
  });

  describe('getAllFiles', () => {
    it('should return all file nodes', () => {
      const files = [
        createMockFile('/src/a.ts'),
        createMockFile('/src/b.ts'),
        createMockFile('/tests/c.ts')
      ];

      const tree = builder.build(files, new Map());
      const allFiles = builder.getAllFiles(tree);

      expect(allFiles.length).toBe(3);
      expect(allFiles.every(f => f.type === 'file')).toBe(true);
    });
  });
});
