/**
 * DatabaseManager
 * Manages SQLite database connections, schema, and low-level operations using sql.js
 * Now supports workspace-specific databases for project isolation
 */

import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import initSqlJs from 'sql.js';

type SqlJsDatabase = any;

import {
  TrackingEvent,
  DailyMetrics,
  ToolMetrics,
  CodingSession,
  Achievement,
  SnoozeState,
  AlertHistory,
  AlertType,
  IDatabaseManager,
  EventRecord,
  DailyMetricsRecord,
  ToolMetricsRecord,
  SessionRecord,
  AchievementRecord,
  ConfigRecord,
  SnoozeStateRecord,
  AlertHistoryRecord,
  AITool,
  EventType,
  ReviewQuality,
  AgentSession,
  AgentSessionRecord,
  FileReviewStatus,
  FileReviewStatusRecord,
  CodeSource
} from '../types';
import { safeJsonParse } from '../utils/SecurityUtils';

export class DatabaseManager implements IDatabaseManager {
  private db: SqlJsDatabase | null = null;
  private readonly dbPath: string;
  private readonly workspacePath: string | null;
  private readonly workspaceHash: string;
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private operationCount = 0;
  private readonly AUTO_SAVE_INTERVAL_MS = 30000; // 30 seconds
  private readonly AUTO_SAVE_OPERATION_COUNT = 10; // Every 10 operations

  /**
   * Create a new DatabaseManager
   * @param storagePath Base storage directory (~/.codepause)
   * @param workspacePath Optional workspace path for project-specific DB
   */
  constructor(storagePath: string, workspacePath?: string) {
    // SECURITY: Validate and normalize workspace path
    if (workspacePath) {
      // Resolve to absolute path
      const resolved = path.resolve(workspacePath);

      // Check for null bytes (path traversal attack)
      if (resolved.includes('\0')) {
        throw new Error('Invalid workspace path: contains null byte');
      }

      // Validate path length (prevent DoS)
      if (resolved.length > 500) {
        throw new Error('Workspace path too long');
      }

      this.workspacePath = resolved;
    } else {
      this.workspacePath = null;
    }

    this.workspaceHash = this.generateWorkspaceHash(this.workspacePath || undefined);

    // Use workspace-specific path if workspace is provided
    if (this.workspacePath) {
      const workspaceDir = path.join(storagePath, 'projects', this.workspaceHash);
      this.dbPath = path.join(workspaceDir, 'codepause.db');

      // SECURITY: Verify final path is within storagePath
      const normalizedDbPath = path.resolve(this.dbPath);
      const normalizedStoragePath = path.resolve(storagePath);
      if (!normalizedDbPath.startsWith(normalizedStoragePath)) {
        throw new Error('Database path outside storage directory');
      }
    } else {
      // Fallback to global DB for no-workspace scenarios (single files)
      this.dbPath = path.join(storagePath, 'global.db');
    }
  }

  /**
   * Generate a stable hash for the workspace path
   */
  private generateWorkspaceHash(workspacePath?: string): string {
    if (!workspacePath) {
      return 'global';
    }

    // Create a short, readable hash of the workspace path
    const hash = crypto.createHash('sha256')
      .update(workspacePath)
      .digest('hex')
      .substring(0, 16);

    // Also include a readable folder name for easy identification
    const folderName = path.basename(workspacePath)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .substring(0, 32);

    return `${folderName}-${hash}`;
  }

  /**
   * Get the workspace path for this database
   */
  getWorkspacePath(): string | null {
    return this.workspacePath;
  }

  /**
   * Get the workspace identifier (hash)
   */
  getWorkspaceHash(): string {
    return this.workspaceHash;
  }

  async initialize(): Promise<void> {
    const dirname = path.dirname(this.dbPath);
    if (!fs.existsSync(dirname)) {
      fs.mkdirSync(dirname, { recursive: true });
    }

    const SQL = await initSqlJs({
      locateFile: (file: string) => {
        const wasmPath = path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', file);
        if (fs.existsSync(wasmPath)) {
          return wasmPath;
        }
        return `node_modules/sql.js/dist/${file}`;
      }
    });

    try {
      if (fs.existsSync(this.dbPath)) {
        const buffer = fs.readFileSync(this.dbPath);
        this.db = new SQL.Database(buffer);
      } else {
        this.db = new SQL.Database();
      }
    } catch (error) {
      console.error('[CodePause] Database initialization failed:', error);
      throw new Error(`Failed to initialize database: ${error instanceof Error ? error.message : String(error)}`);
    }

    this.createTables();
    this.createIndices();
    this.runMigrations();
    this.startAutoSave();
  }

  /**
   * Run database migrations (add new columns, update schema, etc.)
   */
  private runMigrations(): void {
    // Migration: Add reviewed_in_terminal column to track terminal reviews separately
    this.safeAddColumn('file_review_status', 'reviewed_in_terminal', 'INTEGER NOT NULL DEFAULT 0');

    // Phase 2 Migration: Add unified source tracking (AI vs Manual)
    // Replaces tool-specific tracking with unified detection system
    this.safeAddColumn('events', 'source', 'TEXT'); // 'ai' or 'manual' (nullable for backward compatibility)
    this.safeAddColumn('events', 'detection_method', 'TEXT'); // How the event was detected
    this.safeAddColumn('events', 'confidence', 'TEXT'); // Detection confidence level ('high', 'medium', 'low')

    // Migration: Add lines_changed column for accurate review scoring
    // Tracks total lines changed (added + deleted) for review time calculation
    // Unlike lines_of_code which only tracks additions for metrics
    this.safeAddColumn('events', 'lines_changed', 'INTEGER'); // Total changes for review scoring

    // Migration: Add lines_changed to file_review_status for review scoring
    // This tracks total changes (added + |deleted|) for calculating expected review time
    this.safeAddColumn('file_review_status', 'lines_changed', 'INTEGER DEFAULT 0');

    // Migration: Add review_method column to track manual vs automatic reviews
    // 'manual' = user clicked "Mark as Reviewed" button
    // 'automatic' = system detected proper review via file viewing, scrolling, editing
    this.safeAddColumn('file_review_status', 'review_method', 'TEXT DEFAULT "manual"');

    // Add lines_since_review column to track only new lines since last review
    // lines_generated = total AI lines since file creation (cumulative, never resets)
    // lines_since_review = AI lines added since last review (resets to 0 when marked as reviewed)
    this.safeAddColumn('file_review_status', 'lines_since_review', 'INTEGER DEFAULT 0');

    // Migration: Add lines_removed column to track line deletions
    // This allows proper tracking of AI deletions for code review
    this.safeAddColumn('events', 'lines_removed', 'INTEGER DEFAULT 0');

    // Migration: Add lines_added and lines_removed to file_review_status
    // Tracks separate addition and removal counts for better transparency
    this.safeAddColumn('file_review_status', 'lines_added', 'INTEGER DEFAULT 0');
    this.safeAddColumn('file_review_status', 'lines_removed', 'INTEGER DEFAULT 0');
  }

  private startAutoSave(): void {
    this.autoSaveInterval = setInterval(() => {
      this.sync();
    }, this.AUTO_SAVE_INTERVAL_MS);
  }

  sync(): void {
    if (!this.db) {return;}

    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
      this.operationCount = 0;
    } catch (error) {
      console.error('[CodePause] Failed to sync database:', error);
    }
  }

  private incrementOperations(): void {
    this.operationCount++;
    if (this.operationCount >= this.AUTO_SAVE_OPERATION_COUNT) {
      this.sync();
    }
  }

  isUsingFallback(): boolean {
    return true;
  }

  close(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }

    if (this.db) {
      this.sync();
      this.db.close();
      this.db = null;
    }
  }

  /**
   * SECURITY: Validate SQL identifier to prevent SQL injection
   * Only allows alphanumeric characters and underscores
   */
  private validateSqlIdentifier(identifier: string, context: string): void {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
      throw new Error(`Invalid SQL identifier for ${context}: ${identifier}`);
    }
  }

  /**
   * SECURITY: Validate SQL type to prevent SQL injection
   * Only allows known safe SQL types
   */
  private validateSqlType(type: string): void {
    const allowedTypes = ['TEXT', 'INTEGER', 'REAL', 'BLOB', 'NUMERIC', 'BOOLEAN', 'DATE', 'DATETIME'];

    // Extract base type by removing constraints (DEFAULT, NOT NULL, etc.)
    // Split on space and take first token, then split on ( for types like VARCHAR(255)
    const baseType = type.trim().split(/\s+/)[0].toUpperCase().split('(')[0];

    if (!allowedTypes.includes(baseType) && !type.match(/^(TEXT|INTEGER|VARCHAR)\(\d+\)/i)) {
      throw new Error(`Invalid SQL type: ${type}`);
    }
  }

  /**
   * Safely add a column to a table if it doesn't already exist
   * SECURITY: Uses whitelist validation to prevent SQL injection
   */
  private safeAddColumn(table: string, column: string, type: string): void {
    if (!this.db) {return;}

    try {
      // SECURITY: Validate all identifiers before using in SQL
      this.validateSqlIdentifier(table, 'table name');
      this.validateSqlIdentifier(column, 'column name');
      this.validateSqlType(type);

      // Check if column exists by querying table info (now safe after validation)
      const stmt = this.db.prepare(`PRAGMA table_info(${table})`);
      const columns: string[] = [];

      while (stmt.step()) {
        const row = stmt.getAsObject() as any;
        columns.push(row.name as string);
      }
      stmt.free();

      // Add column if it doesn't exist (now safe after validation)
      if (!columns.includes(column)) {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      }
    } catch (error) {
      // Column might already exist - ignore
    }
  }

  private createTables(): void {
    if (!this.db) {throw new Error('Database not initialized');}

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        tool TEXT NOT NULL,
        event_type TEXT NOT NULL,
        lines_of_code INTEGER,
        characters_count INTEGER,
        acceptance_time_delta INTEGER,
        file_path TEXT,
        language TEXT,
        session_id TEXT,
        metadata TEXT,
        review_quality TEXT,
        review_quality_score INTEGER,
        is_reviewed INTEGER DEFAULT 0,
        is_agent_mode INTEGER DEFAULT 0,
        agent_session_id TEXT,
        source TEXT,
        detection_method TEXT,
        confidence TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daily_metrics (
        date TEXT PRIMARY KEY,
        total_events INTEGER NOT NULL DEFAULT 0,
        total_ai_suggestions INTEGER NOT NULL DEFAULT 0,
        total_ai_lines INTEGER NOT NULL DEFAULT 0,
        total_manual_lines INTEGER NOT NULL DEFAULT 0,
        ai_percentage REAL NOT NULL DEFAULT 0,
        average_review_time REAL NOT NULL DEFAULT 0,
        session_count INTEGER NOT NULL DEFAULT 0,
        review_quality_score REAL NOT NULL DEFAULT 0,
        unreviewed_lines INTEGER NOT NULL DEFAULT 0,
        unreviewed_percentage REAL NOT NULL DEFAULT 0,
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tool_metrics (
        date TEXT NOT NULL,
        tool TEXT NOT NULL,
        suggestion_count INTEGER NOT NULL DEFAULT 0,
        accepted_count INTEGER NOT NULL DEFAULT 0,
        rejected_count INTEGER NOT NULL DEFAULT 0,
        lines_generated INTEGER NOT NULL DEFAULT 0,
        average_review_time REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (date, tool)
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        duration INTEGER,
        event_count INTEGER NOT NULL DEFAULT 0,
        ai_lines_generated INTEGER NOT NULL DEFAULT 0,
        manual_lines_written INTEGER NOT NULL DEFAULT 0,
        tools_used TEXT NOT NULL
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS achievements (
        id TEXT PRIMARY KEY,
        unlocked INTEGER NOT NULL DEFAULT 0,
        unlocked_at INTEGER,
        progress REAL NOT NULL DEFAULT 0
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS snooze_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        snoozed INTEGER NOT NULL DEFAULT 0,
        snooze_until INTEGER,
        snooze_reason TEXT
      )
    `);

    this.db.exec(`
      INSERT OR IGNORE INTO snooze_state (id, snoozed) VALUES (1, 0)
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS alert_history (
        alert_type TEXT PRIMARY KEY,
        last_shown INTEGER NOT NULL,
        count INTEGER NOT NULL DEFAULT 1
      )
    `);

    // New table: agent_sessions
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_sessions (
        id TEXT PRIMARY KEY,
        tool TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        duration INTEGER,
        file_count INTEGER NOT NULL DEFAULT 0,
        total_lines INTEGER NOT NULL DEFAULT 0,
        total_characters INTEGER NOT NULL DEFAULT 0,
        was_reviewed INTEGER NOT NULL DEFAULT 0,
        review_quality TEXT,
        review_score REAL,
        review_time INTEGER,
        detection_signals TEXT NOT NULL,
        confidence TEXT NOT NULL,
        files_affected TEXT NOT NULL,
        alert_shown INTEGER NOT NULL DEFAULT 0,
        alert_shown_at INTEGER,
        metadata TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // New table: file_review_status
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_review_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        date TEXT NOT NULL,
        tool TEXT NOT NULL,
        review_quality TEXT NOT NULL,
        review_score REAL NOT NULL DEFAULT 0,
        is_reviewed INTEGER NOT NULL DEFAULT 0,
        lines_generated INTEGER NOT NULL DEFAULT 0,
        characters_count INTEGER NOT NULL DEFAULT 0,
        agent_session_id TEXT,
        is_agent_generated INTEGER NOT NULL DEFAULT 0,
        was_file_open INTEGER NOT NULL DEFAULT 0,
        first_generated_at INTEGER NOT NULL,
        last_reviewed_at INTEGER,
        total_review_time INTEGER NOT NULL DEFAULT 0,
        language TEXT,
        modification_count INTEGER NOT NULL DEFAULT 0,
        total_time_in_focus INTEGER NOT NULL DEFAULT 0,
        scroll_event_count INTEGER NOT NULL DEFAULT 0,
        cursor_movement_count INTEGER NOT NULL DEFAULT 0,
        edits_made INTEGER NOT NULL DEFAULT 0,
        last_opened_at INTEGER,
        review_sessions_count INTEGER NOT NULL DEFAULT 0,
        reviewed_in_terminal INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        UNIQUE(file_path, date, tool)
      )
    `);

    // Migrate existing tables: Add new columns to events table
    this.safeAddColumn('events', 'review_quality', 'TEXT');
    this.safeAddColumn('events', 'review_quality_score', 'REAL');
    this.safeAddColumn('events', 'is_reviewed', 'INTEGER DEFAULT 0');
    this.safeAddColumn('events', 'is_agent_mode', 'INTEGER DEFAULT 0');
    this.safeAddColumn('events', 'agent_session_id', 'TEXT');

    // Migrate existing tables: Add new columns to daily_metrics table
    // Use NULL (not 0) for undefined values - 0 means "bad", NULL means "N/A"
    this.safeAddColumn('daily_metrics', 'review_quality_score', 'REAL');
    this.safeAddColumn('daily_metrics', 'unreviewed_lines', 'INTEGER');
    this.safeAddColumn('daily_metrics', 'unreviewed_percentage', 'REAL');
    this.safeAddColumn('daily_metrics', 'agent_session_count', 'INTEGER DEFAULT 0');
    this.safeAddColumn('daily_metrics', 'total_ai_suggestions', 'INTEGER DEFAULT 0');

    // Migration: Add file review time columns to daily_metrics
    this.safeAddColumn('daily_metrics', 'average_file_review_time', 'REAL');
    this.safeAddColumn('daily_metrics', 'reviewed_files_count', 'INTEGER');
  }

  private createIndices(): void {
    if (!this.db) {throw new Error('Database not initialized');}

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_tool ON events(tool);
      CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
      CREATE INDEX IF NOT EXISTS idx_events_agent_session ON events(agent_session_id);
      CREATE INDEX IF NOT EXISTS idx_tool_metrics_date ON tool_metrics(date);
      CREATE INDEX IF NOT EXISTS idx_agent_sessions_start_time ON agent_sessions(start_time);
      CREATE INDEX IF NOT EXISTS idx_agent_sessions_tool ON agent_sessions(tool);
      CREATE INDEX IF NOT EXISTS idx_agent_sessions_was_reviewed ON agent_sessions(was_reviewed);
      CREATE INDEX IF NOT EXISTS idx_file_review_status_file_path ON file_review_status(file_path);
      CREATE INDEX IF NOT EXISTS idx_file_review_status_date ON file_review_status(date);
      CREATE INDEX IF NOT EXISTS idx_file_review_status_is_reviewed ON file_review_status(is_reviewed);
      CREATE INDEX IF NOT EXISTS idx_file_review_status_agent_session ON file_review_status(agent_session_id);
    `);
  }

  async insertEvent(event: TrackingEvent): Promise<number> {
    if (!this.db) {throw new Error('Database not initialized');}

    const stmt = this.db.prepare(`
      INSERT INTO events (
        timestamp, tool, event_type, lines_of_code, lines_removed, characters_count,
        acceptance_time_delta, file_path, language, session_id, metadata,
        review_quality, review_quality_score, is_reviewed, is_agent_mode, agent_session_id,
        source, detection_method, confidence, lines_changed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.bind([
      event.timestamp,
      event.tool,
      event.eventType,
      event.linesOfCode ?? null,
      event.linesRemoved ?? null, // NEW: Lines removed
      event.charactersCount ?? null,
      event.acceptanceTimeDelta ?? null,
      event.filePath ?? null,
      event.language ?? null,
      event.sessionId ?? null,
      event.metadata ? JSON.stringify(event.metadata) : null,
      event.reviewQuality ?? null,
      event.reviewQualityScore ?? null,
      event.isReviewed ? 1 : 0,
      event.isAgentMode ? 1 : 0,
      event.agentSessionId ?? null,
      event.source ?? null, // NEW: Unified source tracking (ai/manual)
      event.detectionMethod ?? null, // NEW: Detection method metadata
      event.confidence ?? null, // NEW: Detection confidence level
      event.linesChanged ?? null // NEW: Total changes for review scoring
    ]);

    stmt.step();
    const lastId = this.db.exec('SELECT last_insert_rowid() as id')[0].values[0][0] as number;
    stmt.free();

    this.incrementOperations();
    return lastId;
  }

  async getEvents(startDate: string, endDate: string): Promise<TrackingEvent[]> {
    if (!this.db) {throw new Error('Database not initialized');}

    const startTimestamp = new Date(startDate).getTime();
    const endTimestamp = new Date(endDate).getTime() + 86400000;

    const stmt = this.db.prepare(`
      SELECT * FROM events
      WHERE timestamp >= ? AND timestamp < ?
      ORDER BY timestamp DESC
    `);

    stmt.bind([startTimestamp, endTimestamp]);

    const rows: EventRecord[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as EventRecord);
    }
    stmt.free();

    return rows.map(this.mapEventRecordToEvent);
  }

  async getSessionEvents(sessionId: string): Promise<TrackingEvent[]> {
    if (!this.db) {throw new Error('Database not initialized');}

    const stmt = this.db.prepare(`
      SELECT * FROM events
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `);

    stmt.bind([sessionId]);

    const rows: EventRecord[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as EventRecord);
    }
    stmt.free();

    return rows.map(this.mapEventRecordToEvent);
  }

  async getRecentEvents(limit: number): Promise<TrackingEvent[]> {
    if (!this.db) {throw new Error('Database not initialized');}

    const stmt = this.db.prepare(`
      SELECT * FROM events
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    stmt.bind([limit]);

    const rows: EventRecord[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as EventRecord);
    }
    stmt.free();

    return rows.map(this.mapEventRecordToEvent);
  }

  async getDailyMetrics(date: string): Promise<DailyMetrics | null> {
    if (!this.db) {throw new Error('Database not initialized');}

    const stmt = this.db.prepare(`
      SELECT * FROM daily_metrics WHERE date = ?
    `);

    stmt.bind([date]);

    let row: DailyMetricsRecord | undefined;
    if (stmt.step()) {
      row = stmt.getAsObject() as unknown as DailyMetricsRecord;
    }
    stmt.free();

    if (!row) {return null;}

   
    const toolBreakdown = await this.getToolMetrics(date);

    return this.mapDailyMetricsRecordToMetrics(row, toolBreakdown);
  }

  async getDailyMetricsRange(startDate: string, endDate: string): Promise<DailyMetrics[]> {
    if (!this.db) {throw new Error('Database not initialized');}

    const stmt = this.db.prepare(`
      SELECT * FROM daily_metrics
      WHERE date >= ? AND date <= ?
      ORDER BY date DESC
    `);

    stmt.bind([startDate, endDate]);

    const rows: DailyMetricsRecord[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as DailyMetricsRecord);
    }
    stmt.free();

    const metricsWithTools = await Promise.all(
      rows.map(async (row) => {
        const toolBreakdown = await this.getToolMetrics(row.date);
        return this.mapDailyMetricsRecordToMetrics(row, toolBreakdown);
      })
    );

    return metricsWithTools;
  }

  async insertOrUpdateDailyMetrics(metrics: DailyMetrics): Promise<void> {
    if (!this.db) {throw new Error('Database not initialized');}

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO daily_metrics (
        date, total_events, total_ai_suggestions, total_ai_lines, total_manual_lines,
        ai_percentage, average_review_time,
        session_count,
        review_quality_score, unreviewed_lines, unreviewed_percentage,
        average_file_review_time, reviewed_files_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run([
      metrics.date,
      metrics.totalEvents,
      metrics.totalAISuggestions,
      metrics.totalAILines,
      metrics.totalManualLines,
      metrics.aiPercentage,
      metrics.averageReviewTime,
      metrics.sessionCount,
      // Use null for undefined values (not 0!)
      metrics.reviewQualityScore !== undefined ? metrics.reviewQualityScore : null,
      metrics.unreviewedLines !== undefined ? metrics.unreviewedLines : null,
      metrics.unreviewedPercentage !== undefined ? metrics.unreviewedPercentage : null,
      metrics.averageFileReviewTime !== undefined ? metrics.averageFileReviewTime : null,
      metrics.reviewedFilesCount !== undefined ? metrics.reviewedFilesCount : null
    ]);

   
    for (const toolMetrics of Object.values(metrics.toolBreakdown)) {
      await this.insertOrUpdateToolMetrics(metrics.date, toolMetrics);
    }
  }

  async getToolMetrics(date: string): Promise<Record<AITool, ToolMetrics>> {
    if (!this.db) {throw new Error('Database not initialized');}

    const stmt = this.db.prepare(`
      SELECT * FROM tool_metrics WHERE date = ?
    `);

    stmt.bind([date]);

    const rows: ToolMetricsRecord[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as ToolMetricsRecord);
    }
    stmt.free();

    const breakdown: Record<string, ToolMetrics> = {};

    for (const row of rows) {
      breakdown[row.tool] = {
        tool: row.tool as AITool,
        suggestionCount: row.suggestion_count,
        acceptedCount: row.accepted_count,
        rejectedCount: row.rejected_count,
        linesGenerated: row.lines_generated,
        averageReviewTime: row.average_review_time
      };
    }

    return breakdown as Record<AITool, ToolMetrics>;
  }

  async insertOrUpdateToolMetrics(date: string, metrics: ToolMetrics): Promise<void> {
    if (!this.db) {throw new Error('Database not initialized');}

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tool_metrics (
        date, tool, suggestion_count, accepted_count, rejected_count,
        lines_generated, average_review_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run([
      date,
      metrics.tool,
      metrics.suggestionCount,
      metrics.acceptedCount,
      metrics.rejectedCount,
      metrics.linesGenerated,
      metrics.averageReviewTime
    ]);
  }

  async insertOrUpdateSession(session: CodingSession): Promise<void> {
    if (!this.db) {throw new Error('Database not initialized');}

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sessions (
        id, start_time, end_time, duration, event_count,
        ai_lines_generated, manual_lines_written, tools_used
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run([
      session.id,
      session.startTime,
      session.endTime ?? null,
      session.duration ?? null,
      session.eventCount,
      session.aiLinesGenerated,
      session.manualLinesWritten,
      JSON.stringify(session.toolsUsed)
    ]);
  }

  async getSession(sessionId: string): Promise<CodingSession | null> {
    if (!this.db) {throw new Error('Database not initialized');}

    const stmt = this.db.prepare(`
      SELECT * FROM sessions WHERE id = ?
    `);

    stmt.bind([sessionId]);

    let row: SessionRecord | undefined;
    if (stmt.step()) {
      row = stmt.getAsObject() as unknown as SessionRecord;
    }
    stmt.free();

    if (!row) {return null;}

    return {
      id: row.id,
      startTime: row.start_time,
      endTime: row.end_time ?? undefined,
      duration: row.duration ?? undefined,
      eventCount: row.event_count,
      aiLinesGenerated: row.ai_lines_generated,
      manualLinesWritten: row.manual_lines_written,
      // Security: Safe JSON parsing with fallback
      toolsUsed: safeJsonParse(row.tools_used, [])
    };
  }

  async getRecentSessions(limit: number): Promise<CodingSession[]> {
    if (!this.db) {throw new Error('Database not initialized');}

    const stmt = this.db.prepare(`
      SELECT * FROM sessions
      ORDER BY start_time DESC
      LIMIT ?
    `);

    stmt.bind([limit]);

    const rows: SessionRecord[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as SessionRecord);
    }
    stmt.free();

    return rows.map(row => ({
      id: row.id,
      startTime: row.start_time,
      endTime: row.end_time ?? undefined,
      duration: row.duration ?? undefined,
      eventCount: row.event_count,
      aiLinesGenerated: row.ai_lines_generated,
      manualLinesWritten: row.manual_lines_written,
      // Security: Safe JSON parsing with fallback
      toolsUsed: safeJsonParse(row.tools_used, [])
    }));
  }

  async getAllAchievements(): Promise<Achievement[]> {
    if (!this.db) {throw new Error('Database not initialized');}

    const stmt = this.db.prepare(`SELECT * FROM achievements`);

    const rows: AchievementRecord[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as AchievementRecord);
    }
    stmt.free();

    return rows.map(row => ({
      id: row.id,
      title: '',
      description: '',
      category: 'review' as const,
      icon: '',
      requirement: {
        type: 'count' as const,
        metric: '',
        target: 0
      },
      unlocked: row.unlocked === 1,
      unlockedAt: row.unlocked_at ?? undefined,
      progress: row.progress
    }));
  }

  async updateAchievement(achievementId: string, unlocked: boolean, progress: number): Promise<void> {
    if (!this.db) {throw new Error('Database not initialized');}

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO achievements (id, unlocked, unlocked_at, progress)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run([
      achievementId,
      unlocked ? 1 : 0,
      unlocked ? Date.now() : null,
      progress
    ]);
  }

  async getConfig(key: string): Promise<unknown> {
    if (!this.db) {throw new Error('Database not initialized');}

    const stmt = this.db.prepare(`SELECT value FROM config WHERE key = ?`);

    stmt.bind([key]);

    let row: ConfigRecord | undefined;
    if (stmt.step()) {
      row = stmt.getAsObject() as unknown as ConfigRecord;
    }
    stmt.free();

    if (!row) {return null;}

    // Security: Safe JSON parsing with fallback to raw value
    const parsed = safeJsonParse(row.value, null);
    return parsed !== null ? parsed : row.value;
  }

  async setConfig(key: string, value: unknown): Promise<void> {
    if (!this.db) {throw new Error('Database not initialized');}

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO config (key, value)
      VALUES (?, ?)
    `);

    const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);
    stmt.run([key, jsonValue]);
  }

  async getSnoozeState(): Promise<SnoozeState> {
    if (!this.db) {throw new Error('Database not initialized');}

    const stmt = this.db.prepare(`SELECT * FROM snooze_state WHERE id = 1`);

    let row: SnoozeStateRecord | undefined;
    if (stmt.step()) {
      row = stmt.getAsObject() as unknown as SnoozeStateRecord;
    }
    stmt.free();

    if (!row) {
      return { snoozed: false };
    }

    return {
      snoozed: row.snoozed === 1,
      snoozeUntil: row.snooze_until ?? undefined,
      snoozeReason: row.snooze_reason ?? undefined
    };
  }

  async setSnoozeState(state: SnoozeState): Promise<void> {
    if (!this.db) {throw new Error('Database not initialized');}

    const stmt = this.db.prepare(`
      UPDATE snooze_state
      SET snoozed = ?, snooze_until = ?, snooze_reason = ?
      WHERE id = 1
    `);

    stmt.run([
      state.snoozed ? 1 : 0,
      state.snoozeUntil ?? null,
      state.snoozeReason ?? null
    ]);
  }

  async getAlertHistory(alertType: string): Promise<AlertHistory | null> {
    if (!this.db) {throw new Error('Database not initialized');}

    const stmt = this.db.prepare(`
      SELECT * FROM alert_history WHERE alert_type = ?
    `);

    stmt.bind([alertType]);

    let row: AlertHistoryRecord | undefined;
    if (stmt.step()) {
      row = stmt.getAsObject() as unknown as AlertHistoryRecord;
    }
    stmt.free();

    if (!row) {return null;}

    return {
      alertType: row.alert_type as AlertType,
      lastShown: row.last_shown,
      count: row.count
    };
  }

  async updateAlertHistory(alertType: string, timestamp: number): Promise<void> {
    if (!this.db) {throw new Error('Database not initialized');}

    const stmt = this.db.prepare(`
      INSERT INTO alert_history (alert_type, last_shown, count)
      VALUES (?, ?, 1)
      ON CONFLICT(alert_type) DO UPDATE SET
        last_shown = ?,
        count = count + 1
    `);

    stmt.run([alertType, timestamp, timestamp]);
  }

  private mapEventRecordToEvent(record: EventRecord): TrackingEvent {
    return {
      id: record.id,
      timestamp: record.timestamp,
      tool: record.tool as AITool,
      eventType: record.event_type as EventType,
      linesOfCode: record.lines_of_code ?? undefined,
      linesRemoved: record.lines_removed ?? undefined,
      linesChanged: record.lines_changed ?? undefined,
      charactersCount: record.characters_count ?? undefined,
      acceptanceTimeDelta: record.acceptance_time_delta ?? undefined,
      filePath: record.file_path ?? undefined,
      language: record.language ?? undefined,
      sessionId: record.session_id ?? undefined,
      // Security: Safe JSON parsing with error handling
      metadata: safeJsonParse(record.metadata, undefined),
      reviewQuality: record.review_quality as ReviewQuality | undefined,
      reviewQualityScore: record.review_quality_score ?? undefined,
      isReviewed: record.is_reviewed === 1,
      isAgentMode: record.is_agent_mode === 1,
      agentSessionId: record.agent_session_id ?? undefined,
      // NEW: Phase 2 unified source tracking
      source: record.source ? (record.source as CodeSource) : undefined,
      detectionMethod: record.detection_method ?? undefined,
      confidence: record.confidence as 'high' | 'medium' | 'low' | undefined
    };
  }

  private mapDailyMetricsRecordToMetrics(
    record: DailyMetricsRecord,
    toolBreakdown: Record<AITool, ToolMetrics>
  ): DailyMetrics {
    return {
      date: record.date,
      totalEvents: record.total_events,
      totalAISuggestions: record.total_ai_suggestions ?? 0,
      totalAILines: record.total_ai_lines,
      totalManualLines: record.total_manual_lines,
      aiPercentage: record.ai_percentage,
      averageReviewTime: record.average_review_time,
      sessionCount: record.session_count,
      toolBreakdown,
      reviewQualityScore: record.review_quality_score ?? undefined,
      unreviewedLines: record.unreviewed_lines ?? undefined,
      unreviewedPercentage: record.unreviewed_percentage ?? undefined,
      agentSessionCount: record.agent_session_count ?? undefined,
      averageFileReviewTime: record.average_file_review_time ?? undefined,
      reviewedFilesCount: record.reviewed_files_count ?? undefined
    };
  }

  async getStats(): Promise<{
    totalEvents: number;
    totalSessions: number;
    databaseSize: number;
  }> {
    if (!this.db) {throw new Error('Database not initialized');}

   
    const eventsStmt = this.db.prepare('SELECT COUNT(*) as count FROM events');
    let eventsCount = { count: 0 };
    if (eventsStmt.step()) {
      eventsCount = eventsStmt.getAsObject() as { count: number };
    }
    eventsStmt.free();

   
    const sessionsStmt = this.db.prepare('SELECT COUNT(*) as count FROM sessions');
    let sessionsCount = { count: 0 };
    if (sessionsStmt.step()) {
      sessionsCount = sessionsStmt.getAsObject() as { count: number };
    }
    sessionsStmt.free();

   
    const fs = require('fs');
    let dbSize = 0;
    try {
      const stats = fs.statSync(this.dbPath);
      dbSize = stats.size;
    } catch {
      // Ignore errors getting file size
    }

    return {
      totalEvents: eventsCount.count,
      totalSessions: sessionsCount.count,
      databaseSize: dbSize
    };
  }

  /**
   * Count total events in database
   * Used by DataRetentionManager
   */
  async countEvents(): Promise<number> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM events');
    let result = { count: 0 };
    if (stmt.step()) {
      result = stmt.getAsObject() as { count: number };
    }
    stmt.free();

    return result.count;
  }

  /**
   * Delete events older than a specific timestamp
   * @param timestamp Unix timestamp in milliseconds
   * @returns Number of deleted records
   */
  async deleteEventsBefore(timestamp: number): Promise<number> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const stmt = this.db.prepare('DELETE FROM events WHERE timestamp < ?');
    stmt.bind([timestamp]);
    stmt.step();
    stmt.free();

    // Get count of deleted rows using changes() function
    const changesStmt = this.db.prepare('SELECT changes() as deleted');
    let deletedCount = { deleted: 0 };
    if (changesStmt.step()) {
      deletedCount = changesStmt.getAsObject() as { deleted: number };
    }
    changesStmt.free();

    // Save database after deletion
    this.incrementOperations();
    this.sync();

    return deletedCount.deleted;
  }

  /**
   * Get the oldest event in database
   */
  async getOldestEvent(): Promise<{ timestamp: number } | null> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const stmt = this.db.prepare('SELECT timestamp FROM events ORDER BY timestamp ASC LIMIT 1');
    let result: { timestamp: number } | null = null;

    if (stmt.step()) {
      const row = stmt.getAsObject() as { timestamp: number };
      result = { timestamp: row.timestamp };
    }
    stmt.free();

    return result;
  }

  /**
   * Get the newest event in database
   */
  async getNewestEvent(): Promise<{ timestamp: number } | null> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const stmt = this.db.prepare('SELECT timestamp FROM events ORDER BY timestamp DESC LIMIT 1');
    let result: { timestamp: number } | null = null;

    if (stmt.step()) {
      const row = stmt.getAsObject() as { timestamp: number };
      result = { timestamp: row.timestamp };
    }
    stmt.free();

    return result;
  }

  /**
   * Get events within a date range
   * @param startDate Unix timestamp in milliseconds
   * @param endDate Unix timestamp in milliseconds
   * @returns Array of tracking events
   */
  async getEventsByDateRange(startDate: number, endDate: number): Promise<TrackingEvent[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const stmt = this.db.prepare(`
      SELECT * FROM events
      WHERE timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp DESC
    `);
    stmt.bind([startDate, endDate]);

    const events: TrackingEvent[] = [];
    while (stmt.step()) {
      const record = stmt.getAsObject() as EventRecord;
      events.push(this.mapEventRecordToEvent(record));
    }
    stmt.free();

    return events;
  }

  // ========== NEW: Agent Session CRUD Methods ==========

  async insertAgentSession(session: AgentSession): Promise<void> {
    if (!this.db) {throw new Error('Database not initialized');}

    const stmt = this.db.prepare(`
      INSERT INTO agent_sessions (
        id, tool, start_time, end_time, duration, file_count, total_lines, total_characters,
        was_reviewed, review_quality, review_score, review_time, detection_signals,
        confidence, files_affected, alert_shown, alert_shown_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.bind([
      session.id,
      session.tool,
      session.startTime,
      session.endTime ?? null,
      session.duration ?? null,
      session.fileCount,
      session.totalLines,
      session.totalCharacters,
      session.wasReviewed ? 1 : 0,
      session.reviewQuality ?? null,
      session.reviewScore ?? null,
      session.reviewTime ?? null,
      JSON.stringify(session.detectionSignals),
      session.confidence,
      JSON.stringify(session.filesAffected),
      session.alertShown ? 1 : 0,
      session.alertShownAt ?? null,
      session.metadata ? JSON.stringify(session.metadata) : null
    ]);

    stmt.step();
    stmt.free();
    this.incrementOperations();
  }

  async getAgentSession(sessionId: string): Promise<AgentSession | null> {
    if (!this.db) {throw new Error('Database not initialized');}

    const stmt = this.db.prepare('SELECT * FROM agent_sessions WHERE id = ?');
    stmt.bind([sessionId]);

    let session: AgentSession | null = null;
    if (stmt.step()) {
      const record = stmt.getAsObject() as unknown as AgentSessionRecord;
      session = this.mapAgentSessionRecordToSession(record);
    }

    stmt.free();
    return session;
  }

  async getRecentAgentSessions(limit: number = 10): Promise<AgentSession[]> {
    if (!this.db) {throw new Error('Database not initialized');}

    const stmt = this.db.prepare(`
      SELECT * FROM agent_sessions
      ORDER BY start_time DESC
      LIMIT ?
    `);
    stmt.bind([limit]);

    const sessions: AgentSession[] = [];
    while (stmt.step()) {
      const record = stmt.getAsObject() as unknown as AgentSessionRecord;
      sessions.push(this.mapAgentSessionRecordToSession(record));
    }

    stmt.free();
    return sessions;
  }

  private mapAgentSessionRecordToSession(record: AgentSessionRecord): AgentSession {
    return {
      id: record.id,
      tool: record.tool as AITool,
      startTime: record.start_time,
      endTime: record.end_time ?? undefined,
      duration: record.duration ?? undefined,
      fileCount: record.file_count,
      totalLines: record.total_lines,
      totalCharacters: record.total_characters,
      wasReviewed: record.was_reviewed === 1,
      reviewQuality: record.review_quality as ReviewQuality | undefined,
      reviewScore: record.review_score ?? undefined,
      reviewTime: record.review_time ?? undefined,
      detectionSignals: safeJsonParse(record.detection_signals, {
        rapidFileChanges: false,
        closedFileModifications: false,
        bulkCodeGeneration: false,
        gitCommitSignature: false,
        consistentSource: false
      }),
      confidence: record.confidence as any,
      filesAffected: safeJsonParse(record.files_affected, []),
      alertShown: record.alert_shown === 1,
      alertShownAt: record.alert_shown_at ?? undefined,
      metadata: safeJsonParse(record.metadata, undefined)
    };
  }

  // ========== NEW: File Review Status CRUD Methods ==========

  async insertOrUpdateFileReviewStatus(status: FileReviewStatus): Promise<void> {
    if (!this.db) {throw new Error('Database not initialized');}

    // Preserve manually marked as reviewed status
    // If the file is already marked as reviewed in the database, keep it that way
    // This prevents periodic aggregation from overwriting manual reviews
    //
    // IMPORTANT: sql.js returns arrays, not objects. Column indices:
    // 0: id, 1: file_path, 2: date, 3: tool, 4: review_quality, 5: review_score, 6: is_reviewed
    const rawRecord = this.db.prepare(`
      SELECT * FROM file_review_status
      WHERE file_path = ? AND date = ? AND tool = ?
    `).get([status.filePath, status.date, status.tool]);

    // sql.js returns an array, not an object with named properties
    const existingRecord = rawRecord as number[] | undefined;
    const existingIsReviewed = existingRecord?.[6]; // Index 6 = is_reviewed column
    const existingReviewScore = existingRecord?.[5]; // Index 5 = review_score column
    const existingReviewQuality = existingRecord?.[4]; // Index 4 = review_quality column
    // Index 9 = agent_session_id column (may be string or null in DB)
    const existingAgentSessionId = existingRecord?.[9] as string | null | undefined;

    // Check if this is the SAME agent session or a NEW one
    // If it's a new agent session, the file was modified again and needs re-review
    //
    // CRITICAL FIX: Only consider it a "new modification" if it's a different session
    // If it's the same agent session continuing work, preserve reviewed status
    const hasDifferentSession = existingAgentSessionId !== null &&
                                existingAgentSessionId !== undefined &&
                                status.agentSessionId !== undefined &&
                                status.agentSessionId !== existingAgentSessionId;

    const isNewModification = hasDifferentSession;

    // CRITICAL FIX: Separate preservation of is_reviewed vs review_score/quality
    //
    // For is_reviewed:
    // - If new modification: Set to false (file needs re-review)
    // - If same modification: Preserve existing reviewed status
    const wasManuallyReviewed = existingRecord && existingIsReviewed === 1;
    const shouldPreserveReviewedStatus = wasManuallyReviewed && !isNewModification;
    const finalIsReviewed = shouldPreserveReviewedStatus ? true : status.isReviewed;

    // Get existing review data
    // Index 14 = total_review_time in the original table schema
    const existingTotalReviewTime = existingRecord?.[14] || 0;

    // For review_score and review_quality:
    // - ALWAYS preserve if they exist (partial review data is valuable!)
    // - Even if new modification, the ALREADY REVIEWED portion still has value
    // - Only use status values if no existing values (or explicitly provided)
    const shouldPreserveReviewData = existingRecord && ((existingReviewScore ?? 0) > 0 || existingTotalReviewTime > 0);
    const finalReviewScore = shouldPreserveReviewData && existingReviewScore ? existingReviewScore : status.reviewScore;
    const finalReviewQuality = shouldPreserveReviewData && existingReviewQuality ? existingReviewQuality : status.reviewQuality;

    // Handle lines_since_review tracking
    // - MetricsCollector.ts already accumulates linesSinceReview before sending to database
    // - Database should just store the value as-is, NOT accumulate again (would cause double accumulation)
    // - If status.linesSinceReview is undefined (from periodic aggregation), preserve existing value
    // - If file is being marked as reviewed, reset lines_since_review to 0
    //
    // IMPORTANT: Column indices after migrations (in order of addition):
    // 0-22: original columns, 23: created_at, 24: updated_at, 25: reviewed_in_terminal,
    // 26: lines_changed, 27: review_method, 28: lines_since_review, 29: lines_added, 30: lines_removed
    const existingLinesSinceReview = existingRecord?.[28] || 0; // Index 28 = lines_since_review column
    const existingLinesAdded = existingRecord?.[29] || 0; // Index 29 = lines_added column
    const existingLinesRemoved = existingRecord?.[30] || 0; // Index 30 = lines_removed column
    let finalLinesSinceReview: number;

    // Check if linesSinceReview was explicitly provided (not undefined)
    // undefined = from periodic aggregation, preserve existing value
    // number = from actual event, use as-is (already accumulated by MetricsCollector)
    const isLinesSinceReviewProvided = status.linesSinceReview !== undefined;

    if (!finalIsReviewed) {
      // File is NOT reviewed
      if (isLinesSinceReviewProvided) {
        // From actual event - use value as-is (MetricsCollector already accumulated)
        // Event 1: receives 123, stores 123
        // Event 2: receives 216 (already 123+93), stores 216 (NOT 123+216)
        finalLinesSinceReview = status.linesSinceReview ?? 0;
      } else {
        // From periodic aggregation - preserve existing value
        finalLinesSinceReview = existingLinesSinceReview;
      }
    } else {
      // File is reviewed - reset to 0
      finalLinesSinceReview = 0;
    }

    // CRITICAL FIX: Preserve linesAdded and linesRemoved from existing record
    // if not explicitly provided in the status object.
    // This prevents periodic aggregation from resetting these values to 0.
    const isLinesAddedProvided = status.linesAdded !== undefined;
    const isLinesRemovedProvided = status.linesRemoved !== undefined;
    const finalLinesAdded = isLinesAddedProvided ? (status.linesAdded ?? 0) : existingLinesAdded;
    const finalLinesRemoved = isLinesRemovedProvided ? (status.linesRemoved ?? 0) : existingLinesRemoved;

    // CRITICAL FIX: Preserve total_review_time - ALWAYS preserve if exists
    // Preserves time already spent reviewing, even if file needs re-review after new modifications
    const finalTotalReviewTime = shouldPreserveReviewData && existingTotalReviewTime > 0
      ? existingTotalReviewTime
      : status.totalReviewTime;

    // Always update updated_at timestamp to NOW
    // Preserve created_at from existing record (or use firstGeneratedAt for new records)
    const now = Date.now();
    const createdAt = existingRecord?.[23] || status.firstGeneratedAt; // Index 23 = created_at

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO file_review_status (
        file_path, date, tool, review_quality, review_score, is_reviewed,
        lines_generated, lines_changed, lines_since_review, lines_added, lines_removed, characters_count, agent_session_id, is_agent_generated,
        was_file_open, first_generated_at, last_reviewed_at, total_review_time,
        language, modification_count, total_time_in_focus, scroll_event_count,
        cursor_movement_count, edits_made, last_opened_at, review_sessions_count, reviewed_in_terminal,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.bind([
      status.filePath,
      status.date,
      status.tool,
      finalReviewQuality,
      finalReviewScore,
      finalIsReviewed ? 1 : 0,
      status.linesGenerated,
      status.linesChanged ?? 0,
      finalLinesSinceReview,
      finalLinesAdded,
      finalLinesRemoved,
      status.charactersCount,
      status.agentSessionId ?? null,
      status.isAgentGenerated ? 1 : 0,
      status.wasFileOpen ? 1 : 0,
      status.firstGeneratedAt,
      status.lastReviewedAt ?? null,
      finalTotalReviewTime,
      status.language ?? null,
      status.modificationCount,
      status.totalTimeInFocus,
      status.scrollEventCount,
      status.cursorMovementCount,
      status.editsMade ? 1 : 0,
      status.lastOpenedAt ?? null,
      status.reviewSessionsCount,
      status.reviewedInTerminal ? 1 : 0,
      createdAt,
      now
    ]);

    stmt.step();
    stmt.free();
    this.incrementOperations();
  }

  async getUnreviewedFiles(date: string): Promise<FileReviewStatus[]> {
    if (!this.db) {throw new Error('Database not initialized');}

    const stmt = this.db.prepare(`
      SELECT * FROM file_review_status
      WHERE date = ? AND is_reviewed = 0
      ORDER BY first_generated_at DESC
    `);
    stmt.bind([date]);

    const files: FileReviewStatus[] = [];
    while (stmt.step()) {
      const record = stmt.getAsObject() as unknown as FileReviewStatusRecord;
      files.push(this.mapFileReviewStatusRecordToStatus(record));
    }

    stmt.free();
    return files;
  }

  async getAllFilesForDate(date: string): Promise<FileReviewStatus[]> {
    if (!this.db) {throw new Error('Database not initialized');}

    // AUTHORSHIP FIX: Get ALL files for a date (reviewed or not) for authorship calculation
    const stmt = this.db.prepare(`
      SELECT * FROM file_review_status
      WHERE date(first_generated_at / 1000, 'unixepoch') = ?
      ORDER BY first_generated_at DESC
    `);
    stmt.bind([date]);

    const files: FileReviewStatus[] = [];
    while (stmt.step()) {
      const record = stmt.getAsObject() as unknown as FileReviewStatusRecord;
      files.push(this.mapFileReviewStatusRecordToStatus(record));
    }

    stmt.free();
    return files;
  }

  async getTerminalReviewedFiles(date: string): Promise<FileReviewStatus[]> {
    if (!this.db) {throw new Error('Database not initialized');}

    // Get terminal workflow files that haven't been opened in editor yet
    // These files have reviewed_in_terminal=1 but still unreviewed (score=0)
    const stmt = this.db.prepare(`
      SELECT * FROM file_review_status
      WHERE date = ? AND reviewed_in_terminal = 1 AND review_score = 0
      ORDER BY first_generated_at DESC
    `);
    stmt.bind([date]);

    const files: FileReviewStatus[] = [];
    while (stmt.step()) {
      const record = stmt.getAsObject() as unknown as FileReviewStatusRecord;
      files.push(this.mapFileReviewStatusRecordToStatus(record));
    }

    stmt.free();
    return files;
  }

  async getFileReviewsForDate(date: string): Promise<FileReviewStatus[]> {
    if (!this.db) {throw new Error('Database not initialized');}

    const stmt = this.db.prepare(`
      SELECT * FROM file_review_status
      WHERE date = ?
      ORDER BY first_generated_at DESC
    `);
    stmt.bind([date]);

    const files: FileReviewStatus[] = [];
    while (stmt.step()) {
      const record = stmt.getAsObject() as unknown as FileReviewStatusRecord;
      files.push(this.mapFileReviewStatusRecordToStatus(record));
    }

    stmt.free();
    return files;
  }

  private mapFileReviewStatusRecordToStatus(record: FileReviewStatusRecord): FileReviewStatus {

    return {
      filePath: record.file_path,
      date: record.date,
      tool: record.tool as AITool,
      reviewQuality: record.review_quality as ReviewQuality,
      reviewScore: record.review_score,
      isReviewed: record.is_reviewed === 1,
      linesGenerated: record.lines_generated,
      linesChanged: record.lines_changed,
      linesSinceReview: record.lines_since_review,
      linesAdded: record.lines_added, // CRITICAL FIX: Map lines_added from database
      linesRemoved: record.lines_removed, // CRITICAL FIX: Map lines_removed from database
      charactersCount: record.characters_count,
      agentSessionId: record.agent_session_id ?? undefined,
      isAgentGenerated: record.is_agent_generated === 1,
      wasFileOpen: record.was_file_open === 1,
      firstGeneratedAt: record.first_generated_at,
      lastReviewedAt: record.last_reviewed_at ?? undefined,
      totalReviewTime: record.total_review_time,
      language: record.language ?? undefined,
      modificationCount: record.modification_count,
      totalTimeInFocus: record.total_time_in_focus,
      scrollEventCount: record.scroll_event_count,
      cursorMovementCount: record.cursor_movement_count,
      editsMade: record.edits_made === 1,
      lastOpenedAt: record.last_opened_at ?? undefined,
      reviewSessionsCount: record.review_sessions_count,
      reviewedInTerminal: record.reviewed_in_terminal === 1
    };
  }

  async markFileAsReviewed(filePath: string, tool: string, date: string, developerLevel: string = 'mid', reviewMethod: 'manual' | 'automatic' = 'manual'): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const now = Date.now();

    // Get the file's lines_changed to calculate expected review time
    // sql.js returns arrays. Index 7 = lines_generated, Index 26 = lines_changed
    const fileQuery = this.db.prepare(`
      SELECT * FROM file_review_status
      WHERE file_path = ? AND tool = ? AND date = ?
    `);
    const fileData = fileQuery.get([filePath, tool, date]) as number[] | undefined;

    // Calculate expected review time based on lines changed and developer level
    // Lines changed = additions + |deletions| - this reflects actual review effort
    // Junior: 600ms per line, Mid: 400ms per line, Senior: 200ms per line
    const msPerLine = developerLevel === 'senior' ? 200 : developerLevel === 'junior' ? 600 : 400;

    // Use lines_changed if available, otherwise fall back to lines_generated
    const linesForReview = fileData?.[26] || fileData?.[7] || 50;
    const expectedReviewTime = Math.max(5000, linesForReview * msPerLine); // Min 5 seconds


    const stmt = this.db.prepare(`
      UPDATE file_review_status
      SET is_reviewed = 1,
          review_score = 100,
          review_quality = 'thorough',
          review_method = ?,
          lines_since_review = 0,
          last_reviewed_at = ?,
          total_review_time = ?,
          updated_at = ?
      WHERE file_path = ? AND tool = ? AND date = ?
    `);

    stmt.run([reviewMethod, now, expectedReviewTime, now, filePath, tool, date]);
  }
}
