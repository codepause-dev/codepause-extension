/**
 * Database Integration Tests - Phase 2
 *
 * CRITICAL: Validate database persistence of new fields:
 * - source ('ai' | 'manual')
 * - detection_method (string)
 * - confidence ('high' | 'medium' | 'low')
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { DatabaseManager } from '../DatabaseManager';
import { TrackingEvent, EventType, CodeSource } from '../../types';

describe('Database Integration - Phase 2 Fields', () => {
  let dbManager: DatabaseManager;
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for test database
    tempDir = path.join(os.tmpdir(), `codepause-test-${Date.now()}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    dbManager = new DatabaseManager(tempDir);
    await dbManager.initialize();
  });

  afterEach(() => {
    if (dbManager) {
      dbManager.close();
    }

    // Clean up test database
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('AI Event Persistence', () => {
    it('should persist AI event with source, detection_method, and confidence', async () => {
      const aiEvent: TrackingEvent = {
        timestamp: Date.now(),
        tool: 'copilot' as any,
        eventType: EventType.CodeGenerated,
        linesOfCode: 50,
        charactersCount: 1000,
        filePath: '/test/ai-generated.ts',
        language: 'typescript',
        source: CodeSource.AI,
        detectionMethod: 'inline-completion-api',
        confidence: 'high'
      };

      // Insert event
      const eventId = await dbManager.insertEvent(aiEvent);
      expect(eventId).toBeGreaterThan(0);

      // Retrieve event
      const today = new Date().toISOString().split('T')[0];
      const events = await dbManager.getEvents(today, today);

      expect(events.length).toBe(1);
      const retrievedEvent = events[0];

      // Verify all Phase 2 fields are persisted
      expect(retrievedEvent.source).toBe(CodeSource.AI);
      expect(retrievedEvent.detectionMethod).toBe('inline-completion-api');
      expect(retrievedEvent.confidence).toBe('high');

      // Verify legacy fields still work
      expect(retrievedEvent.tool).toBe('copilot');
      expect(retrievedEvent.linesOfCode).toBe(50);
      expect(retrievedEvent.charactersCount).toBe(1000);
    });

    it('should persist different AI detection methods', async () => {
      const detectionMethods = [
        'inline-completion-api',
        'large-paste',
        'external-file-change',
        'git-commit-marker',
        'change-velocity'
      ];

      // Insert events with different detection methods
      for (const method of detectionMethods) {
        const event: TrackingEvent = {
          timestamp: Date.now(),
          tool: 'copilot' as any,
          eventType: EventType.CodeGenerated,
          linesOfCode: 10,
          charactersCount: 200,
          filePath: `/test/${method}.ts`,
          source: CodeSource.AI,
          detectionMethod: method,
          confidence: 'high'
        };

        await dbManager.insertEvent(event);
      }

      // Retrieve all events
      const today = new Date().toISOString().split('T')[0];
      const events = await dbManager.getEvents(today, today);

      expect(events.length).toBe(5);

      // Verify each detection method is persisted correctly
      const retrievedMethods = events.map(e => e.detectionMethod).sort();
      expect(retrievedMethods).toEqual(detectionMethods.sort());
    });

    it('should persist different confidence levels', async () => {
      const confidenceLevels = ['high', 'medium', 'low'] as const;

      for (const confidence of confidenceLevels) {
        const event: TrackingEvent = {
          timestamp: Date.now(),
          tool: 'copilot' as any,
          eventType: EventType.CodeGenerated,
          linesOfCode: 10,
          charactersCount: 200,
          filePath: `/test/${confidence}.ts`,
          source: CodeSource.AI,
          detectionMethod: 'inline-completion-api',
          confidence
        };

        await dbManager.insertEvent(event);
      }

      const today = new Date().toISOString().split('T')[0];
      const events = await dbManager.getEvents(today, today);

      expect(events.length).toBe(3);

      // Verify confidence levels are preserved
      const retrievedConfidences = events.map(e => e.confidence).sort();
      expect(retrievedConfidences).toEqual(['high', 'low', 'medium']);
    });
  });

  describe('Manual Event Persistence', () => {
    it('should persist Manual event with source, detection_method, and confidence', async () => {
      const manualEvent: TrackingEvent = {
        timestamp: Date.now(),
        tool: 'manual' as any,
        eventType: EventType.CodeGenerated,
        linesOfCode: 5,
        charactersCount: 100,
        filePath: '/test/manual-typed.ts',
        language: 'typescript',
        source: CodeSource.Manual,
        detectionMethod: 'manual-typing',
        confidence: 'high'
      };

      const eventId = await dbManager.insertEvent(manualEvent);
      expect(eventId).toBeGreaterThan(0);

      const today = new Date().toISOString().split('T')[0];
      const events = await dbManager.getEvents(today, today);

      expect(events.length).toBe(1);
      const retrievedEvent = events[0];

      expect(retrievedEvent.source).toBe(CodeSource.Manual);
      expect(retrievedEvent.detectionMethod).toBe('manual-typing');
      expect(retrievedEvent.confidence).toBe('high');
      expect(retrievedEvent.linesOfCode).toBe(5);
    });
  });

  describe('Mixed Events Persistence', () => {
    it('should persist and retrieve both AI and Manual events correctly', async () => {
      const events: TrackingEvent[] = [
        {
          timestamp: Date.now(),
          tool: 'copilot' as any,
          eventType: EventType.CodeGenerated,
          linesOfCode: 50,
          charactersCount: 1000,
          filePath: '/test/ai1.ts',
          source: CodeSource.AI,
          detectionMethod: 'inline-completion-api',
          confidence: 'high'
        },
        {
          timestamp: Date.now() + 1000,
          tool: 'manual' as any,
          eventType: EventType.CodeGenerated,
          linesOfCode: 10,
          charactersCount: 200,
          filePath: '/test/manual1.ts',
          source: CodeSource.Manual,
          detectionMethod: 'manual-typing',
          confidence: 'high'
        },
        {
          timestamp: Date.now() + 2000,
          tool: 'cursor' as any,
          eventType: EventType.CodeGenerated,
          linesOfCode: 30,
          charactersCount: 600,
          filePath: '/test/ai2.ts',
          source: CodeSource.AI,
          detectionMethod: 'large-paste',
          confidence: 'high'
        },
        {
          timestamp: Date.now() + 3000,
          tool: 'manual' as any,
          eventType: EventType.CodeGenerated,
          linesOfCode: 5,
          charactersCount: 100,
          filePath: '/test/manual2.ts',
          source: CodeSource.Manual,
          detectionMethod: 'manual-typing',
          confidence: 'high'
        }
      ];

      // Insert all events
      for (const event of events) {
        await dbManager.insertEvent(event);
      }

      // Retrieve all events
      const today = new Date().toISOString().split('T')[0];
      const retrievedEvents = await dbManager.getEvents(today, today);

      expect(retrievedEvents.length).toBe(4);

      // Count by source
      const aiEvents = retrievedEvents.filter(e => e.source === CodeSource.AI);
      const manualEvents = retrievedEvents.filter(e => e.source === CodeSource.Manual);

      expect(aiEvents.length).toBe(2);
      expect(manualEvents.length).toBe(2);

      // Verify AI events have correct detection methods
      expect(aiEvents[0].detectionMethod).toBeDefined();
      expect(aiEvents[1].detectionMethod).toBeDefined();

      // Verify Manual events have manual-typing method
      expect(manualEvents.every(e => e.detectionMethod === 'manual-typing')).toBe(true);
    });
  });

  describe('Backward Compatibility', () => {
    it('should handle events without Phase 2 fields (legacy events)', async () => {
      // Simulate old event without source, detection_method, confidence
      const legacyEvent: TrackingEvent = {
        timestamp: Date.now(),
        tool: 'copilot' as any,
        eventType: EventType.CodeGenerated,
        linesOfCode: 50,
        charactersCount: 1000,
        filePath: '/test/legacy.ts'
        // No source, detection_method, or confidence
      };

      const eventId = await dbManager.insertEvent(legacyEvent);
      expect(eventId).toBeGreaterThan(0);

      const today = new Date().toISOString().split('T')[0];
      const events = await dbManager.getEvents(today, today);

      expect(events.length).toBe(1);
      const retrievedEvent = events[0];

      // Phase 2 fields should be undefined or null for legacy events
      expect(retrievedEvent.source).toBeUndefined();
      expect(retrievedEvent.detectionMethod).toBeUndefined();
      expect(retrievedEvent.confidence).toBeFalsy(); // null or undefined

      // Legacy fields should still work
      expect(retrievedEvent.tool).toBe('copilot');
      expect(retrievedEvent.linesOfCode).toBe(50);
    });

    it('should handle mixed legacy and new events', async () => {
      // Insert legacy event
      const legacyEvent: TrackingEvent = {
        timestamp: Date.now(),
        tool: 'copilot' as any,
        eventType: EventType.CodeGenerated,
        linesOfCode: 50,
        charactersCount: 1000,
        filePath: '/test/legacy.ts'
      };

      // Insert new event with Phase 2 fields
      const newEvent: TrackingEvent = {
        timestamp: Date.now() + 1000,
        tool: 'copilot' as any,
        eventType: EventType.CodeGenerated,
        linesOfCode: 30,
        charactersCount: 600,
        filePath: '/test/new.ts',
        source: CodeSource.AI,
        detectionMethod: 'inline-completion-api',
        confidence: 'high'
      };

      await dbManager.insertEvent(legacyEvent);
      await dbManager.insertEvent(newEvent);

      const today = new Date().toISOString().split('T')[0];
      const events = await dbManager.getEvents(today, today);

      expect(events.length).toBe(2);

      // Find each event
      const legacy = events.find(e => e.filePath === '/test/legacy.ts');
      const modern = events.find(e => e.filePath === '/test/new.ts');

      expect(legacy).toBeDefined();
      expect(modern).toBeDefined();

      // Legacy event should have no source
      expect(legacy?.source).toBeUndefined();

      // Modern event should have source
      expect(modern?.source).toBe(CodeSource.AI);
      expect(modern?.detectionMethod).toBe('inline-completion-api');
      expect(modern?.confidence).toBe('high');
    });
  });

  describe('Migration Validation', () => {
    it('should have created source, detection_method, and confidence columns', async () => {
      // This test verifies the migration ran successfully
      // by attempting to insert an event with the new fields

      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: 'copilot' as any,
        eventType: EventType.CodeGenerated,
        linesOfCode: 10,
        charactersCount: 200,
        filePath: '/test/migration-test.ts',
        source: CodeSource.AI,
        detectionMethod: 'inline-completion-api',
        confidence: 'high'
      };

      // This should not throw an error if columns exist
      const eventId = await dbManager.insertEvent(event);
      expect(eventId).toBeGreaterThan(0);

      // Verify retrieval works
      const today = new Date().toISOString().split('T')[0];
      const events = await dbManager.getEvents(today, today);
      expect(events.length).toBe(1);
      expect(events[0].source).toBe(CodeSource.AI);
    });
  });

  describe('Data Quality Validation', () => {
    it('99.99% Accuracy: 1000 events persist correctly', async () => {
      const baseTime = Date.now();
      const insertedEvents: TrackingEvent[] = [];

      // Insert 500 AI events + 500 Manual events
      for (let i = 0; i < 500; i++) {
        const aiEvent: TrackingEvent = {
          timestamp: baseTime + (i * 100),
          tool: 'copilot' as any,
          eventType: EventType.CodeGenerated,
          linesOfCode: Math.floor(Math.random() * 50) + 1,
          charactersCount: Math.floor(Math.random() * 500) + 50,
          filePath: `/test/ai-${i}.ts`,
          source: CodeSource.AI,
          detectionMethod: 'inline-completion-api',
          confidence: 'high'
        };

        const manualEvent: TrackingEvent = {
          timestamp: baseTime + (i * 100) + 50,
          tool: 'manual' as any,
          eventType: EventType.CodeGenerated,
          linesOfCode: Math.floor(Math.random() * 10) + 1,
          charactersCount: Math.floor(Math.random() * 100) + 10,
          filePath: `/test/manual-${i}.ts`,
          source: CodeSource.Manual,
          detectionMethod: 'manual-typing',
          confidence: 'high'
        };

        await dbManager.insertEvent(aiEvent);
        await dbManager.insertEvent(manualEvent);

        insertedEvents.push(aiEvent, manualEvent);
      }

      // Retrieve all events
      const today = new Date().toISOString().split('T')[0];
      const retrievedEvents = await dbManager.getEvents(today, today);

      // Verify count
      expect(retrievedEvents.length).toBe(1000);

      // Verify AI vs Manual split
      const aiCount = retrievedEvents.filter(e => e.source === CodeSource.AI).length;
      const manualCount = retrievedEvents.filter(e => e.source === CodeSource.Manual).length;

      expect(aiCount).toBe(500);
      expect(manualCount).toBe(500);

      // Verify all AI events have correct metadata
      const allAIHaveMetadata = retrievedEvents
        .filter(e => e.source === CodeSource.AI)
        .every(e => e.detectionMethod === 'inline-completion-api' && e.confidence === 'high');

      expect(allAIHaveMetadata).toBe(true);

      // Verify all Manual events have correct metadata
      const allManualHaveMetadata = retrievedEvents
        .filter(e => e.source === CodeSource.Manual)
        .every(e => e.detectionMethod === 'manual-typing' && e.confidence === 'high');

      expect(allManualHaveMetadata).toBe(true);

      // 100% accuracy: All 1000 events persisted correctly
      const accuracy = (retrievedEvents.length / 1000) * 100;
      expect(accuracy).toBe(100);

      console.log('✓ 1000 events persisted with 100% accuracy');
    });
  });
});
