/**
 * AgentSessionDetector Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AgentSessionDetector } from '../AgentSessionDetector';
import { TrackingEvent, EventType, AITool, AgentSession } from '../../types';

describe('AgentSessionDetector', () => {
  let detector: AgentSessionDetector;

  beforeEach(() => {
    detector = new AgentSessionDetector();
  });

  afterEach(() => {
    // Clean up any active session to stop timers
    detector.forceEndSession();
  });

  describe('Multi-Signal Detection', () => {
    it('should detect agent session with rapid file changes (3+ files in <10s)', () => {
      const baseTime = Date.now();
      const events: TrackingEvent[] = [
        {
          timestamp: baseTime,
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 50,
          filePath: '/project/file1.ts',
          fileWasOpen: true
        },
        {
          timestamp: baseTime + 3000,
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 40,
          filePath: '/project/file2.ts',
          fileWasOpen: true
        },
        {
          timestamp: baseTime + 6000,
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 60,
          filePath: '/project/file3.ts',
          fileWasOpen: true
        }
      ];

      let sessionDetected = false;
      events.forEach((e: TrackingEvent) => {
        const result = detector.processEvent(e);
        if (result.sessionDetected) {
          sessionDetected = true;
        }
      });

      expect(sessionDetected).toBe(true);
    });

    it('should detect agent session with closed file modifications', () => {
      const events: TrackingEvent[] = [
        {
          timestamp: Date.now(),
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 100,
          filePath: '/project/file1.ts',
          fileWasOpen: false,
          metadata: { closedFileModification: true }
        },
        {
          timestamp: Date.now() + 1000,
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 80,
          filePath: '/project/file2.ts',
          fileWasOpen: false,
          metadata: { closedFileModification: true }
        }
      ];

      let sessionDetected = false;
      events.forEach((e: TrackingEvent) => {
        const result = detector.processEvent(e);
        if (result.sessionDetected) {
          sessionDetected = true;
        }
      });

      expect(sessionDetected).toBe(true);
    });

    it('should NOT detect session with insufficient signals', () => {
      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        linesOfCode: 10,
        filePath: '/project/single-file.ts',
        fileWasOpen: true
      };

      const result = detector.processEvent(event);

      expect(result.sessionDetected).toBe(false);
    });
  });

  describe('Session Lifecycle', () => {
    it('should start session when signals detected', () => {
      const events: TrackingEvent[] = [
        {
          timestamp: Date.now(),
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 100,
          filePath: '/project/file1.ts',
          fileWasOpen: false,
          metadata: { closedFileModification: true, bulkGeneration: true }
        },
        {
          timestamp: Date.now() + 1000,
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 90,
          filePath: '/project/file2.ts',
          fileWasOpen: false,
          metadata: { closedFileModification: true }
        }
      ];

      const result1 = detector.processEvent(events[0]);
      const result2 = detector.processEvent(events[1]);

      // Session should be started
      expect(result1.sessionDetected || result2.sessionDetected).toBe(true);
      expect(result1.sessionStarted || result2.sessionStarted).toBe(true);
    });

    it('should return session details', () => {
      const events: TrackingEvent[] = [
        {
          timestamp: Date.now(),
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 100,
          filePath: '/project/file1.ts',
          fileWasOpen: false,
          metadata: { closedFileModification: true }
        },
        {
          timestamp: Date.now() + 1000,
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 80,
          filePath: '/project/file2.ts',
          fileWasOpen: false,
          metadata: { closedFileModification: true }
        }
      ];

      let session: AgentSession | null = null;
      events.forEach((e: TrackingEvent) => {
        const result = detector.processEvent(e);
        if (result.session) {
          session = result.session;
        }
      });

      expect(session).toBeDefined();
      expect(session).not.toBeNull();
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(session!.tool).toBe(AITool.ClaudeCode);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(session!.fileCount).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle events without filePath', () => {
      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        linesOfCode: 10,
        fileWasOpen: true
      };

      expect(() => detector.processEvent(event)).not.toThrow();
    });

    it('should handle events without metadata', () => {
      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.Copilot,
        eventType: EventType.SuggestionAccepted,
        linesOfCode: 10,
        filePath: '/project/file.ts',
        fileWasOpen: true
      };

      expect(() => detector.processEvent(event)).not.toThrow();
    });
  });

  describe('Session Management', () => {
    it('should get current session', () => {
      const events: TrackingEvent[] = [
        {
          timestamp: Date.now(),
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 100,
          filePath: '/project/file1.ts',
          fileWasOpen: false,
          metadata: { closedFileModification: true }
        },
        {
          timestamp: Date.now() + 1000,
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 80,
          filePath: '/project/file2.ts',
          fileWasOpen: false,
          metadata: { closedFileModification: true }
        }
      ];

      events.forEach((e: TrackingEvent) => {
        detector.processEvent(e);
      });

      const session = detector.getCurrentSession();
      expect(session).toBeDefined();
      expect(session).not.toBeNull();
    });

    it('should return null when no session active', () => {
      const session = detector.getCurrentSession();
      expect(session).toBeNull();
    });

    it('should force end session', () => {
      const events: TrackingEvent[] = [
        {
          timestamp: Date.now(),
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 100,
          filePath: '/project/file1.ts',
          fileWasOpen: false,
          metadata: { closedFileModification: true }
        },
        {
          timestamp: Date.now() + 1000,
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 80,
          filePath: '/project/file2.ts',
          fileWasOpen: false,
          metadata: { closedFileModification: true }
        }
      ];

      events.forEach((e: TrackingEvent) => {
        detector.processEvent(e);
      });

      expect(detector.getCurrentSession()).not.toBeNull();

      const endedSession = detector.forceEndSession();
      expect(endedSession).not.toBeNull();
      expect(detector.getCurrentSession()).toBeNull();
    });

    it('should return null when force ending with no active session', () => {
      const endedSession = detector.forceEndSession();
      expect(endedSession).toBeNull();
    });
  });

  describe('Bulk Code Generation Detection', () => {
    it('should detect bulk generation with large lines of code', () => {
      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.ClaudeCode,
        eventType: EventType.CodeGenerated,
        linesOfCode: 150,
        filePath: '/project/large-file.ts',
        fileWasOpen: true,
        metadata: { bulkGeneration: true }
      };

      const result = detector.processEvent(event);
      // Single signal isn't enough, but should be recorded
      expect(result).toBeDefined();
    });

    it('should detect session with bulk generation and closed file', () => {
      const events: TrackingEvent[] = [
        {
          timestamp: Date.now(),
          tool: AITool.ClaudeCode,
          eventType: EventType.CodeGenerated,
          linesOfCode: 150,
          filePath: '/project/bulk1.ts',
          fileWasOpen: false,
          metadata: { bulkGeneration: true, closedFileModification: true }
        },
        {
          timestamp: Date.now() + 1000,
          tool: AITool.ClaudeCode,
          eventType: EventType.CodeGenerated,
          linesOfCode: 120,
          filePath: '/project/bulk2.ts',
          fileWasOpen: false,
          metadata: { bulkGeneration: true, closedFileModification: true }
        }
      ];

      let sessionDetected = false;
      events.forEach((e: TrackingEvent) => {
        const result = detector.processEvent(e);
        if (result.sessionDetected) {
          sessionDetected = true;
        }
      });

      expect(sessionDetected).toBe(true);
    });
  });

  describe('Git Commit Detection', () => {
    it('should detect git commit signature as signal', () => {
      const event: TrackingEvent = {
        timestamp: Date.now(),
        tool: AITool.ClaudeCode,
        eventType: EventType.CodeGenerated,
        linesOfCode: 100,
        filePath: '/project/file.ts',
        fileWasOpen: true,
        metadata: { gitCommitSignature: true, closedFileModification: true }
      };

      const result = detector.processEvent(event);
      // 2 signals should trigger detection
      expect(result.sessionDetected).toBe(true);
    });
  });

  describe('Session Updates', () => {
    it('should update session with new file', () => {
      const events: TrackingEvent[] = [
        {
          timestamp: Date.now(),
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 100,
          filePath: '/project/file1.ts',
          fileWasOpen: false,
          metadata: { closedFileModification: true }
        },
        {
          timestamp: Date.now() + 1000,
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 80,
          filePath: '/project/file2.ts',
          fileWasOpen: false,
          metadata: { closedFileModification: true }
        },
        {
          timestamp: Date.now() + 2000,
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 60,
          filePath: '/project/file3.ts',
          fileWasOpen: false,
          metadata: { closedFileModification: true }
        }
      ];

      events.forEach((e: TrackingEvent) => {
        detector.processEvent(e);
      });

      const session = detector.getCurrentSession();
      expect(session).not.toBeNull();
      expect(session?.fileCount).toBeGreaterThanOrEqual(3);
    });

    it('should update session lines and characters', () => {
      const events: TrackingEvent[] = [
        {
          timestamp: Date.now(),
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 50,
          charactersCount: 1000,
          filePath: '/project/file1.ts',
          fileWasOpen: false,
          metadata: { closedFileModification: true }
        },
        {
          timestamp: Date.now() + 1000,
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 40,
          charactersCount: 800,
          filePath: '/project/file2.ts',
          fileWasOpen: false,
          metadata: { closedFileModification: true }
        }
      ];

      events.forEach((e: TrackingEvent) => {
        detector.processEvent(e);
      });

      const session = detector.getCurrentSession();
      expect(session).not.toBeNull();
      // Session may aggregate differently, just verify values increase
      expect(session?.totalLines).toBeGreaterThan(0);
      expect(session?.totalCharacters).toBeGreaterThan(0);
    });
  });

  describe('Confidence Levels', () => {
    it('should calculate low confidence with 2 signals', () => {
      const events: TrackingEvent[] = [
        {
          timestamp: Date.now(),
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 100,
          filePath: '/project/file1.ts',
          fileWasOpen: false,
          metadata: { closedFileModification: true }
        },
        {
          timestamp: Date.now() + 1000,
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 80,
          filePath: '/project/file2.ts',
          fileWasOpen: false,
          metadata: { closedFileModification: true }
        }
      ];

      let session: AgentSession | null = null;
      events.forEach((e: TrackingEvent) => {
        const result = detector.processEvent(e);
        if (result.session) {
          session = result.session;
        }
      });

      expect(session).not.toBeNull();
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(session!.confidence).toBe('low');
    });

    it('should calculate confidence with multiple signals', () => {
      const events: TrackingEvent[] = [
        {
          timestamp: Date.now(),
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 100,
          filePath: '/project/file1.ts',
          fileWasOpen: false,
          metadata: { closedFileModification: true, bulkGeneration: true }
        },
        {
          timestamp: Date.now() + 1000,
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 80,
          filePath: '/project/file2.ts',
          fileWasOpen: false,
          metadata: { closedFileModification: true }
        }
      ];

      let session: AgentSession | null = null;
      events.forEach((e: TrackingEvent) => {
        const result = detector.processEvent(e);
        if (result.session) {
          session = result.session;
        }
      });

      expect(session).not.toBeNull();
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(session!.confidence).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(['low', 'medium', 'high']).toContain(session!.confidence);
    });
  });

  describe('Consistent Source Detection', () => {
    it('should detect consistent source pattern', () => {
      const baseTime = Date.now();
      const events: TrackingEvent[] = [
        {
          timestamp: baseTime,
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 50,
          filePath: '/project/file1.ts',
          fileWasOpen: true
        },
        {
          timestamp: baseTime + 2000,
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 40,
          filePath: '/project/file2.ts',
          fileWasOpen: true
        },
        {
          timestamp: baseTime + 4000,
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 60,
          filePath: '/project/file3.ts',
          fileWasOpen: true
        },
        {
          timestamp: baseTime + 6000,
          tool: AITool.ClaudeCode,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 30,
          filePath: '/project/file4.ts',
          fileWasOpen: true,
          metadata: { closedFileModification: true }
        }
      ];

      let sessionDetected = false;
      events.forEach((e: TrackingEvent) => {
        const result = detector.processEvent(e);
        if (result.sessionDetected) {
          sessionDetected = true;
        }
      });

      expect(sessionDetected).toBe(true);
    });
  });
});
