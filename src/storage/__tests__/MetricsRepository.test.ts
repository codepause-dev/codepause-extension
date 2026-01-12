/**
 * MetricsRepository Tests
 */

jest.mock('../DatabaseManager');

import { MetricsRepository } from '../MetricsRepository';
import { DatabaseManager } from '../DatabaseManager';
import { TrackingEvent, AITool, EventType, CodingSession } from '../../types';

describe('MetricsRepository', () => {
  let metricsRepo: MetricsRepository;
  let mockDb: jest.Mocked<DatabaseManager>;

  const mockEvent: TrackingEvent = {
    id: 1,
    timestamp: Date.now(),
    tool: AITool.Copilot,
    eventType: EventType.SuggestionAccepted,
    filePath: 'test.ts',
    linesOfCode: 10,
  };

  const mockSession: CodingSession = {
    id: 'session1',
    startTime: Date.now() - 3600000,
    endTime: Date.now(),
    eventCount: 10,
    aiLinesGenerated: 50,
    manualLinesWritten: 20,
    toolsUsed: [AITool.Copilot],
  };

  beforeEach(() => {
    mockDb = new DatabaseManager('') as jest.Mocked<DatabaseManager>;
    mockDb.insertEvent = jest.fn().mockResolvedValue(1);
    mockDb.getDailyMetrics = jest.fn().mockResolvedValue({
      date: '2024-01-01',
      totalEvents: 10,
      totalAILines: 50,
      totalManualLines: 20,
      aiPercentage: 71,
      averageReviewTime: 2000,
      sessionCount: 1,
      toolBreakdown: {
        [AITool.Copilot]: { eventsCount: 5, linesGenerated: 25 },
      },
    } as any);
    mockDb.getEventsByDateRange = jest.fn().mockResolvedValue([mockEvent]);
    mockDb.getRecentEvents = jest.fn().mockResolvedValue([mockEvent]);
    mockDb.getSession = jest.fn().mockResolvedValue(mockSession);
    mockDb.getRecentSessions = jest.fn().mockResolvedValue([mockSession]);
    mockDb.getConfig = jest.fn().mockResolvedValue(null);
    mockDb.getDailyMetricsRange = jest.fn().mockResolvedValue([
      { date: '2024-01-01', totalEvents: 5 } as any,
    ]);

    metricsRepo = new MetricsRepository(mockDb);
  });

  describe('Event Recording', () => {
    it('should record tracking event', async () => {
      const eventId = await metricsRepo.recordEvent(mockEvent);
      expect(mockDb.insertEvent).toHaveBeenCalledWith(mockEvent);
      expect(eventId).toBe(1);
    });

    it('should get recent events', async () => {
      const events = await metricsRepo.getRecentEvents(50);
      expect(mockDb.getRecentEvents).toHaveBeenCalledWith(50);
      expect(events).toHaveLength(1);
    });
  });

  describe('Daily Metrics', () => {
    it('should get daily metrics', async () => {
      const metrics = await metricsRepo.getDailyMetrics('2024-01-01');
      expect(metrics).toBeTruthy();
      expect(mockDb.getDailyMetrics).toHaveBeenCalledWith('2024-01-01');
    });

    it('should get today metrics', async () => {
      const today = new Date().toISOString().split('T')[0];
      mockDb.getDailyMetrics.mockResolvedValue({ date: today, totalEvents: 5 } as any);
      
      const metrics = await metricsRepo.getTodayMetrics();
      expect(metrics).toBeTruthy();
    });

    it('should get last N days metrics', async () => {
      const metrics = await metricsRepo.getLastNDaysMetrics(7);
      expect(Array.isArray(metrics)).toBe(true);
      expect(mockDb.getDailyMetricsRange).toHaveBeenCalled();
    });
  });

  describe('Session Management', () => {
    it('should get session by ID', async () => {
      const session = await metricsRepo.getSession('session1');
      expect(mockDb.getSession).toHaveBeenCalledWith('session1');
      expect(session).toEqual(mockSession);
    });

    it('should get recent sessions', async () => {
      const sessions = await metricsRepo.getRecentSessions(5);
      expect(mockDb.getRecentSessions).toHaveBeenCalledWith(5);
      expect(sessions).toHaveLength(1);
    });
  });

  describe('Statistics', () => {
    it('should get real user event count', async () => {
      mockDb.getEventsByDateRange.mockResolvedValue([mockEvent, mockEvent]);
      const count = await metricsRepo.getRealUserEventCount();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should get stats summary', async () => {
      mockDb.getStats = jest.fn().mockResolvedValue({
        totalEvents: 100,
        totalSessions: 10,
        databaseSize: 1024
      });

      const stats = await metricsRepo.getStatsSummary();
      expect(stats.totalEvents).toBe(100);
      expect(stats.totalSessions).toBe(10);
      expect(stats.databaseSize).toBe(1024);
    });
  });

  describe('Session Operations', () => {
    it('should save session', async () => {
      mockDb.insertOrUpdateSession = jest.fn().mockResolvedValue(undefined);
      await metricsRepo.saveSession(mockSession);
      expect(mockDb.insertOrUpdateSession).toHaveBeenCalledWith(mockSession);
    });

    it('should get session events', async () => {
      mockDb.getSessionEvents = jest.fn().mockResolvedValue([mockEvent]);
      const events = await metricsRepo.getSessionEvents('session1');
      expect(mockDb.getSessionEvents).toHaveBeenCalledWith('session1');
      expect(events).toHaveLength(1);
    });
  });

  describe('Event Queries', () => {
    it('should get events for date range', async () => {
      mockDb.getEvents = jest.fn().mockResolvedValue([mockEvent]);
      const events = await metricsRepo.getEventsForDateRange('2024-01-01', '2024-01-07');
      expect(mockDb.getEvents).toHaveBeenCalledWith('2024-01-01', '2024-01-07');
      expect(events).toHaveLength(1);
    });
  });

  describe('File Review Operations', () => {
    it('should get unreviewed files', async () => {
      const mockFiles = [{ filePath: 'test.ts', isReviewed: false }];
      mockDb.getUnreviewedFiles = jest.fn().mockResolvedValue(mockFiles);

      const files = await metricsRepo.getUnreviewedFiles('2024-01-01');
      expect(mockDb.getUnreviewedFiles).toHaveBeenCalledWith('2024-01-01');
      expect(files).toEqual(mockFiles);
    });

    it('should get terminal reviewed files', async () => {
      const mockFiles = [{ filePath: 'test.ts', reviewedInTerminal: true }];
      mockDb.getTerminalReviewedFiles = jest.fn().mockResolvedValue(mockFiles);

      const files = await metricsRepo.getTerminalReviewedFiles('2024-01-01');
      expect(mockDb.getTerminalReviewedFiles).toHaveBeenCalledWith('2024-01-01');
      expect(files).toEqual(mockFiles);
    });

    it('should get file reviews for date', async () => {
      const mockReviews = [{ filePath: 'test.ts', reviewScore: 80 }];
      mockDb.getFileReviewsForDate = jest.fn().mockResolvedValue(mockReviews);

      const reviews = await metricsRepo.getFileReviewsForDate('2024-01-01');
      expect(mockDb.getFileReviewsForDate).toHaveBeenCalledWith('2024-01-01');
      expect(reviews).toEqual(mockReviews);
    });

    it('should save file review status', async () => {
      const status = { filePath: 'test.ts', isReviewed: true, reviewScore: 90 };
      mockDb.insertOrUpdateFileReviewStatus = jest.fn().mockResolvedValue(undefined);

      await metricsRepo.saveFileReviewStatus(status);
      expect(mockDb.insertOrUpdateFileReviewStatus).toHaveBeenCalledWith(status);
    });

    it('should mark file as reviewed', async () => {
      mockDb.markFileAsReviewed = jest.fn().mockResolvedValue(undefined);

      await metricsRepo.markFileAsReviewed('test.ts', 'copilot', '2024-01-01', 'mid');
      expect(mockDb.markFileAsReviewed).toHaveBeenCalledWith('test.ts', 'copilot', '2024-01-01', 'mid');
    });
  });

  describe('Agent Sessions', () => {
    it('should get recent agent sessions', async () => {
      const mockAgentSessions = [{ id: 'agent1', startTime: Date.now() }];
      mockDb.getRecentAgentSessions = jest.fn().mockResolvedValue(mockAgentSessions);

      const sessions = await metricsRepo.getRecentAgentSessions(5);
      expect(mockDb.getRecentAgentSessions).toHaveBeenCalledWith(5);
      expect(sessions).toEqual(mockAgentSessions);
    });
  });

  describe('Calculate Daily Metrics', () => {
    beforeEach(() => {
      mockDb.getEvents = jest.fn().mockResolvedValue([
        {
          timestamp: Date.now(),
          tool: AITool.Copilot,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 10,
          acceptanceTimeDelta: 2000,
          metadata: {}
        }
      ]);
      mockDb.getFileReviewsForDate = jest.fn().mockResolvedValue([]);
      mockDb.insertOrUpdateDailyMetrics = jest.fn().mockResolvedValue(undefined);
    });

    it('should calculate daily metrics from events', async () => {
      const metrics = await metricsRepo.calculateDailyMetrics('2024-01-01');

      expect(metrics.date).toBe('2024-01-01');
      expect(metrics.totalEvents).toBeGreaterThanOrEqual(0);
      expect(metrics.toolBreakdown).toBeDefined();
      expect(mockDb.insertOrUpdateDailyMetrics).toHaveBeenCalled();
    });

    it('should handle empty events', async () => {
      mockDb.getEvents.mockResolvedValue([]);

      const metrics = await metricsRepo.calculateDailyMetrics('2024-01-01');

      expect(metrics.totalEvents).toBe(0);
      expect(metrics.totalAILines).toBe(0);
      expect(metrics.totalManualLines).toBe(0);
    });

    it('should calculate AI percentage correctly', async () => {
      mockDb.getEvents.mockResolvedValue([
        {
          timestamp: Date.now(),
          tool: AITool.Copilot,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 80,
          metadata: {}
        },
        {
          timestamp: Date.now(),
          tool: AITool.Copilot,
          eventType: EventType.CodeGenerated,
          linesOfCode: 20,
          metadata: { manual: true }
        }
      ]);

      const metrics = await metricsRepo.calculateDailyMetrics('2024-01-01');

      expect(metrics.totalAILines).toBe(80);
      expect(metrics.totalManualLines).toBe(20);
      expect(metrics.aiPercentage).toBe(80);
    });

    it('should filter out old scanner events', async () => {
      const oldTimestamp = Date.now() - (2 * 60 * 60 * 1000); // 2 hours ago
      mockDb.getEvents.mockResolvedValue([
        {
          timestamp: oldTimestamp,
          tool: AITool.Copilot,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 10,
          metadata: { scanner: true }
        }
      ]);

      const metrics = await metricsRepo.calculateDailyMetrics('2024-01-01');

      expect(metrics.totalEvents).toBe(0);
    });

    it('should include recent scanner events with proper event types', async () => {
      const recentTimestamp = Date.now() - (30 * 60 * 1000); // 30 minutes ago
      mockDb.getEvents.mockResolvedValue([
        {
          timestamp: recentTimestamp,
          tool: AITool.Copilot,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 10,
          metadata: { scanner: true }
        }
      ]);

      const metrics = await metricsRepo.calculateDailyMetrics('2024-01-01');

      expect(metrics.totalEvents).toBe(1);
    });
  });

  describe('Core Metrics', () => {
    const mockThreshold = {
      maxAIPercentage: 60
    };

    beforeEach(() => {
      mockDb.getDailyMetrics.mockResolvedValue({
        date: new Date().toISOString().split('T')[0],
        totalEvents: 50,
        totalAILines: 80,
        totalManualLines: 20,
        aiPercentage: 80,
        averageReviewTime: 2000,
        sessionCount: 5,
        reviewQualityScore: 75,
        unreviewedPercentage: 10,
        toolBreakdown: {}
      } as any);
      mockDb.getDailyMetricsRange.mockResolvedValue([
        { date: '2024-01-01', totalEvents: 10, aiPercentage: 50, reviewQualityScore: 70 }
      ] as any);
      mockDb.getFileReviewsForDate = jest.fn().mockResolvedValue([
        { isReviewed: false, reviewScore: 60, linesOfCode: 100 }
      ]);
    });

    it('should get core metrics with authorship data', async () => {
      const coreMetrics = await metricsRepo.getCoreMetrics('mid', mockThreshold);

      expect(coreMetrics.authorship).toBeDefined();
      expect(coreMetrics.authorship.aiPercentage).toBe(80);
      expect(coreMetrics.authorship.manualPercentage).toBe(20);
      expect(coreMetrics.authorship.status).toBe('over-threshold');
    });

    it('should get core metrics with ownership data', async () => {
      const coreMetrics = await metricsRepo.getCoreMetrics('mid', mockThreshold);

      expect(coreMetrics.ownership).toBeDefined();
      expect(coreMetrics.ownership.score).toBe(75);
      expect(coreMetrics.ownership.category).toBe('thorough');
    });

    it('should get core metrics with skill health data', async () => {
      const coreMetrics = await metricsRepo.getCoreMetrics('mid', mockThreshold);

      expect(coreMetrics.skillHealth).toBeDefined();
      expect(coreMetrics.skillHealth.status).toBeDefined();
      expect(coreMetrics.skillHealth.score).toBeGreaterThanOrEqual(0);
    });

    it('should return empty metrics when no data available', async () => {
      mockDb.getDailyMetrics.mockResolvedValue(null);

      const coreMetrics = await metricsRepo.getCoreMetrics('mid', mockThreshold);

      expect(coreMetrics.authorship.aiPercentage).toBe(0);
      expect(coreMetrics.ownership.score).toBe(0);
      expect(coreMetrics.skillHealth.score).toBe(50);
    });
  });
});
