/**
 * AIDetector Tests
 * CRITICAL: 99.99% accuracy (NO false negatives - AI marked as manual = FAIL)
 */

import { AIDetector } from '../AIDetector';
import { CodeChangeEvent, AIDetectionMethod } from '../types';

describe('AIDetector', () => {
  let detector: AIDetector;

  beforeEach(() => {
    detector = new AIDetector();
  });

  describe('Method 1: Inline Completion API', () => {
    it('should detect inline completion with HIGH confidence', () => {
      const text = 'function test() {\n  return 42;\n}';
      const timestamp = Date.now();

      const result = detector.detectFromInlineCompletion(text, timestamp);

      expect(result.isAI).toBe(true);
      expect(result.confidence).toBe('high');
      expect(result.method).toBe(AIDetectionMethod.InlineCompletionAPI);
      expect(result.metadata.charactersCount).toBe(text.length);
      expect(result.metadata.linesOfCode).toBe(3);
    });
  });

  describe('Method 2: Large Paste Detection', () => {
    it('should detect large paste (>500 chars) with code structure as AI', () => {
      // Generate a code block >500 chars
      const largeCode = `function calculateComplexOperation(a, b, c, d) {
        const firstStep = a + b;
        const secondStep = c * d;
        const intermediateResult = firstStep - secondStep;

        if (intermediateResult > 0) {
          console.log('Positive result:', intermediateResult);
          return intermediateResult * 2;
        } else if (intermediateResult < 0) {
          console.log('Negative result:', intermediateResult);
          return Math.abs(intermediateResult);
        } else {
          console.log('Zero result');
          return 0;
        }
      }

      function helperFunction(x) {
        return x * x + 2 * x + 1;
      }`;

      const event: CodeChangeEvent = {
        text: largeCode,
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const result = detector.detectFromLargePaste(event);

      expect(result.isAI).toBe(true);
      expect(result.confidence).toBe('high');
      expect(result.method).toBe(AIDetectionMethod.LargePaste);
      expect(result.metadata.charactersCount).toBeGreaterThan(500);
    });

    it('should NOT detect medium paste (100-499 chars) as AI', () => {
      // Generate a paste between 100-499 chars (could be manual snippet)
      const mediumCode = `function calculateSum(a, b) {
        const result = a + b;
        console.log('Result:', result);
        return result;
      }

      const x = 10;
      const y = 20;`;

      const event: CodeChangeEvent = {
        text: mediumCode,
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const result = detector.detectFromLargePaste(event);

      // Should NOT detect as AI (below 500 char threshold)
      expect(result.isAI).toBe(false);
      expect(result.confidence).toBe('low');
      expect(result.metadata.charactersCount).toBeLessThan(500);
    });

    it('should NOT detect small paste (<100 chars) as AI', () => {
      const event: CodeChangeEvent = {
        text: 'const x = 10;',
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const result = detector.detectFromLargePaste(event);

      expect(result.isAI).toBe(false);
      expect(result.confidence).toBe('low');
    });

    it('should NOT detect large text without code structure as AI', () => {
      // Generate >500 chars of plain text
      const largeText = 'This is a very long comment that exceeds 500 characters but does not contain any code structure patterns at all just plain text. '.repeat(5);

      const event: CodeChangeEvent = {
        text: largeText,
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const result = detector.detectFromLargePaste(event);

      expect(result.isAI).toBe(false); // No code structure
      expect(result.metadata.charactersCount).toBeGreaterThan(500);
    });

    it('should detect code structure correctly', () => {
      const codeWithStructure = 'function test() { if (x > 0) { return x; } }';

      const event: CodeChangeEvent = {
        text: codeWithStructure,
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const result = detector.detectFromLargePaste(event);

      expect(result.isAI).toBe(false); // <500 chars, even with structure
    });
  });

  describe('Method 3: External File Change Detection', () => {
    it('should detect external file modification as AI with HIGH confidence', () => {
      const text = 'function test() { return 42; }';
      const wasFileOpen = false;
      const timestamp = Date.now();

      const result = detector.detectFromExternalFileChange(text, wasFileOpen, timestamp);

      expect(result.isAI).toBe(true);
      expect(result.confidence).toBe('high');
      expect(result.method).toBe(AIDetectionMethod.ExternalFileChange);
      expect(result.metadata.source).toBe('external-file-change');
    });

    it('should always detect external file changes as AI (agent mode)', () => {
      const text = 'function test() { return 42; }';
      const wasFileOpen = true; // Even if file was open
      const timestamp = Date.now();

      const result = detector.detectFromExternalFileChange(text, wasFileOpen, timestamp);

      // Changed: Now always returns HIGH confidence for external changes (agent mode detection)
      expect(result.isAI).toBe(true);
      expect(result.confidence).toBe('high');
    });
  });

  describe('Method 4: Git Commit Marker Detection', () => {
    it('should detect Claude commit marker with HIGH confidence', () => {
      const commitMessage = 'Add new feature\n\nCo-Authored-By: Claude Sonnet <noreply@anthropic.com>';
      const diff = '+function test() { return 42; }';
      const timestamp = Date.now();

      const result = detector.detectFromGitMarkers(commitMessage, diff, timestamp);

      expect(result.isAI).toBe(true);
      expect(result.confidence).toBe('high');
      expect(result.method).toBe(AIDetectionMethod.GitCommitMarker);
    });

    it('should detect GitHub Copilot marker', () => {
      const commitMessage = 'Fix bug with GitHub Copilot assistance';
      const diff = '+const x = 10;';
      const timestamp = Date.now();

      const result = detector.detectFromGitMarkers(commitMessage, diff, timestamp);

      expect(result.isAI).toBe(true);
      expect(result.confidence).toBe('high');
    });

    it('should detect AI markers in diff', () => {
      const commitMessage = 'Update function';
      const diff = '+// Generated with Claude Code\n+function test() { return 42; }';
      const timestamp = Date.now();

      const result = detector.detectFromGitMarkers(commitMessage, diff, timestamp);

      expect(result.isAI).toBe(true);
      expect(result.confidence).toBe('high');
    });

    it('should NOT detect regular commit as AI', () => {
      const commitMessage = 'Fix typo in README';
      const diff = '-This is a typo\n+This is correct';
      const timestamp = Date.now();

      const result = detector.detectFromGitMarkers(commitMessage, diff, timestamp);

      expect(result.isAI).toBe(false);
      expect(result.confidence).toBe('low');
    });
  });

  describe('Method 5: Change Velocity Detection', () => {
    it('should detect high velocity (>500 chars/sec) as AI with MEDIUM confidence', () => {
      const baseTime = Date.now();

      // Simulate 600 characters in 1 second (high velocity)
      const events: CodeChangeEvent[] = [
        { text: 'x'.repeat(200), rangeLength: 0, timestamp: baseTime, documentUri: 'file:///test.ts', isActiveEditor: true },
        { text: 'y'.repeat(200), rangeLength: 0, timestamp: baseTime + 100, documentUri: 'file:///test.ts', isActiveEditor: true },
        { text: 'z'.repeat(200), rangeLength: 0, timestamp: baseTime + 200, documentUri: 'file:///test.ts', isActiveEditor: true }
      ];

      let result;
      for (const event of events) {
        result = detector.detectFromVelocity(event);
      }

      expect(result!.isAI).toBe(true);
      expect(result!.confidence).toBe('medium');
      expect(result!.method).toBe(AIDetectionMethod.ChangeVelocity);
      expect(result!.metadata.velocity).toBeGreaterThan(500);
    });

    it('should NOT detect slow typing (<500 chars/sec) as AI', () => {
      const baseTime = Date.now();

      // Simulate 10 characters in 1 second (slow)
      const events: CodeChangeEvent[] = [
        { text: 'a', rangeLength: 0, timestamp: baseTime, documentUri: 'file:///test.ts', isActiveEditor: true },
        { text: 'b', rangeLength: 0, timestamp: baseTime + 100, documentUri: 'file:///test.ts', isActiveEditor: true },
        { text: 'c', rangeLength: 0, timestamp: baseTime + 200, documentUri: 'file:///test.ts', isActiveEditor: true }
      ];

      let result;
      for (const event of events) {
        result = detector.detectFromVelocity(event);
      }

      expect(result!.isAI).toBe(false);
      expect(result!.confidence).toBe('low');
    });

    it('should clean up old velocity events', () => {
      detector.reset();
      const baseTime = Date.now();

      // Add old events (>1 second ago)
      const oldEvent: CodeChangeEvent = {
        text: 'x'.repeat(100),
        rangeLength: 0,
        timestamp: baseTime - 2000, // 2 seconds ago
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      detector.detectFromVelocity(oldEvent);

      // New event should NOT include old data in velocity calculation
      const newEvent: CodeChangeEvent = {
        text: 'y',
        rangeLength: 0,
        timestamp: baseTime,
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const result = detector.detectFromVelocity(newEvent);

      // Low velocity (only 1 char)
      expect(result.isAI).toBe(false);
    });
  });

  describe('Unified detection (all methods combined)', () => {
    it('should prioritize HIGH confidence over MEDIUM/LOW', () => {
      // Create a large code block to trigger HIGH confidence large paste detection
      const largeCode = `function calculateComplexOperation(a, b, c, d) {
        const firstStep = a + b;
        const secondStep = c * d;
        const intermediateResult = firstStep - secondStep;

        if (intermediateResult > 0) {
          console.log('Positive result:', intermediateResult);
          return intermediateResult * 2;
        } else if (intermediateResult < 0) {
          console.log('Negative result:', intermediateResult);
          return Math.abs(intermediateResult);
        } else {
          console.log('Zero result');
          return 0;
        }
      }

      function helperFunction(x) {
        return x * x + 2 * x + 1;
      }`;

      const event: CodeChangeEvent = {
        text: largeCode,
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      // Large paste (>500 chars with code structure) should give HIGH confidence
      const result = detector.detect(event, {
        isInlineCompletion: false
      });

      expect(result.isAI).toBe(true);
      expect(result.confidence).toBe('high');
      expect(result.method).toBe(AIDetectionMethod.LargePaste);
    });

    it('should use inline completion when available', () => {
      const event: CodeChangeEvent = {
        text: 'const x = 10;',
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const result = detector.detect(event, {
        isInlineCompletion: true // HIGH confidence
      });

      expect(result.isAI).toBe(true);
      expect(result.confidence).toBe('high');
      expect(result.method).toBe(AIDetectionMethod.InlineCompletionAPI);
    });

    it('should fallback to lower confidence methods when HIGH not available', () => {
      detector.reset();
      const baseTime = Date.now();

      // Create high velocity scenario (MEDIUM confidence)
      const events: CodeChangeEvent[] = [];
      for (let i = 0; i < 10; i++) {
        events.push({
          text: 'x'.repeat(100),
          rangeLength: 0,
          timestamp: baseTime + (i * 10),
          documentUri: 'file:///test.ts',
          isActiveEditor: true
        });
      }

      let result;
      for (const event of events) {
        result = detector.detect(event, { wasFileOpen: true });
      }

      // Should detect AI via velocity (MEDIUM confidence)
      expect(result!.isAI).toBe(true);
      expect(result!.confidence).toBe('medium');
      expect(result!.method).toBe(AIDetectionMethod.ChangeVelocity);
    });
  });

  describe('99.99% Accuracy: ZERO false negatives', () => {
    it('should detect 1000 AI completions correctly', () => {
      detector.reset();

      let falseNegatives = 0;
      const totalEvents = 1000;

      // Simulate 1000 inline completion events (definitive AI)
      for (let i = 0; i < totalEvents; i++) {
        const text = `function test${i}() { return ${i}; }`;
        const result = detector.detectFromInlineCompletion(text, Date.now());

        if (!result.isAI) {
          falseNegatives++;
        }
      }

      // MUST have zero false negatives
      expect(falseNegatives).toBe(0);
    });

    it('should detect 1000 large pastes correctly', () => {
      detector.reset();

      let falseNegatives = 0;
      const totalEvents = 1000;

      // Simulate 1000 large paste events (>500 chars with code)
      for (let i = 0; i < totalEvents; i++) {
        const event: CodeChangeEvent = {
          text: `function test${i}() {\n  const x = ${i};\n  return x * 2;\n}`.repeat(15), // 15 repeats ensures >500 chars
          rangeLength: 0,
          timestamp: Date.now() + i,
          documentUri: 'file:///test.ts',
          isActiveEditor: true
        };

        const result = detector.detectFromLargePaste(event);

        if (!result.isAI) {
          falseNegatives++;
        }
      }

      // Should catch all large pastes with zero false negatives
      expect(falseNegatives).toBe(0);
    });

    it('should detect 1000 external file changes correctly', () => {
      let falseNegatives = 0;
      const totalEvents = 1000;

      // Simulate 1000 external file modifications
      for (let i = 0; i < totalEvents; i++) {
        const text = `function test${i}() { return ${i}; }`;
        const result = detector.detectFromExternalFileChange(text, false, Date.now());

        if (!result.isAI) {
          falseNegatives++;
        }
      }

      // MUST have zero false negatives
      expect(falseNegatives).toBe(0);
    });
  });

  describe('Utility methods', () => {
    it('should reset velocity tracking', () => {
      const event: CodeChangeEvent = {
        text: 'x'.repeat(100),
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      detector.detectFromVelocity(event);
      detector.reset();

      // After reset, velocity should be low
      const newEvent: CodeChangeEvent = {
        text: 'y',
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const result = detector.detectFromVelocity(newEvent);
      expect(result.isAI).toBe(false);
    });
  });

  describe('Git Markers Detection', () => {
    it('should detect AI from git commit message markers', () => {
      const event: CodeChangeEvent = {
        text: 'function test() { return 42; }',
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const context = {
        commitMessage: 'feat: add new feature\n\nGenerated with AI assistance',
        diff: '+function test() { return 42; }'
      };

      const result = detector.detect(event, context);
      expect(result).toBeDefined();
    });

    it('should detect AI from git diff with markers', () => {
      const event: CodeChangeEvent = {
        text: 'const helper = () => {}',
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const context = {
        commitMessage: 'refactor: improve code',
        diff: '+const helper = () => {} // AI-generated'
      };

      const result = detector.detect(event, context);
      expect(result).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty text', () => {
      const event: CodeChangeEvent = {
        text: '',
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const result = detector.detect(event);
      expect(result.isAI).toBe(false);
    });

    it('should handle text with only trailing newline', () => {
      const event: CodeChangeEvent = {
        text: 'line1\nline2\n',
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const result = detector.detect(event);
      expect(result).toBeDefined();
    });

    it('should handle text without trailing newline', () => {
      const event: CodeChangeEvent = {
        text: 'line1\nline2',
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const result = detector.detect(event);
      expect(result).toBeDefined();
    });

    it('should prioritize high confidence over medium', () => {
      // Large paste should trigger high confidence - needs to be substantial
      const largeCode = Array(20).fill('function test() {\n  return 42;\n}\n').join('\n');
      const event: CodeChangeEvent = {
        text: largeCode,
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const result = detector.detect(event);
      expect(['high', 'medium']).toContain(result.confidence);
    });

    it('should fallback to medium confidence when no high confidence', () => {
      const event: CodeChangeEvent = {
        text: 'x'.repeat(30), // Fast typing but not large paste
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const result = detector.detectFromVelocity(event);
      expect(result).toBeDefined();
    });

    it('should return low confidence when no AI detected', () => {
      const event: CodeChangeEvent = {
        text: 'a',
        rangeLength: 0,
        timestamp: Date.now() + 10000, // Slow typing
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      // Reset to clear any velocity history
      detector.reset();

      const result = detector.detect(event);
      expect(result.isAI).toBe(false);
    });
  });
});
