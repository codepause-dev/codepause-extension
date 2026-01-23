/**
 * CodePause Type Definitions
 * Central type system for the extension
 */

// ==================== Core Enums ====================

export enum AITool {
  Copilot = 'copilot',
  Cursor = 'cursor',
  ClaudeCode = 'claude-code'
}

// NEW: Unified code source (replaces tool-specific tracking)
export enum CodeSource {
  AI = 'ai',
  Manual = 'manual'
}

export enum DeveloperLevel {
  Junior = 'junior',
  Mid = 'mid',
  Senior = 'senior'
}

export enum AlertType {
  GentleNudge = 'gentle-nudge',
  EducationalMoment = 'educational-moment',
  StreakWarning = 'streak-warning',
  Achievement = 'achievement',
  ReviewReminder = 'review-reminder',
  ExcessiveUnreviewed = 'excessive-unreviewed',
  OwnershipShift = 'ownership-shift'
}

export enum AlertFrequency {
  Low = 'low',
  Medium = 'medium',
  High = 'high'
}

export enum EventType {
  SuggestionDisplayed = 'suggestion-displayed',
  SuggestionAccepted = 'suggestion-accepted',
  SuggestionRejected = 'suggestion-rejected',
  CodeGenerated = 'code-generated',
  SessionStart = 'session-start',
  SessionEnd = 'session-end'
}

export enum BlindApprovalConfidence {
  Low = 'low',
  Medium = 'medium',
  High = 'high'
}

export enum ReviewQuality {
  Thorough = 'thorough',
  Light = 'light',
  None = 'none'
}

// ==================== Core Interfaces ====================

/**
 * Represents a single tracking event from an AI tool
 */
export interface TrackingEvent {
  id?: number;
  timestamp: number;
  tool: AITool; // DEPRECATED: Use 'source' instead
  source?: CodeSource; // NEW: 'ai' or 'manual'
  eventType: EventType;
  linesOfCode?: number; // For metrics: AI lines added (positive only)
  linesRemoved?: number; // Lines removed (positive value)
  linesChanged?: number; // For review scoring: total lines changed (added + deleted)
  charactersCount?: number;
  acceptanceTimeDelta?: number; // milliseconds
  filePath?: string;
  language?: string;
  sessionId?: string;
  detectionMethod?: string; // NEW: How we detected it (for debugging)
  confidence?: string; // NEW: Detection confidence level
  metadata?: Record<string, unknown>; // Changed from 'any' to 'unknown'

  // Review quality tracking
  reviewQuality?: ReviewQuality;
  reviewQualityScore?: number; // 0-100
  isReviewed?: boolean;
  reviewDepth?: number; // 0-1 normalized

  // Agent mode tracking
  isAgentMode?: boolean;
  agentSessionId?: string;
  fileWasOpen?: boolean;
}

/**
 * Pending suggestion waiting for acceptance/rejection
 */
export interface PendingSuggestion {
  id: string;
  tool: AITool;
  timestamp: number;
  linesOfCode: number;
  charactersCount: number;
  filePath: string;
  language: string;
  expiresAt: number;
}

/**
 * Blind approval detection result
 */
export interface BlindApprovalDetection {
  isBlindApproval: boolean;
  confidence: BlindApprovalConfidence;
  timeDelta: number;
  threshold: number;
  signals: {
    timeBased: boolean;
    patternBased: boolean;
    complexityBased: boolean;
  };
}

/**
 * Daily aggregated metrics
 */
export interface DailyMetrics {
  date: string; // YYYY-MM-DD
  totalEvents: number; // Total events (AI + manual) for activity tracking
  totalAISuggestions: number; // AI suggestions only (for dashboard stat)
  totalAILines: number;
  totalManualLines: number;
  aiPercentage: number;
  averageReviewTime: number; // Inline completions only (milliseconds)
  sessionCount: number;
  toolBreakdown: Record<AITool, ToolMetrics>;

  // Review quality metrics
  reviewQualityScore?: number; // 0-100 average
  unreviewedLines?: number;
  unreviewedPercentage?: number;
  agentSessionCount?: number;
  unreviewedFiles?: string[];
  reviewedFileCount?: number;
  unreviewedFileCount?: number;

  // Separate file review time metric (milliseconds)
  averageFileReviewTime?: number; // Average time spent reviewing AI-generated files
  reviewedFilesCount?: number; // Number of files reviewed
}

/**
 * Per-tool metrics
 */
export interface ToolMetrics {
  tool: AITool;
  suggestionCount: number;
  acceptedCount: number;
  rejectedCount: number;
  linesGenerated: number;
  averageReviewTime: number;
}

/**
 * Coding session data
 */
export interface CodingSession {
  id: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  eventCount: number;
  aiLinesGenerated: number;
  manualLinesWritten: number;
  toolsUsed: AITool[];
}

/**
 * Agent session data - autonomous AI code generation session
 */
export interface AgentSession {
  id: string;
  tool: AITool;
  startTime: number;
  endTime?: number;
  duration?: number;
  fileCount: number;
  totalLines: number;
  totalCharacters: number;
  wasReviewed: boolean;
  reviewQuality?: ReviewQuality;
  reviewScore?: number; // 0-100
  reviewTime?: number; // milliseconds spent reviewing
  detectionSignals: {
    rapidFileChanges: boolean;
    closedFileModifications: boolean;
    bulkCodeGeneration: boolean;
    gitCommitSignature: boolean;
    consistentSource: boolean;
  };
  confidence: BlindApprovalConfidence;
  filesAffected: string[]; // file paths
  alertShown: boolean;
  alertShownAt?: number;
  metadata?: Record<string, any>;
}

/**
 * File review status tracking
 */
export interface FileReviewStatus {
  filePath: string;
  date: string; // YYYY-MM-DD
  tool: AITool;
  reviewQuality: ReviewQuality;
  reviewScore: number; // 0-100
  isReviewed: boolean;
  linesGenerated: number; // Total AI lines since file creation (cumulative, never resets)
  linesChanged?: number; // Total lines changed (added + |deleted|) for review scoring
  linesSinceReview?: number; // AI lines added since last review (resets to 0 when marked as reviewed)
  linesAdded?: number; // Lines added since last review
  linesRemoved?: number; // Lines removed since last review
  charactersCount: number;
  agentSessionId?: string;
  isAgentGenerated: boolean;
  wasFileOpen: boolean;
  firstGeneratedAt: number;
  lastReviewedAt?: number;
  totalReviewTime: number; // milliseconds
  language?: string;
  modificationCount: number;

  // Post-agent review tracking
  totalTimeInFocus: number; // milliseconds
  scrollEventCount: number;
  cursorMovementCount: number;
  editsMade: boolean;
  lastOpenedAt?: number;
  reviewSessionsCount: number;
  reviewedInTerminal: boolean; // TRUE if reviewed in terminal (CLI workflow)
}

// ==================== File Tree Types ====================

/**
 * File status in diff view
 */
export enum FileChangeStatus {
  Added = 'added',
  Modified = 'modified',
  Deleted = 'deleted',
  Unchanged = 'unchanged'
}

/**
 * File tree node for hierarchical display
 */
export interface FileTreeNode {
  /** Display name (file or folder name) */
  name: string;

  /** Full path from workspace root */
  path: string;

  /** Node type */
  type: 'file' | 'directory';

  /** Child nodes (only for directories) */
  children: FileTreeNode[];

  /** File data (only for file nodes) */
  file?: FileReviewStatus;

  /** Aggregated statistics for this node and all children */
  stats: {
    filesChanged: number;
    filesReviewed: number;
    linesAdded: number;
    linesRemoved: number;
  };

  /** Whether directory is expanded in UI */
  isExpanded: boolean;

  /** Nesting depth (0 = root) */
  depth: number;

  /** File change status (for file nodes) */
  status?: FileChangeStatus;
}

/**
 * Diff statistics for file changes summary
 */
export interface DiffStatistics {
  totalFiles: number;
  totalAdditions: number;
  totalDeletions: number;
  totalChanges: number;
  filesAdded: number;
  filesModified: number;
  filesDeleted: number;
  reviewedFiles: number;
  unreviewedFiles: number;
  reviewProgress: number; // 0-100 percentage
}

/**
 * Change bar visualization data
 */
export interface ChangeBarData {
  /** Percentage width for additions (0-100) */
  additionsWidth: number;

  /** Percentage width for deletions (0-100) */
  deletionsWidth: number;

  /** Total changes for display */
  totalChanges: number;

  /** Whether to show the bar (false if no changes) */
  showBar: boolean;
}

/**
 * File review session - tracks individual review sessions for a file
 */
export interface FileReviewSession {
  filePath: string;
  tool: AITool; // Which AI tool generated this file
  agentSessionId: string;
  generatedAt: number;
  initialReviewQuality: ReviewQuality;
  linesGenerated: number;

  // Post-review tracking
  firstOpenedAt?: number;
  lastOpenedAt?: number;
  totalTimeInFocus: number; // milliseconds
  scrollEventCount: number;
  cursorMovementCount: number;
  editsMade: boolean;

  // Calculated
  currentReviewQuality: ReviewQuality;
  currentReviewScore: number; // 0-100
  wasReviewed: boolean;
}

/**
 * User configuration
 */
export interface UserConfig {
  experienceLevel: DeveloperLevel;
  blindApprovalThreshold: number; // milliseconds
  alertFrequency: AlertFrequency;
  enableGamification: boolean;
  anonymizePaths: boolean;
  trackedTools: {
    copilot: boolean;
    cursor: boolean;
    claudeCode: boolean;
  };
  customThresholds?: {
    aiPercentageMax?: number;
    acceptanceRateMin?: number;
    reviewTimeMin?: number;
  };
  onboardingCompleted: boolean;
}

/**
 * Achievement definition
 */
export interface Achievement {
  id: string;
  title: string;
  description: string;
  category: 'review' | 'balance' | 'consistency' | 'learning';
  icon: string;
  requirement: {
    type: 'count' | 'percentage' | 'streak' | 'threshold';
    metric: string;
    target: number;
    timeframe?: 'day' | 'week' | 'month' | 'all-time';
  };
  unlocked: boolean;
  unlockedAt?: number;
  progress?: number;
}

/**
 * User progression data
 */
export interface UserProgression {
  level: number;
  currentXP: number;
  nextLevelXP: number;
  totalEvents: number;
  achievements: Achievement[];
  unlockedAchievements: number;
  totalAchievements: number;
}

/**
 * Alert data
 */
export interface Alert {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  timestamp: number;
  actions?: AlertAction[];
  autoClose?: number; // seconds
  severity?: 'low' | 'medium' | 'high';
  metadata?: Record<string, any>;
}

/**
 * Alert action button
 */
export interface AlertAction {
  label: string;
  action: 'dismiss' | 'snooze' | 'learn-more' | 'open-dashboard' | 'open-settings' | 'review-files' | 'mark-reviewed' | 'learn-ownership';
}

/**
 * Snooze state
 */
export interface SnoozeState {
  snoozed: boolean;
  snoozeUntil?: number;
  snoozeReason?: string;
}

/**
 * Alert history for rate limiting
 */
export interface AlertHistory {
  alertType: AlertType;
  lastShown: number;
  count: number;
}

/**
 * Threshold configuration by developer level
 */
export interface ThresholdConfig {
  level: DeveloperLevel;
  blindApprovalTime: number; // milliseconds
  maxAIPercentage: number;
  minReviewTime: number; // milliseconds
  streakThreshold: number; // number of consecutive blind approvals
}

/**
 * Skill Development Health Status
 */
export enum SkillHealthStatus {
  Excellent = 'excellent',    // ⭐ Green
  Good = 'good',              // ⚖️ Yellow
  NeedsAttention = 'needs-attention' // ⚠️ Red
}

/**
 * Metric Scope - clarifies data timeframe
 */
export enum MetricScope {
  Today = 'today',
  ThisWeek = 'this-week',
  ThisMonth = 'this-month',
  AllTime = 'all-time'
}

/**
 * Skill Health Metric - Overall indicator of skill development
 */
export interface SkillHealthMetric {
  status: SkillHealthStatus;
  score: number; // 0-100
  aiBalanceScore: number; // 0-100
  reviewQualityScore: number; // 0-100
  consistencyScore: number; // 0-100
  trend: 'improving' | 'stable' | 'declining';
  daysWithActivity: number; // out of 7 days
  recommendation?: string;
}

/**
 * Core Dashboard Metrics (new simplified structure)
 */
export interface CoreDashboardMetrics {
  // Core Metric 1: Code Authorship Balance
  authorship: {
    aiPercentage: number;
    manualPercentage: number;
    aiLines: number;
    manualLines: number;
    status: 'good' | 'warning' | 'over-threshold';
    target: number; // Based on developer level
  };

  // Core Metric 2: Code Ownership Score
  ownership: {
    score: number; // 0-100
    category: 'thorough' | 'light' | 'rushed' | 'none';
    unreviewedPercentage: number;
    unreviewedLines: number;
    filesNeedingReview: number;
  };

  // Core Metric 3: Skill Development Health
  skillHealth: SkillHealthMetric;
}

/**
 * Statistics for dashboard display
 */
export interface DashboardStats {
  today: DailyMetrics;
  last7Days: DailyMetrics[];
  trends: {
    aiPercentage: 'increasing' | 'decreasing' | 'stable';
    reviewTime: 'increasing' | 'decreasing' | 'stable';
    blindApprovals: 'increasing' | 'decreasing' | 'stable';
  };
  toolBreakdown: ToolMetrics[];
  achievements: Achievement[];
  progression: UserProgression;
  // NEW: Core metrics for improved UX
  coreMetrics?: CoreDashboardMetrics;
}

/**
 * Export data format
 */
export interface ExportData {
  exportDate: string;
  dateRange: {
    start: string;
    end: string;
  };
  metrics: DailyMetrics[];
  summary: {
    totalEvents: number;
    averageAIPercentage: number;
    averageReviewTime: number;
    totalBlindApprovals: number;
  };
}

// ==================== Database Schemas ====================

/**
 * Events table schema
 */
export interface EventRecord {
  id: number;
  timestamp: number;
  tool: string;
  event_type: string;
  lines_of_code: number | null;
  lines_removed: number | null; // Lines removed (positive value)
  lines_changed: number | null; // Total lines changed (added + |deleted|) for review scoring
  characters_count: number | null;
  acceptance_time_delta: number | null;
  file_path: string | null;
  language: string | null;
  session_id: string | null;
  metadata: string | null; // JSON string
  review_quality: string | null;
  review_quality_score: number | null;
  is_reviewed: number | null;
  is_agent_mode: number | null;
  agent_session_id: string | null;
  // Phase 2: Unified source tracking
  source: string | null; // 'ai' or 'manual'
  detection_method: string | null; // How the event was detected
  confidence: string | null; // 'high', 'medium', or 'low'
}

/**
 * Daily metrics table schema
 */
export interface DailyMetricsRecord {
  date: string;
  total_events: number;
  total_ai_suggestions: number;
  total_ai_lines: number;
  total_manual_lines: number;
  ai_percentage: number;
  average_review_time: number;
  session_count: number;
  review_quality_score: number | null;
  unreviewed_lines: number | null;
  unreviewed_percentage: number | null;
  agent_session_count: number | null;
  average_file_review_time: number | null;
  reviewed_files_count: number | null;
}

/**
 * Tool metrics table schema
 */
export interface ToolMetricsRecord {
  date: string;
  tool: string;
  suggestion_count: number;
  accepted_count: number;
  rejected_count: number;
  lines_generated: number;
  average_review_time: number;
}

/**
 * Sessions table schema
 */
export interface SessionRecord {
  id: string;
  start_time: number;
  end_time: number | null;
  duration: number | null;
  event_count: number;
  ai_lines_generated: number;
  manual_lines_written: number;
  tools_used: string; // JSON array string
}

/**
 * Achievements table schema
 */
export interface AchievementRecord {
  id: string;
  unlocked: number; // 0 or 1 (boolean)
  unlocked_at: number | null;
  progress: number;
}

/**
 * Config table schema
 */
export interface ConfigRecord {
  key: string;
  value: string; // JSON string
}

/**
 * Snooze state table schema
 */
export interface SnoozeStateRecord {
  snoozed: number; // 0 or 1 (boolean)
  snooze_until: number | null;
  snooze_reason: string | null;
}

/**
 * Alert history table schema
 */
export interface AlertHistoryRecord {
  alert_type: string;
  last_shown: number;
  count: number;
}

/**
 * Agent sessions table schema
 */
export interface AgentSessionRecord {
  id: string;
  tool: string;
  start_time: number;
  end_time: number | null;
  duration: number | null;
  file_count: number;
  total_lines: number;
  total_characters: number;
  was_reviewed: number; // 0 or 1
  review_quality: string | null;
  review_score: number | null;
  review_time: number | null;
  detection_signals: string; // JSON
  confidence: string;
  files_affected: string; // JSON array
  alert_shown: number; // 0 or 1
  alert_shown_at: number | null;
  metadata: string | null; // JSON
  created_at: number;
}

/**
 * File review status table schema
 */
export interface FileReviewStatusRecord {
  id: number;
  file_path: string;
  date: string;
  tool: string;
  review_quality: string;
  review_score: number;
  is_reviewed: number; // 0 or 1
  lines_generated: number;
  lines_changed: number; // Total lines changed (added + |deleted|) for review scoring
  lines_since_review: number; // AI lines added since last review (resets to 0 when marked as reviewed)
  lines_added: number; // Lines added since last review
  lines_removed: number; // Lines removed since last review
  characters_count: number;
  agent_session_id: string | null;
  is_agent_generated: number; // 0 or 1
  was_file_open: number; // 0 or 1
  first_generated_at: number;
  last_reviewed_at: number | null;
  total_review_time: number;
  language: string | null;
  modification_count: number;
  total_time_in_focus: number;
  scroll_event_count: number;
  cursor_movement_count: number;
  edits_made: number; // 0 or 1
  last_opened_at: number | null;
  review_sessions_count: number;
  reviewed_in_terminal: number; // 0 or 1
  review_method: string | null; // 'manual' or 'automatic'
  created_at: number;
  updated_at: number;
}

// ==================== Tracker Interfaces ====================

/**
 * Base tracker interface that most of AI trackers must implement
 */
export interface ITracker {
  readonly tool: AITool;
  initialize(): Promise<void>;
  dispose(): void;
  isActive(): boolean;
}

/**
 * Metrics collector event emitter interface
 */
export interface IMetricsCollector {
  recordEvent(event: TrackingEvent): Promise<void>;
  getPendingSuggestion(id: string): PendingSuggestion | undefined;
  getDailyMetrics(date: string): Promise<DailyMetrics | null>;
  getCurrentSession(): CodingSession | null;
}

/**
 * Database manager interface
 */
export interface IDatabaseManager {
  initialize(): Promise<void>;
  sync(): void; // Sync/flush database to disk
  close(): void;
  isUsingFallback(): boolean; // Always returns false (using node-sqlite3-wasm)
  insertEvent(event: TrackingEvent): Promise<number>;
  getEvents(startDate: string, endDate: string): Promise<TrackingEvent[]>;
  getDailyMetrics(date: string): Promise<DailyMetrics | null>;
  insertOrUpdateDailyMetrics(metrics: DailyMetrics): Promise<void>;
  getConfig(key: string): Promise<any>;
  setConfig(key: string, value: any): Promise<void>;
}

// ==================== Constants ====================

/**
 * Default threshold configurations by developer level
 *
 * Research-Based Philosophy (2025):
 * - Junior developers should use LESS AI to build fundamental skills
 * - Senior developers can use MORE AI as they have expertise to properly review/use it
 *
 * Key Research Findings:
 * - Junior devs become dependent on AI, losing fundamental skills (GitClear 2025)
 * - Junior employment fell 20% (2022-2025) as they lack core skills (Stanford)
 * - 54% of engineering leaders hiring fewer juniors due to AI (LeadDev 2025)
 * - Seniors can properly review AI code and avoid pitfalls (METR 2025)
 *
 * Sources:
 * - https://www.gitclear.com/ai_assistant_code_quality_2025_research
 * - https://codeconductor.ai/blog/future-of-junior-developers-ai/
 * - https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/
 * - https://www.itpro.com/software/development/junior-developer-ai-tools-coding-skills
 */
export const DEFAULT_THRESHOLDS: Record<DeveloperLevel, ThresholdConfig> = {
  [DeveloperLevel.Junior]: {
    level: DeveloperLevel.Junior,
    blindApprovalTime: 5000,      // Longer review time - need to understand code
    maxAIPercentage: 40,           // LOW: Build fundamentals first!
    minReviewTime: 5000,           // Must review code thoroughly
    streakThreshold: 3             // Alert quickly on blind approvals
  },
  [DeveloperLevel.Mid]: {
    level: DeveloperLevel.Mid,
    blindApprovalTime: 3000,       // Balanced review time
    maxAIPercentage: 60,           // MEDIUM: Have fundamentals, leverage AI
    minReviewTime: 3000,           // Reasonable review time
    streakThreshold: 4             // Moderate tolerance
  },
  [DeveloperLevel.Senior]: {
    level: DeveloperLevel.Senior,
    blindApprovalTime: 2000,       // Can review faster (have experience)
    maxAIPercentage: 75,           // HIGH: Have expertise to use AI properly
    minReviewTime: 2000,           // Efficient review with experience
    streakThreshold: 5             // More tolerance (know what to look for)
  }
};

/**
 * Alert rate limits by type (in milliseconds)
 */
export const ALERT_RATE_LIMITS: Record<AlertType, number> = {
  [AlertType.GentleNudge]: 5 * 60 * 1000, // 5 minutes
  [AlertType.EducationalMoment]: 30 * 60 * 1000, // 30 minutes
  [AlertType.StreakWarning]: 10 * 60 * 1000, // 10 minutes
  [AlertType.Achievement]: 0, // No rate limit
  [AlertType.ReviewReminder]: 15 * 60 * 1000, // 15 minutes - After agent session ends
  [AlertType.ExcessiveUnreviewed]: 30 * 60 * 1000, // 30 minutes - Daily unreviewed threshold exceeded
  [AlertType.OwnershipShift]: 60 * 60 * 1000 // 1 hour - Multi-day pattern of unreviewed code
};

/**
 * XP thresholds for leveling up
 */
export const XP_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2000, 3000, 5000, 10000];

/**
 * Suggestion expiry time (30 seconds)
 */
export const SUGGESTION_EXPIRY_MS = 30 * 1000;

/**
 * Session idle timeout (5 minutes)
 */
export const SESSION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Debounce time for event processing (500ms)
 */
export const EVENT_DEBOUNCE_MS = 500;
