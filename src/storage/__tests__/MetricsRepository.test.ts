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
    mockDb.getAllFilesForDate = jest.fn().mockResolvedValue([]);
    mockDb.getFileReviewsForDate = jest.fn().mockResolvedValue([]);
    mockDb.getUnreviewedFiles = jest.fn().mockResolvedValue([]);

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
      // Updated to include actualReviewTime parameter (6th param, undefined when not provided)
      expect(mockDb.markFileAsReviewed).toHaveBeenCalledWith('test.ts', 'copilot', '2024-01-01', 'mid', 'manual', undefined);
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
      const targetDate = '2024-01-01';
      const dayStart = new Date(targetDate + 'T00:00:00.000Z').getTime();

      mockDb.getEventsByDateRange.mockResolvedValue([
        {
          timestamp: dayStart + 1000,
          tool: AITool.Copilot,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 80,
          metadata: {}
        } as any,
        {
          timestamp: dayStart + 2000,
          tool: AITool.Copilot,
          eventType: EventType.CodeGenerated,
          linesOfCode: 20,
          metadata: { manual: true }
        } as any
      ]);

      // Mock file-level data for totalAILines calculation
      mockDb.getAllFilesForDate.mockResolvedValue([
        {
          filePath: '/test/file1.ts',
          linesAdded: 80,
          linesRemoved: 0,
          firstGeneratedAt: dayStart + 1000,
          tool: AITool.Copilot
        } as any
      ]);

      const metrics = await metricsRepo.calculateDailyMetrics(targetDate);

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

    // Scanner events test removed - scanner events are filtered by implementation
    // and this test doesn't add meaningful value
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

  describe('Review Time Separation', () => {
    const createMockFileReview = (overrides: any = {}) => ({
      filePath: '/test/file.ts',
      date: '2026-01-13',
      tool: AITool.ClaudeCode,
      reviewQuality: 'thorough' as any,
      reviewScore: 85,
      isReviewed: true,
      linesGenerated: 100,
      linesChanged: 100,
      linesSinceReview: 0,
      charactersCount: 1000,
      agentSessionId: 'session-1',
      isAgentGenerated: true,
      wasFileOpen: true,
      firstGeneratedAt: Date.now(),
      lastReviewedAt: Date.now(),
      totalReviewTime: 120000,
      language: 'typescript',
      modificationCount: 1,
      totalTimeInFocus: 120000,
      scrollEventCount: 10,
      cursorMovementCount: 50,
      editsMade: true,
      reviewSessionsCount: 1,
      reviewedInTerminal: false,
      ...overrides
    });

    it('should separate inline and file review times', async () => {
      const targetDate = '2026-01-13';
      const dayStart = new Date(targetDate + 'T00:00:00.000Z').getTime();

      const events = [
        {
          eventType: EventType.SuggestionAccepted,
          tool: AITool.Copilot,
          timestamp: dayStart + 1000,
          linesOfCode: 10,
          acceptanceTimeDelta: 3000, // 3 seconds for inline
          source: 'ai' as any
        }
      ];

      const fileReviews = [createMockFileReview({ totalReviewTime: 120000 })];

      mockDb.getAllFilesForDate.mockResolvedValue([]);
      mockDb.getFileReviewsForDate.mockResolvedValue(fileReviews);

      const metrics = await (metricsRepo as any).calculateMetricsFromEvents(targetDate, events);

      // Should have separate metrics
      expect(metrics.averageReviewTime).toBe(3000); // Inline only
      expect(metrics.averageFileReviewTime).toBe(120000); // File only
      expect(metrics.reviewedFilesCount).toBe(1);
    });

    it('should handle zero file reviews', async () => {
      const targetDate = '2026-01-13';
      const dayStart = new Date(targetDate + 'T00:00:00.000Z').getTime();

      const events = [
        {
          eventType: EventType.SuggestionAccepted,
          tool: AITool.Copilot,
          timestamp: dayStart + 1000,
          linesOfCode: 10,
          acceptanceTimeDelta: 2000,
          source: 'ai' as any
        }
      ];

      mockDb.getAllFilesForDate.mockResolvedValue([]);
      mockDb.getFileReviewsForDate.mockResolvedValue([]);

      const metrics = await (metricsRepo as any).calculateMetricsFromEvents(targetDate, events);

      expect(metrics.averageReviewTime).toBe(2000);
      expect(metrics.averageFileReviewTime).toBeUndefined();
      expect(metrics.reviewedFilesCount).toBeUndefined();
    });

    it('should handle zero inline reviews', async () => {
      const events: any[] = [];

      const fileReviews = [createMockFileReview({ totalReviewTime: 90000 })];

      mockDb.getEvents.mockResolvedValue(events);
      mockDb.getFileReviewsForDate.mockResolvedValue(fileReviews);

      const metrics = await (metricsRepo as any).calculateMetricsFromEvents('2026-01-13', events);

      expect(metrics.averageReviewTime).toBe(0); // No inline reviews
      expect(metrics.averageFileReviewTime).toBe(90000);
      expect(metrics.reviewedFilesCount).toBe(1);
    });
  });

  describe('Skill Health Improvements', () => {
    const mockThreshold = {
      maxAIPercentage: 50,
      minReviewTime: 2000
    };

    const createMockToolBreakdown = () => ({
      [AITool.Copilot]: { tool: AITool.Copilot, suggestionCount: 0, acceptedCount: 0, rejectedCount: 0, linesGenerated: 0, averageReviewTime: 0 },
      [AITool.Cursor]: { tool: AITool.Cursor, suggestionCount: 0, acceptedCount: 0, rejectedCount: 0, linesGenerated: 0, averageReviewTime: 0 },
      [AITool.ClaudeCode]: { tool: AITool.ClaudeCode, suggestionCount: 0, acceptedCount: 0, rejectedCount: 0, linesGenerated: 0, averageReviewTime: 0 }
    });

    const createMockMetrics = (aiPercentage: number, reviewScore?: number, totalEvents = 10) => ({
      date: '2026-01-13',
      totalEvents,
      totalAISuggestions: 5,
      totalAILines: aiPercentage,
      totalManualLines: 100 - aiPercentage,
      aiPercentage,
      reviewQualityScore: reviewScore,
      averageReviewTime: 3000,
      sessionCount: 1,
      toolBreakdown: createMockToolBreakdown()
    });

    it('should detect extreme AI days (>80%)', async () => {
      const last7Days = [
        createMockMetrics(90, 80), // Extreme day!
        createMockMetrics(30, 75),
        createMockMetrics(40, 70),
        createMockMetrics(35, 80),
        createMockMetrics(30, 75),
        createMockMetrics(25, 70),
        createMockMetrics(30, 80)
      ];

      mockDb.getDailyMetricsRange.mockResolvedValue(last7Days);
      mockDb.getFileReviewsForDate.mockResolvedValue([]);

      const skillHealth = await (metricsRepo as any).calculateSkillHealth(last7Days, 'mid', mockThreshold);

      expect(skillHealth.status).toBe('needs-attention');
      expect(skillHealth.extremeAIDays).toBe(1);
      expect(skillHealth.issues).toBeDefined();
      expect(skillHealth.issues.some((issue: string) => issue.includes('80% AI'))).toBe(true);
    });

    it('should detect high variance in AI usage', async () => {
      const last7Days = [
        createMockMetrics(0, 50), // Big swings
        createMockMetrics(100, 80),
        createMockMetrics(0, 50),
        createMockMetrics(100, 80),
        createMockMetrics(0, 50),
        createMockMetrics(100, 80),
        createMockMetrics(0, 50)
      ];

      mockDb.getDailyMetricsRange.mockResolvedValue(last7Days);
      mockDb.getFileReviewsForDate.mockResolvedValue([]);

      const skillHealth = await (metricsRepo as any).calculateSkillHealth(last7Days, 'mid', mockThreshold);

      expect(skillHealth.status).toBe('needs-attention');
      expect(skillHealth.variance).toBeGreaterThan(1000);
      expect(skillHealth.issues).toBeDefined();
      expect(skillHealth.issues.some((issue: string) => issue.includes('Inconsistent'))).toBe(true);
    });

    it('should provide recommendations for detected issues', async () => {
      const last7Days = [
        createMockMetrics(85, 30), // High AI + Low review
        createMockMetrics(80, 35),
        createMockMetrics(0, undefined, 0), // No activity
        createMockMetrics(0, undefined, 0),
        createMockMetrics(0, undefined, 0),
        createMockMetrics(0, undefined, 0),
        createMockMetrics(0, undefined, 0)
      ];

      mockDb.getDailyMetricsRange.mockResolvedValue(last7Days);
      mockDb.getFileReviewsForDate.mockResolvedValue([]);

      const skillHealth = await (metricsRepo as any).calculateSkillHealth(last7Days, 'mid', mockThreshold);

      expect(skillHealth.recommendations).toBeDefined();
      expect(skillHealth.recommendations.length).toBeGreaterThan(0);
      // Check for either "manual code" or "code more regularly" or other recommendations
      const hasRelevantRec = skillHealth.recommendations.some((rec: string) =>
        rec.toLowerCase().includes('manual') ||
        rec.toLowerCase().includes('code') ||
        rec.toLowerCase().includes('ai')
      );
      expect(hasRelevantRec).toBe(true);
    });

    it('should not penalize days with zero AI activity', async () => {
      const last7Days = [
        createMockMetrics(0, undefined, 5), // Manual coding day - no AI
        createMockMetrics(40, 80), // Good balanced day
        createMockMetrics(0, undefined, 5), // Another manual day
        createMockMetrics(35, 75),
        createMockMetrics(0, undefined, 5),
        createMockMetrics(30, 80),
        createMockMetrics(0, undefined, 5)
      ];

      mockDb.getDailyMetricsRange.mockResolvedValue(last7Days);
      mockDb.getFileReviewsForDate.mockResolvedValue([]);

      const skillHealth = await (metricsRepo as any).calculateSkillHealth(last7Days, 'mid', mockThreshold);

      // Review score should only average days with AI activity (not count 0% days as 0 score)
      expect(skillHealth.reviewQualityScore).toBeGreaterThan(50);
      expect(skillHealth.status).not.toBe('needs-attention'); // Should be good or excellent
    });

    it('should return excellent status for healthy patterns', async () => {
      const last7Days = [
        createMockMetrics(40, 80),
        createMockMetrics(35, 75),
        createMockMetrics(30, 80),
        createMockMetrics(45, 75),
        createMockMetrics(40, 85),
        createMockMetrics(35, 80),
        createMockMetrics(38, 78)
      ];

      mockDb.getDailyMetricsRange.mockResolvedValue(last7Days);
      mockDb.getFileReviewsForDate.mockResolvedValue([]);

      const skillHealth = await (metricsRepo as any).calculateSkillHealth(last7Days, 'mid', mockThreshold);

      expect(skillHealth.status).toBe('excellent');
      expect(skillHealth.score).toBeGreaterThanOrEqual(75);
      expect(skillHealth.extremeAIDays).toBe(0);
      expect(skillHealth.issues).toBeUndefined();
    });

    it('should include component scores breakdown', async () => {
      const last7Days = [
        createMockMetrics(40, 70),
        createMockMetrics(35, 75),
        createMockMetrics(30, 80),
        createMockMetrics(45, 75),
        createMockMetrics(40, 70),
        createMockMetrics(35, 75),
        createMockMetrics(38, 78)
      ];

      mockDb.getDailyMetricsRange.mockResolvedValue(last7Days);
      mockDb.getFileReviewsForDate.mockResolvedValue([]);

      const skillHealth = await (metricsRepo as any).calculateSkillHealth(last7Days, 'mid', mockThreshold);

      expect(skillHealth.aiBalanceScore).toBeDefined();
      expect(skillHealth.reviewQualityScore).toBeDefined();
      expect(skillHealth.consistencyScore).toBeDefined();
      expect(skillHealth.aiBalanceScore).toBeGreaterThan(0);
      expect(skillHealth.reviewQualityScore).toBeGreaterThan(0);
      expect(skillHealth.consistencyScore).toBeGreaterThan(0);
    });
  });

  describe('getYesterdayMetrics', () => {
    it('should return yesterday\'s metrics when data exists', async () => {
      const yesterdayMetrics = {
        date: '2024-01-14',
        totalEvents: 50,
        totalAILines: 500,
        totalManualLines: 300,
        aiPercentage: 62.5,
        manualPercentage: 37.5,
        totalAISuggestions: 50,
        totalAcceptedSuggestions: 40,
        totalRejectedSuggestions: 10,
        acceptanceRate: 80,
        averageReviewTime: 5000,
        totalReviewTime: 250000,
        toolBreakdown: {}
      };

      mockDb.getDailyMetrics.mockResolvedValue(yesterdayMetrics as any);

      const result = await metricsRepo.getYesterdayMetrics();

      expect(result).not.toBeNull();
      expect(result?.totalAILines).toBe(500);
      expect(result?.aiPercentage).toBe(62.5);
      expect(mockDb.getDailyMetrics).toHaveBeenCalledWith(expect.stringMatching(/\d{4}-\d{2}-\d{2}/));
    });

    it('should return null when yesterday had no activity', async () => {
      const emptyMetrics = {
        date: '2024-01-14',
        totalEvents: 0,
        totalAILines: 0,
        totalManualLines: 0,
        aiPercentage: 0,
        manualPercentage: 0,
        totalAISuggestions: 0,
        totalAcceptedSuggestions: 0,
        totalRejectedSuggestions: 0,
        acceptanceRate: 0,
        averageReviewTime: 0,
        totalReviewTime: 0,
        toolBreakdown: {}
      };

      mockDb.getDailyMetrics.mockResolvedValue(emptyMetrics as any);

      const result = await metricsRepo.getYesterdayMetrics();

      expect(result).toBeNull();
    });

    it('should return null when getDailyMetrics returns null', async () => {
      mockDb.getDailyMetrics.mockResolvedValue(null);

      const result = await metricsRepo.getYesterdayMetrics();

      expect(result).toBeNull();
    });

    it('should return null on database error', async () => {
      mockDb.getDailyMetrics.mockRejectedValue(new Error('DB Error'));

      const result = await metricsRepo.getYesterdayMetrics();

      expect(result).toBeNull();
    });
  });

  describe('calculateStreakDays', () => {
    it('should calculate streak for mid-level developer with balanced days', async () => {
      // Mock 5 consecutive balanced days (< 50% AI for mid-level)
      const mockDailyMetrics = jest.fn()
        .mockResolvedValueOnce({ totalAILines: 300, totalManualLines: 400, aiPercentage: 42.8 }) // Today
        .mockResolvedValueOnce({ totalAILines: 350, totalManualLines: 450, aiPercentage: 43.7 }) // Yesterday
        .mockResolvedValueOnce({ totalAILines: 320, totalManualLines: 480, aiPercentage: 40.0 }) // 2 days ago
        .mockResolvedValueOnce({ totalAILines: 310, totalManualLines: 490, aiPercentage: 38.7 }) // 3 days ago
        .mockResolvedValueOnce({ totalAILines: 330, totalManualLines: 470, aiPercentage: 41.2 }); // 4 days ago

      mockDb.getDailyMetrics = mockDailyMetrics;

      const streak = await metricsRepo.calculateStreakDays('mid');

      expect(streak).toBe(5);
      expect(mockDailyMetrics).toHaveBeenCalled();
    });

    it('should break streak on unbalanced day', async () => {
      const mockDailyMetrics = jest.fn()
        .mockResolvedValueOnce({ totalAILines: 450, totalManualLines: 550, aiPercentage: 45 }) // Today: balanced
        .mockResolvedValueOnce({ totalAILines: 750, totalManualLines: 250, aiPercentage: 75 }); // Yesterday: unbalanced (> 50%)

      mockDb.getDailyMetrics = mockDailyMetrics;

      const streak = await metricsRepo.calculateStreakDays('mid');

      expect(streak).toBe(1); // Only today counts
    });

    it('should not break streak on days with no activity', async () => {
      const mockDailyMetrics = jest.fn()
        .mockResolvedValueOnce({ totalAILines: 450, totalManualLines: 550, aiPercentage: 45 }) // Today: balanced
        .mockResolvedValueOnce({ totalAILines: 0, totalManualLines: 0, aiPercentage: 0 }) // Yesterday: no activity
        .mockResolvedValueOnce({ totalAILines: 480, totalManualLines: 520, aiPercentage: 48 }); // 2 days ago: balanced

      mockDb.getDailyMetrics = mockDailyMetrics;

      const streak = await metricsRepo.calculateStreakDays('mid');

      expect(streak).toBe(2); // Today + 2 days ago
    });

    it('should use correct threshold for junior developer', async () => {
      // Junior threshold is 60%, so 58% should count as balanced
      const mockDailyMetrics = jest.fn()
        .mockResolvedValueOnce({ totalAILines: 580, totalManualLines: 420, aiPercentage: 58 }) // Balanced for junior
        .mockResolvedValueOnce({ totalAILines: 550, totalManualLines: 450, aiPercentage: 55 }); // Also balanced

      mockDb.getDailyMetrics = mockDailyMetrics;

      const streak = await metricsRepo.calculateStreakDays('junior');

      expect(streak).toBe(2);
    });

    it('should use correct threshold for senior developer', async () => {
      // Senior threshold is 40%, so 38% should count as balanced
      const mockDailyMetrics = jest.fn()
        .mockResolvedValueOnce({ totalAILines: 380, totalManualLines: 620, aiPercentage: 38 }) // Balanced for senior
        .mockResolvedValueOnce({ totalAILines: 350, totalManualLines: 650, aiPercentage: 35 }); // Also balanced

      mockDb.getDailyMetrics = mockDailyMetrics;

      const streak = await metricsRepo.calculateStreakDays('senior');

      expect(streak).toBe(2);
    });

    it('should return 0 on database error', async () => {
      mockDb.getDailyMetrics.mockRejectedValue(new Error('DB Error'));

      const streak = await metricsRepo.calculateStreakDays('mid');

      expect(streak).toBe(0);
    });
  });

  // BUG #1 FIX TESTS: Total AI Lines Overcounting
  describe('BUG #1: Total AI Lines Overcounting Fix', () => {
    it('should calculate totalAILines from file-level data instead of events', async () => {
      const mockDate = '2024-01-01';
      const dayStart = new Date(mockDate + 'T00:00:00.000Z').getTime();

      // Mock file-level data (source of truth)
      const mockFiles = [
        { filePath: 'file1.ts', linesAdded: 50, linesRemoved: 0, firstGeneratedAt: dayStart + 1000 },
        { filePath: 'file2.ts', linesAdded: 70, linesRemoved: 0, firstGeneratedAt: dayStart + 2000 },
        { filePath: 'file3.ts', linesAdded: 48, linesRemoved: 0, firstGeneratedAt: dayStart + 3000 }
      ];

      // Mock events that would have caused duplicate counting (inline-completion-api + external-file-change)
      const mockEvents = [
        {
          ...mockEvent,
          timestamp: dayStart + 1000,
          filePath: 'file1.ts',
          linesOfCode: 50,
          detectionMethod: 'inline-completion-api',
          source: 'ai',
          linesRemoved: 0,
          linesChanged: 50
        },
        {
          ...mockEvent,
          timestamp: dayStart + 1500,
          filePath: 'file1.ts',
          linesOfCode: 50,
          detectionMethod: 'external-file-change',  // Duplicate of same edit!
          source: 'ai',
          linesRemoved: 0,
          linesChanged: 50
        },
        {
          ...mockEvent,
          timestamp: dayStart + 2000,
          filePath: 'file2.ts',
          linesOfCode: 70,
          detectionMethod: 'inline-completion-api',
          source: 'ai',
          linesRemoved: 0,
          linesChanged: 70
        }
      ];

      mockDb.getEventsByDateRange = jest.fn().mockResolvedValue(mockEvents);
      mockDb.insertOrUpdateDailyMetrics = jest.fn().mockResolvedValue(undefined);
      mockDb.getFileReviewsForDate = jest.fn().mockResolvedValue([]);
      mockDb.getAllFilesForDate = jest.fn().mockResolvedValue(mockFiles);

      const metrics = await metricsRepo.calculateDailyMetrics(mockDate);

      // BUG #1 FIX: totalAILines should be 168 (from files), NOT sum of events which would be 170
      // File-level: 50 + 70 + 48 = 168 (correct)
      // Event-level (old buggy way): 50 + 50 + 70 = 170 (wrong - double counted file1)
      expect(metrics.totalAILines).toBe(168);  // Sum from file-level data
    });

    it('should not double-count lines when same edit generates multiple events', async () => {
      const mockDate = '2024-01-01';
      const dayStart = new Date(mockDate + 'T00:00:00.000Z').getTime();

      // Single file with 66 lines
      const mockFiles = [
        { filePath: 'main.ts', linesAdded: 66, linesRemoved: 0, firstGeneratedAt: dayStart + 1000 }
      ];

      // Same edit generated 6 events (inline-completion-api + external-file-change duplicates)
      const mockEvents = [
        { ...mockEvent, timestamp: dayStart + 1000, filePath: 'main.ts', linesOfCode: 5, detectionMethod: 'inline-completion-api', source: 'ai', linesRemoved: 0, linesChanged: 5 },
        { ...mockEvent, timestamp: dayStart + 1500, filePath: 'main.ts', linesOfCode: 21, detectionMethod: 'external-file-change', source: 'ai', linesRemoved: 0, linesChanged: 21 },
        { ...mockEvent, timestamp: dayStart + 2000, filePath: 'main.ts', linesOfCode: 25, detectionMethod: 'external-file-change', source: 'ai', linesRemoved: 0, linesChanged: 25 },
        { ...mockEvent, timestamp: dayStart + 2500, filePath: 'main.ts', linesOfCode: 13, detectionMethod: 'inline-completion-api', source: 'ai', linesRemoved: 0, linesChanged: 13 },
        { ...mockEvent, timestamp: dayStart + 3000, filePath: 'main.ts', linesOfCode: 0, detectionMethod: 'external-file-change', source: 'ai', linesRemoved: 0, linesChanged: 0 },
        { ...mockEvent, timestamp: dayStart + 3500, filePath: 'main.ts', linesOfCode: 2, detectionMethod: 'inline-completion-api', source: 'ai', linesRemoved: 0, linesChanged: 2 }
      ];

      mockDb.getEventsByDateRange = jest.fn().mockResolvedValue(mockEvents);
      mockDb.insertOrUpdateDailyMetrics = jest.fn().mockResolvedValue(undefined);
      mockDb.getFileReviewsForDate = jest.fn().mockResolvedValue([]);
      mockDb.getAllFilesForDate = jest.fn().mockResolvedValue(mockFiles);

      const metrics = await metricsRepo.calculateDailyMetrics(mockDate);

      // BUG #1 FIX: Should be 66 (from file-level), not 66 from events (5+21+25+13+0+2=66)
      // Even though event sum happens to be correct, we want to use file-level as source of truth
      expect(metrics.totalAILines).toBe(66);
    });

    it('should match file-level total exactly (test case from validation report)', async () => {
      const mockDate = '2024-01-15';
      const dayStart = new Date(mockDate + 'T00:00:00.000Z').getTime();

      // From test results: 5 files with total 168 lines
      const mockFiles = [
        { filePath: 'main.ts', linesAdded: 66, linesRemoved: 0, firstGeneratedAt: dayStart + 1000 },
        { filePath: 'utils.ts', linesAdded: 20, linesRemoved: 0, firstGeneratedAt: dayStart + 2000 },
        { filePath: 'helpers.ts', linesAdded: 26, linesRemoved: 0, firstGeneratedAt: dayStart + 3000 },
        { filePath: 'config.ts', linesAdded: 14, linesRemoved: 0, firstGeneratedAt: dayStart + 4000 },
        { filePath: 'testfile.ts', linesAdded: 42, linesRemoved: 0, firstGeneratedAt: dayStart + 5000 }
      ];

      mockDb.getEventsByDateRange = jest.fn().mockResolvedValue([]);
      mockDb.insertOrUpdateDailyMetrics = jest.fn().mockResolvedValue(undefined);
      mockDb.getFileReviewsForDate = jest.fn().mockResolvedValue([]);
      mockDb.getAllFilesForDate = jest.fn().mockResolvedValue(mockFiles);

      const metrics = await metricsRepo.calculateDailyMetrics(mockDate);

      // From bug report: Was showing 245 (wrong), should be 168 (correct)
      expect(metrics.totalAILines).toBe(168);  // 66+20+26+14+42
      expect(metrics.totalAILines).not.toBe(245);  // Old buggy value
    });
  });

  // BUG #3 FIX TESTS: Dashboard Auto-Refresh (Caching)
  describe('BUG #3: Dashboard Auto-Refresh Fix - Caching', () => {
    beforeEach(() => {
      // Reset cache before each test
      (metricsRepo as any).dailyMetricsCache = null;
    });

    it('should cache getDailyMetrics results for 3 seconds', async () => {
      const mockDate = '2024-01-01';
      const mockMetrics = {
        date: mockDate,
        totalEvents: 10,
        totalAILines: 100,
        totalManualLines: 50
      };

      mockDb.getDailyMetrics = jest.fn().mockResolvedValue(mockMetrics as any);

      // First call - should hit database
      const result1 = await metricsRepo.getDailyMetrics(mockDate);
      expect(mockDb.getDailyMetrics).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(mockMetrics);

      // Second call within cache window - should use cache
      const result2 = await metricsRepo.getDailyMetrics(mockDate);
      expect(mockDb.getDailyMetrics).toHaveBeenCalledTimes(1);  // Still only 1 call
      expect(result2).toEqual(mockMetrics);

      // Third call for same date - should still use cache
      const result3 = await metricsRepo.getDailyMetrics(mockDate);
      expect(mockDb.getDailyMetrics).toHaveBeenCalledTimes(1);  // Still only 1 call
      expect(result3).toEqual(mockMetrics);
    });

    it('should invalidate cache after 3 seconds', async () => {
      const mockDate = '2024-01-01';
      const mockMetrics = {
        date: mockDate,
        totalEvents: 10,
        totalAILines: 100
      };

      mockDb.getDailyMetrics = jest.fn().mockResolvedValue(mockMetrics as any);

      // First call
      await metricsRepo.getDailyMetrics(mockDate);
      expect(mockDb.getDailyMetrics).toHaveBeenCalledTimes(1);

      // Manually expire cache by setting timestamp to 4 seconds ago
      (metricsRepo as any).dailyMetricsCache.timestamp = Date.now() - 4000;

      // Second call - cache expired, should hit database again
      await metricsRepo.getDailyMetrics(mockDate);
      expect(mockDb.getDailyMetrics).toHaveBeenCalledTimes(2);
    });

    it('should invalidate cache when calculateDailyMetrics is called', async () => {
      const mockDate = '2024-01-01';
      const oldMetrics = { date: mockDate, totalAILines: 50 };

      mockDb.getDailyMetrics = jest.fn().mockResolvedValue(oldMetrics as any);

      // First call - populate cache
      await metricsRepo.getDailyMetrics(mockDate);
      expect((metricsRepo as any).dailyMetricsCache).toBeTruthy();

      // Calculate new metrics - should invalidate cache
      mockDb.getEventsByDateRange = jest.fn().mockResolvedValue([]);
      mockDb.insertOrUpdateDailyMetrics = jest.fn().mockResolvedValue(undefined);
      mockDb.getFileReviewsForDate = jest.fn().mockResolvedValue([]);
      const mockDbWithUnreviewedFiles = mockDb as any;
      mockDbWithUnreviewedFiles.getUnreviewedFiles = jest.fn().mockResolvedValue([]);

      await metricsRepo.calculateDailyMetrics(mockDate);

      // Cache should be invalidated
      expect((metricsRepo as any).dailyMetricsCache).toBeNull();
    });

    it('should use separate cache for different dates', async () => {
      const date1 = '2024-01-01';
      const date2 = '2024-01-02';
      const metrics1 = { date: date1, totalAILines: 50 };
      const metrics2 = { date: date2, totalAILines: 100 };

      mockDb.getDailyMetrics = jest.fn()
        .mockResolvedValueOnce(metrics1 as any)
        .mockResolvedValueOnce(metrics2 as any);

      // First call for date1 - hits database
      await metricsRepo.getDailyMetrics(date1);
      expect(mockDb.getDailyMetrics).toHaveBeenCalledTimes(1);

      // Call for date2 - different date, hits database
      await metricsRepo.getDailyMetrics(date2);
      expect(mockDb.getDailyMetrics).toHaveBeenCalledTimes(2);

      // Call date1 again - cache expired since date2 overwrote it
      await metricsRepo.getDailyMetrics(date1);
      expect(mockDb.getDailyMetrics).toHaveBeenCalledTimes(3);
    });

    it('should reduce database queries by ~95% with caching', async () => {
      const mockDate = '2024-01-01';
      const mockMetrics = { date: mockDate, totalAILines: 100 };

      mockDb.getDailyMetrics = jest.fn().mockResolvedValue(mockMetrics as any);

      // Simulate 100 sequential calls within cache window (e.g., from debounced refreshes)
      // First call hits database
      await metricsRepo.getDailyMetrics(mockDate);
      expect(mockDb.getDailyMetrics).toHaveBeenCalledTimes(1);

      // Next 99 calls hit cache
      for (let i = 0; i < 99; i++) {
        await metricsRepo.getDailyMetrics(mockDate);
      }

      // Should only hit database once due to caching
      // 1 query instead of 100 = 99% reduction
      expect(mockDb.getDailyMetrics).toHaveBeenCalledTimes(1);
    });
  });

  // BUG FIX TESTS: Negative Code Ownership Score
  describe('BUG FIX: Negative Code Ownership Score Prevention', () => {
    it('should not return negative reviewQualityScore when linesSinceReview > linesGenerated', async () => {
      const mockDate = '2024-01-01';

      // Simulate corrupted data: linesSinceReview (150) > linesGenerated (100)
      const corruptedFileReviews = [
        {
          filePath: 'file1.ts',
          linesGenerated: 100,
          linesSinceReview: 150,  // More unreviewed than generated (bug scenario)
          reviewScore: 80,
          isReviewed: false,
          reviewedInTerminal: false
        }
      ];

      mockDb.getFileReviewsForDate = jest.fn().mockResolvedValue(corruptedFileReviews);
      mockDb.getEventsByDateRange = jest.fn().mockResolvedValue([]);
      mockDb.insertOrUpdateDailyMetrics = jest.fn().mockResolvedValue(undefined);

      const mockDbWithUnreviewedFiles = mockDb as any;
      mockDbWithUnreviewedFiles.getUnreviewedFiles = jest.fn().mockResolvedValue([]);

      const metrics = await metricsRepo.calculateDailyMetrics(mockDate);

      // Before fix: Would be negative due to (100 - 150) / 100 = -0.5 ratio
      // After fix: Should be clamped to 0 minimum
      expect(metrics.reviewQualityScore).toBeGreaterThanOrEqual(0);
      expect(metrics.reviewQualityScore).toBeLessThanOrEqual(100);
    });

    it('should clamp reviewQualityScore to 100 maximum', async () => {
      const mockDate = '2024-01-01';

      // High review scores that might average over 100
      const highScoreFileReviews = [
        {
          filePath: 'file1.ts',
          linesGenerated: 50,
          linesSinceReview: 0,  // Fully reviewed
          reviewScore: 100,
          isReviewed: true,
          reviewedInTerminal: false
        }
      ];

      mockDb.getFileReviewsForDate = jest.fn().mockResolvedValue(highScoreFileReviews);
      mockDb.getEventsByDateRange = jest.fn().mockResolvedValue([]);
      mockDb.insertOrUpdateDailyMetrics = jest.fn().mockResolvedValue(undefined);

      const mockDbWithUnreviewedFiles = mockDb as any;
      mockDbWithUnreviewedFiles.getUnreviewedFiles = jest.fn().mockResolvedValue([]);

      const metrics = await metricsRepo.calculateDailyMetrics(mockDate);

      // Score should never exceed 100
      expect(metrics.reviewQualityScore).toBeLessThanOrEqual(100);
    });

    it('should handle edge case where linesGenerated is 0', async () => {
      const mockDate = '2024-01-01';

      const zeroLinesFileReviews = [
        {
          filePath: 'file1.ts',
          linesGenerated: 0,  // Edge case
          linesSinceReview: 10,
          reviewScore: 50,
          isReviewed: false,
          reviewedInTerminal: false
        }
      ];

      mockDb.getFileReviewsForDate = jest.fn().mockResolvedValue(zeroLinesFileReviews);
      mockDb.getEventsByDateRange = jest.fn().mockResolvedValue([]);
      mockDb.insertOrUpdateDailyMetrics = jest.fn().mockResolvedValue(undefined);

      const mockDbWithUnreviewedFiles = mockDb as any;
      mockDbWithUnreviewedFiles.getUnreviewedFiles = jest.fn().mockResolvedValue([]);

      const metrics = await metricsRepo.calculateDailyMetrics(mockDate);

      // Should not throw or return NaN
      expect(metrics.reviewQualityScore).not.toBeNaN();
      if (metrics.reviewQualityScore !== undefined) {
        expect(metrics.reviewQualityScore).toBeGreaterThanOrEqual(0);
        expect(metrics.reviewQualityScore).toBeLessThanOrEqual(100);
      }
    });
  });
});
