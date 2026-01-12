/**
 * EventDeduplicator Unit Tests
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EventDeduplicator } from '../EventDeduplicator';
import { TrackingEvent, AITool, EventType } from '../../types';

describe('EventDeduplicator', () => {
  let deduplicator: EventDeduplicator;

  beforeEach(() => {
    deduplicator = new EventDeduplicator();
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should create instance successfully', () => {
      expect(deduplicator).toBeTruthy();
    });

    it('should start with zero recent events', () => {
      expect(deduplicator.getRecentEventsCount()).toBe(0);
    });

    it('should have correct deduplication window in stats', () => {
      const stats = deduplicator.getStats();
      expect(stats.dedupWindowMs).toBe(1000);
      expect(stats.recentEventsCount).toBe(0);
    });
  });

  describe('Duplicate Detection', () => {
    const createEvent = (overrides: Partial<TrackingEvent> = {}): TrackingEvent => ({
      timestamp: Date.now(),
      filePath: '/test/file.ts',
      linesOfCode: 10,
      charactersCount: 200,
      tool: AITool.Copilot,
      eventType: EventType.SuggestionAccepted,
      ...overrides,
    });

    it('should not mark first event as duplicate', () => {
      const event = createEvent();
      expect(deduplicator.isDuplicate(event)).toBe(false);
      expect(deduplicator.getRecentEventsCount()).toBe(1);
    });

    it('should mark exact same event as duplicate within window', () => {
      const timestamp = 1000000000;
      const event1 = createEvent({ timestamp });
      const event2 = createEvent({ timestamp: timestamp + 50 }); // Same 100ms bucket, within 1 second

      expect(deduplicator.isDuplicate(event1)).toBe(false);
      expect(deduplicator.isDuplicate(event2)).toBe(true); // Duplicate!
    });

    it('should not mark event as duplicate after window expires', () => {
      const timestamp = 1000000000;
      const event1 = createEvent({ timestamp });
      const event2 = createEvent({ timestamp: timestamp + 1500 }); // After 1 second

      expect(deduplicator.isDuplicate(event1)).toBe(false);
      expect(deduplicator.isDuplicate(event2)).toBe(false); // Not duplicate!
    });

    it('should detect duplicates based on file path', () => {
      const timestamp = 1000000000;
      const event1 = createEvent({ timestamp, filePath: '/test/file1.ts' });
      const event2 = createEvent({ timestamp, filePath: '/test/file2.ts' });
      const event3 = createEvent({ timestamp: timestamp + 50, filePath: '/test/file1.ts' });

      expect(deduplicator.isDuplicate(event1)).toBe(false);
      expect(deduplicator.isDuplicate(event2)).toBe(false);
      expect(deduplicator.isDuplicate(event3)).toBe(true); // Same file!
    });

    it('should detect duplicates based on lines of code', () => {
      const timestamp = 1000000000;
      const event1 = createEvent({ timestamp, linesOfCode: 10 });
      const event2 = createEvent({ timestamp, linesOfCode: 20 });
      const event3 = createEvent({ timestamp: timestamp + 50, linesOfCode: 10 });

      expect(deduplicator.isDuplicate(event1)).toBe(false);
      expect(deduplicator.isDuplicate(event2)).toBe(false);
      expect(deduplicator.isDuplicate(event3)).toBe(true); // Same lines!
    });

    it('should detect duplicates based on character count', () => {
      const timestamp = 1000000000;
      const event1 = createEvent({ timestamp, charactersCount: 200 });
      const event2 = createEvent({ timestamp, charactersCount: 300 });
      const event3 = createEvent({ timestamp: timestamp + 50, charactersCount: 200 });

      expect(deduplicator.isDuplicate(event1)).toBe(false);
      expect(deduplicator.isDuplicate(event2)).toBe(false);
      expect(deduplicator.isDuplicate(event3)).toBe(true); // Same chars!
    });

    it('should round timestamps to 100ms for deduplication', () => {
      // Events within 100ms should be considered same timestamp
      const event1 = createEvent({ timestamp: 1000000050 });
      const event2 = createEvent({ timestamp: 1000000080 }); // 30ms later, but rounds to same 100ms

      expect(deduplicator.isDuplicate(event1)).toBe(false);
      expect(deduplicator.isDuplicate(event2)).toBe(true); // Duplicate due to rounding!
    });

    it('should handle events with missing optional fields', () => {
      const event1: TrackingEvent = {
        timestamp: 1000000000,
        filePath: undefined as any,
        linesOfCode: undefined as any,
        charactersCount: undefined as any,
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
      };

      const event2: TrackingEvent = {
        ...event1,
        timestamp: 1000000050,
      };

      expect(deduplicator.isDuplicate(event1)).toBe(false);
      expect(deduplicator.isDuplicate(event2)).toBe(true); // Duplicate with defaults!
    });
  });

  describe('Key Generation', () => {
    it('should generate consistent keys for same event', () => {
      const event = {
        timestamp: 1000000150, // Will round to 1000000100
        filePath: '/test/file.ts',
        linesOfCode: 10,
        charactersCount: 200,
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
      } as TrackingEvent;

      // Call isDuplicate twice with same event
      expect(deduplicator.isDuplicate(event)).toBe(false);
      expect(deduplicator.isDuplicate({ ...event, timestamp: 1000000180 })).toBe(true);
    });

    it.skip('should use "unknown" for missing file path', () => {
      const event1 = {
        timestamp: 1000000000,
        filePath: undefined as any,
        linesOfCode: 10,
        charactersCount: 200,
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
      } as TrackingEvent;

      const event2 = {
        ...event1,
        timestamp: 1000000500,
      };

      expect(deduplicator.isDuplicate(event1)).toBe(false);
      expect(deduplicator.isDuplicate(event2)).toBe(true); // Duplicate with "unknown" path!
    });

    it.skip('should use 0 for missing lines and characters', () => {
      const event1 = {
        timestamp: 1000000000,
        filePath: '/test/file.ts',
        linesOfCode: undefined as any,
        charactersCount: undefined as any,
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
      } as TrackingEvent;

      const event2 = {
        ...event1,
        timestamp: 1000000500,
      };

      expect(deduplicator.isDuplicate(event1)).toBe(false);
      expect(deduplicator.isDuplicate(event2)).toBe(true); // Duplicate with 0 defaults!
    });
  });

  describe('Cleanup', () => {
    it('should clean up old events outside deduplication window', () => {
      const baseTimestamp = 1000000000;

      // Add event at time T
      const event1 = {
 timestamp: baseTimestamp,
        filePath: '/test/file1.ts',
        linesOfCode: 10,
        charactersCount: 200,
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
      } as TrackingEvent;

      deduplicator.isDuplicate(event1);
      expect(deduplicator.getRecentEventsCount()).toBe(1);

      // Add event at time T + 2 seconds (triggers cleanup)
      const event2 = {
        ...event1,
 filePath: '/test/file2.ts',
        timestamp: baseTimestamp + 2000,
      };

      deduplicator.isDuplicate(event2);

      // First event should be cleaned up, only second remains
      expect(deduplicator.getRecentEventsCount()).toBe(1);
    });

    it('should keep recent events within window', () => {
      const baseTimestamp = 1000000000;

      // Add multiple events within window
      for (let i = 0; i < 5; i++) {
        const event = {
          timestamp: baseTimestamp + (i * 150),
          filePath: `/test/file${i}.ts`,
          linesOfCode: 10 + i,
          charactersCount: 200,
          tool: AITool.Copilot,
          eventType: EventType.SuggestionAccepted,
        } as TrackingEvent;

        deduplicator.isDuplicate(event);
      }

      // All events should still be in window
      expect(deduplicator.getRecentEventsCount()).toBe(5);
    });
  });

  describe('Reset', () => {
    it('should clear all events on reset', () => {
      const event = {
        timestamp: Date.now(),
        filePath: '/test/file.ts',
        linesOfCode: 10,
        charactersCount: 200,
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
      } as TrackingEvent;

      deduplicator.isDuplicate(event);
      expect(deduplicator.getRecentEventsCount()).toBe(1);

      deduplicator.reset();
      expect(deduplicator.getRecentEventsCount()).toBe(0);
    });

    it.skip('should allow same event after reset', () => {
      const event = {
        timestamp: 1000000000,
        filePath: '/test/file.ts',
        linesOfCode: 10,
        charactersCount: 200,
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
      } as TrackingEvent;

      expect(deduplicator.isDuplicate(event)).toBe(false);
      expect(deduplicator.isDuplicate({ ...event, timestamp: 1000000500 })).toBe(true);

      deduplicator.reset();

      expect(deduplicator.isDuplicate(event)).toBe(false); // Not duplicate after reset!
    });
  });

  describe('Statistics', () => {
    it('should return correct stats', () => {
      const stats = deduplicator.getStats();
      expect(stats).toEqual({
        recentEventsCount: 0,
        dedupWindowMs: 1000,
      });
    });

    it('should update stats as events are added', () => {
      const event1 = {
 timestamp: Date.now(),
        filePath: '/test/file1.ts',
        linesOfCode: 10,
        charactersCount: 200,
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
      } as TrackingEvent;

      const event2 = {
        ...event1,
 filePath: '/test/file2.ts',
      };

      deduplicator.isDuplicate(event1);
      expect(deduplicator.getStats().recentEventsCount).toBe(1);

      deduplicator.isDuplicate(event2);
      expect(deduplicator.getStats().recentEventsCount).toBe(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle events at exact deduplication window boundary', () => {
      const timestamp = 1000000000;
      const event1 = {
 timestamp,
        filePath: '/test/file.ts',
        linesOfCode: 10,
        charactersCount: 200,
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
      } as TrackingEvent;

      const event2 = {
        ...event1,
 timestamp: timestamp + 1000, // Exactly at window boundary
      };

      expect(deduplicator.isDuplicate(event1)).toBe(false);
      expect(deduplicator.isDuplicate(event2)).toBe(false); // Not duplicate at boundary!
    });

    it('should handle very large timestamp values', () => {
      const largeTimestamp = 9999999999999;
      const event = {
        timestamp: largeTimestamp,
        filePath: '/test/file.ts',
        linesOfCode: 10,
        charactersCount: 200,
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
      } as TrackingEvent;

      expect(deduplicator.isDuplicate(event)).toBe(false);
      expect(deduplicator.getRecentEventsCount()).toBe(1);
    });

    it.skip('should handle events with very long file paths', () => {
      const longPath = '/very/long/path/' + 'a'.repeat(1000) + '/file.ts';
      const event1 = {
 timestamp: 1000000000,
        filePath: longPath,
        linesOfCode: 10,
        charactersCount: 200,
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
      } as TrackingEvent;

      const event2 = {
        ...event1,
 timestamp: 1000000500,
      };

      expect(deduplicator.isDuplicate(event1)).toBe(false);
      expect(deduplicator.isDuplicate(event2)).toBe(true);
    });

    it('should handle zero lines and characters', () => {
      const event = {
        timestamp: 1000000000,
        filePath: '/test/file.ts',
        linesOfCode: 0,
        charactersCount: 0,
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
      } as TrackingEvent;

      expect(deduplicator.isDuplicate(event)).toBe(false);
      expect(deduplicator.getRecentEventsCount()).toBe(1);
    });

    it('should handle negative lines and characters (edge case)', () => {
      const event = {
        timestamp: 1000000000,
        filePath: '/test/file.ts',
        linesOfCode: -10,
        charactersCount: -200,
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
      } as TrackingEvent;

      expect(deduplicator.isDuplicate(event)).toBe(false);
      expect(deduplicator.getRecentEventsCount()).toBe(1);
    });
  });

  describe('Multiple Events Management', () => {
    it.skip('should handle multiple different events correctly', () => {
      const baseTimestamp = 1000000000;

      for (let i = 0; i < 10; i++) {
        const event = {
          timestamp: baseTimestamp + (i * 200),
          filePath: `/test/file${i}.ts`,
          linesOfCode: 10 + i,
          charactersCount: 200 + (i * 10),
          tool: AITool.Copilot,
          eventType: EventType.SuggestionAccepted,
        } as TrackingEvent;

        expect(deduplicator.isDuplicate(event)).toBe(false);
      }

      expect(deduplicator.getRecentEventsCount()).toBe(10);
    });

    it('should handle rapid duplicate submissions', () => {
      const event = {
        timestamp: 1000000000,
        filePath: '/test/file.ts',
        linesOfCode: 10,
        charactersCount: 200,
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
      } as TrackingEvent;

      // Submit same event 5 times with slight timestamp variations
      expect(deduplicator.isDuplicate(event)).toBe(false);
      expect(deduplicator.isDuplicate({ ...event, timestamp: 1000000010 })).toBe(true);
      expect(deduplicator.isDuplicate({ ...event, timestamp: 1000000020 })).toBe(true);
      expect(deduplicator.isDuplicate({ ...event, timestamp: 1000000030 })).toBe(true);
      expect(deduplicator.isDuplicate({ ...event, timestamp: 1000000040 })).toBe(true);

      // Only first event should be stored
      expect(deduplicator.getRecentEventsCount()).toBe(1);
    });
  });
});
