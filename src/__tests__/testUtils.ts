/**
 * Test Utilities
 */

import { DailyMetrics, AITool, ToolMetrics } from '../types';

export function createMockToolBreakdown(): Record<AITool, ToolMetrics> {
  return {
    [AITool.Copilot]: {
      tool: AITool.Copilot,
      suggestionCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      linesGenerated: 0,
      averageReviewTime: 0
    },
    [AITool.Cursor]: {
      tool: AITool.Cursor,
      suggestionCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      linesGenerated: 0,
      averageReviewTime: 0
    },
    [AITool.ClaudeCode]: {
      tool: AITool.ClaudeCode,
      suggestionCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      linesGenerated: 0,
      averageReviewTime: 0
    }
  };
}

export function createMockDailyMetrics(overrides?: Partial<DailyMetrics>): DailyMetrics {
  return {
    date: '2025-01-15',
    totalEvents: 0,
    totalAISuggestions: 0,
    totalAILines: 0,
    totalManualLines: 0,
    aiPercentage: 0,
    averageReviewTime: 0,
    sessionCount: 0,
    toolBreakdown: createMockToolBreakdown(),
    ...overrides
  };
}
