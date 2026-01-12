/**
 * ManualDetector Tests
 * CRITICAL: Zero false positives (manual code marked as AI = FAIL)
 */

import { ManualDetector } from '../ManualDetector';
import { CodeChangeEvent } from '../types';

describe('ManualDetector', () => {
  let detector: ManualDetector;

  beforeEach(() => {
    detector = new ManualDetector();
  });

  describe('Single-character typing detection', () => {
    it('should detect single character insertion as manual', () => {
      const event: CodeChangeEvent = {
        text: 'a',
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const result = detector.analyze(event);

      expect(result.characteristics.singleCharTyping).toBe(true);
      expect(result.characteristics.gradualEditing).toBe(true);
      expect(result.characteristics.activeFocus).toBe(true);
    });

    it('should detect single character deletion as manual', () => {
      const event: CodeChangeEvent = {
        text: '',
        rangeLength: 1,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const result = detector.analyze(event);

      expect(result.characteristics.singleCharTyping).toBe(true);
    });

    it('should NOT detect large paste as single-char typing', () => {
      const event: CodeChangeEvent = {
        text: 'function test() { return 42; }',
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const result = detector.analyze(event);

      expect(result.characteristics.singleCharTyping).toBe(false);
    });
  });

  describe('Gradual editing detection', () => {
    it('should detect small edits (<100 chars) as gradual', () => {
      const event: CodeChangeEvent = {
        text: 'const x = 10;',
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const result = detector.analyze(event);

      expect(result.characteristics.gradualEditing).toBe(true);
    });

    it('should NOT detect large paste (>100 chars) as gradual', () => {
      const largeText = 'a'.repeat(150);
      const event: CodeChangeEvent = {
        text: largeText,
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const result = detector.analyze(event);

      expect(result.characteristics.gradualEditing).toBe(false);
    });
  });

  describe('Active focus detection', () => {
    it('should detect active editor as focused', () => {
      const event: CodeChangeEvent = {
        text: 'a',
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const result = detector.analyze(event);

      expect(result.characteristics.activeFocus).toBe(true);
    });

    it('should NOT detect inactive editor as focused', () => {
      const event: CodeChangeEvent = {
        text: 'a',
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: false
      };

      const result = detector.analyze(event);

      expect(result.characteristics.activeFocus).toBe(false);
    });
  });

  describe('Human typing speed detection', () => {
    it('should detect human-speed typing (50ms intervals)', () => {
      const baseTime = Date.now();

      // Simulate typing 5 characters at human speed (50ms apart)
      for (let i = 0; i < 5; i++) {
        const event: CodeChangeEvent = {
          text: 'a',
          rangeLength: 0,
          timestamp: baseTime + (i * 50),
          documentUri: 'file:///test.ts',
          isActiveEditor: true
        };

        detector.analyze(event);
      }

      // Last event should show human speed
      const lastEvent: CodeChangeEvent = {
        text: 'a',
        rangeLength: 0,
        timestamp: baseTime + (5 * 50),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const result = detector.analyze(lastEvent);

      expect(result.characteristics.humanSpeed).toBe(true);
    });

    it('should NOT detect instant typing (0ms intervals) as human', () => {
      const baseTime = Date.now();

      // Simulate instant typing (all at same time)
      for (let i = 0; i < 5; i++) {
        const event: CodeChangeEvent = {
          text: 'a'.repeat(20),
          rangeLength: 0,
          timestamp: baseTime, // Same timestamp
          documentUri: 'file:///test.ts',
          isActiveEditor: true
        };

        detector.analyze(event);
      }

      // Last check
      const lastEvent: CodeChangeEvent = {
        text: 'a'.repeat(20),
        rangeLength: 0,
        timestamp: baseTime,
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const result = detector.analyze(lastEvent);

      expect(result.characteristics.humanSpeed).toBe(false);
    });

    it('should handle first event (no history) gracefully', () => {
      const event: CodeChangeEvent = {
        text: 'a',
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const result = detector.analyze(event);

      // Should give benefit of doubt on first event
      expect(result.characteristics.humanSpeed).toBe(true);
    });
  });

  describe('Complete manual detection (ALL 4 criteria)', () => {
    it('should detect valid manual typing with HIGH confidence', () => {
      const baseTime = Date.now();

      // Simulate realistic manual typing
      const events: CodeChangeEvent[] = [
        { text: 'f', rangeLength: 0, timestamp: baseTime, documentUri: 'file:///test.ts', isActiveEditor: true },
        { text: 'u', rangeLength: 0, timestamp: baseTime + 50, documentUri: 'file:///test.ts', isActiveEditor: true },
        { text: 'n', rangeLength: 0, timestamp: baseTime + 100, documentUri: 'file:///test.ts', isActiveEditor: true },
        { text: 'c', rangeLength: 0, timestamp: baseTime + 150, documentUri: 'file:///test.ts', isActiveEditor: true },
        { text: 't', rangeLength: 0, timestamp: baseTime + 200, documentUri: 'file:///test.ts', isActiveEditor: true }
      ];

      let lastResult;
      for (const event of events) {
        lastResult = detector.analyze(event);
      }

      expect(lastResult!.isManual).toBe(true);
      expect(lastResult!.confidence).toBe('high');
      expect(lastResult!.characteristics.singleCharTyping).toBe(true);
      expect(lastResult!.characteristics.gradualEditing).toBe(true);
      expect(lastResult!.characteristics.activeFocus).toBe(true);
      expect(lastResult!.characteristics.humanSpeed).toBe(true);
    });

    it('should NOT detect AI-like patterns as manual', () => {
      // Large paste, not focused, instant
      const event: CodeChangeEvent = {
        text: 'function test() {\n  return 42;\n}'.repeat(10), // 330+ chars
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: false // Not focused
      };

      const result = detector.analyze(event);

      expect(result.isManual).toBe(false);
      expect(result.confidence).not.toBe('high');
    });
  });

  describe('99.99% Accuracy: ZERO false positives', () => {
    it('should correctly classify 1000 manual typing events', () => {
      detector.reset();
      const baseTime = Date.now();

      let falsePositives = 0;
      const totalEvents = 1000;

      // Simulate 1000 realistic manual typing events
      for (let i = 0; i < totalEvents; i++) {
        const event: CodeChangeEvent = {
          text: String.fromCharCode(97 + (i % 26)), // a-z
          rangeLength: 0,
          timestamp: baseTime + (i * 50), // 50ms apart (human speed)
          documentUri: 'file:///test.ts',
          isActiveEditor: true
        };

        const result = detector.analyze(event);

        // After enough history, should be detected as manual
        if (i > 5 && !result.isManual) {
          falsePositives++;
        }
      }

      // Allow minimal false positives (<0.01%)
      const falsePositiveRate = falsePositives / totalEvents;
      expect(falsePositiveRate).toBeLessThan(0.0001); // <0.01%
    });

    it('should correctly reject 1000 AI-like events', () => {
      detector.reset();
      const baseTime = Date.now();

      let falseNegatives = 0;
      const totalEvents = 1000;

      // Simulate 1000 AI-like events (large pastes, instant, no focus)
      for (let i = 0; i < totalEvents; i++) {
        const event: CodeChangeEvent = {
          text: 'function test() { return ' + i + '; }', // 30+ chars
          rangeLength: 0,
          timestamp: baseTime + i, // 1ms apart (too fast for human)
          documentUri: 'file:///test.ts',
          isActiveEditor: i % 2 === 0 // Half not focused
        };

        const result = detector.analyze(event);

        // Should NOT be detected as manual
        if (result.isManual && result.confidence === 'high') {
          falseNegatives++;
        }
      }

      // Should have zero false negatives (AI marked as manual)
      expect(falseNegatives).toBe(0);
    });
  });

  describe('Utility methods', () => {
    it('should reset typing history', () => {
      const event: CodeChangeEvent = {
        text: 'a',
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      detector.analyze(event);
      expect(detector.getTypingHistory().length).toBe(1);

      detector.reset();
      expect(detector.getTypingHistory().length).toBe(0);
    });

    it('should limit typing history to 10 events', () => {
      const baseTime = Date.now();

      for (let i = 0; i < 20; i++) {
        const event: CodeChangeEvent = {
          text: 'a',
          rangeLength: 0,
          timestamp: baseTime + (i * 50),
          documentUri: 'file:///test.ts',
          isActiveEditor: true
        };

        detector.analyze(event);
      }

      expect(detector.getTypingHistory().length).toBeLessThanOrEqual(10);
    });

    it('should handle multiline text with trailing newline', () => {
      const event: CodeChangeEvent = {
        text: 'line1\nline2\nline3\n',
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const result = detector.analyze(event);
      expect(result).toBeDefined();
      expect(result.metadata.linesOfCode).toBe(3);
    });

    it('should handle multiline text without trailing newline', () => {
      const event: CodeChangeEvent = {
        text: 'line1\nline2\nline3',
        rangeLength: 0,
        timestamp: Date.now(),
        documentUri: 'file:///test.ts',
        isActiveEditor: true
      };

      const result = detector.analyze(event);
      expect(result).toBeDefined();
      expect(result.metadata.linesOfCode).toBe(3);
    });
  });
});
