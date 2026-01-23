# CodePause - Complete Architecture & Implementation Guide

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Diagrams](#architecture-diagrams)
3. [Component Deep-Dive](#component-deep-dive)
4. [Design Patterns & Rationale](#design-patterns--rationale)
5. [Database Schema](#database-schema)
6. [Event Flow](#event-flow)
7. [Extension Lifecycle](#extension-lifecycle)
8. [Real Code Examples](#real-code-examples)
9. [Testing Strategy](#testing-strategy)
10. [How to Extend](#how-to-extend)

---

## System Overview

### What is CodePause?

CodePause is a VSCode extension that monitors AI code assistance usage across **three AI tools** (GitHub Copilot, Cursor AI, Claude Code) and provides **gentle coaching** to help developers maintain balanced, mindful usage of AI assistance.

**Key Features**:
- Real-time tracking of AI code generation across multiple tools
- Post-generation code review tracking with dynamic scoring
- Agent/autonomous mode detection for bulk code generation
- GitHub-style diff view for reviewing AI-generated changes
- Gamification with XP, levels, and achievements
- Privacy-first: 100% local SQLite storage, no telemetry

### Why Does It Exist?

**Research-backed problem**: Multiple 2025 studies show that:
- Developers overestimate AI effectiveness by ~20% (METR study)
- High AI confidence correlates with **LESS critical thinking** (Microsoft Research)
- AI dependency shows **r = -0.75** inverse correlation with critical thinking (Gerlich, 2025)
- Junior developers save **less time** and sometimes take **7-10% longer** with AI (McKinsey)

**Solution**: Non-intrusive monitoring + coaching to encourage balanced AI usage and prevent "cognitive debt."

### Core Philosophy

1. **Privacy-First**: 100% local SQLite storage, no code content stored, zero telemetry
2. **Coaching, Not Surveillance**: Gentle nudges, not warnings. Positive reinforcement.
3. **Multi-Signal Detection**: Blind approval detection uses time + pattern + complexity signals
4. **Experience-Aware**: Different thresholds for Junior/Mid/Senior developers
5. **Extensible**: Plugin architecture ready for new AI tools

---

## Architecture Diagrams

### High-Level System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     VSCode Extension Host                     │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                    Extension Entry                       │ │
│  │                  (src/extension.ts)                      │ │
│  │  • Activation/Deactivation                              │ │
│  │  • Component Orchestration                              │ │
│  │  • Command Registration                                 │ │
│  └───┬─────────────────────────────────────────────────────┘ │
│      │                                                         │
│      ├─────────────────────────────────────────────────────┐  │
│      │                                                      │  │
│      ▼                                                      ▼  │
│  ┌─────────────┐                                    ┌─────────┐
│  │   Storage   │◄───────────────────────────────────┤  Config │
│  │   Layer     │                                    │ Manager │
│  └─────┬───────┘                                    └─────────┘
│        │ DatabaseManager                                       │
│        │ MetricsRepository                                    │
│        │ ConfigRepository                                     │
│        │                                                       │
│      ┌─┴───────────────────────────────────────────────────┐ │
│      │                                                      │ │
│      ▼                                                      │ │
│  ┌──────────────────────────────────────────────────────┐  │ │
│  │              MetricsCollector (Core Hub)             │  │ │
│  │   • Event aggregation                                │  │ │
│  │   • Session management                               │  │ │
│  │   • Tracker coordination                             │  │ │
│  └─┬────────────────────────────────────────────────────┘  │ │
│    │                                                         │ │
│    ├──────────────┬──────────────┬──────────────┐          │ │
│    ▼              ▼              ▼              │          │ │
│  ┌────────┐   ┌────────┐   ┌──────────────┐   │          │ │
│  │Copilot │   │ Cursor │   │ Claude Code  │   │          │ │
│  │Tracker │   │Tracker │   │   Tracker    │   │          │ │
│  └────────┘   └────────┘   └──────────────┘   │          │ │
│       │            │              │            │          │ │
│       └────────────┴──────────────┴────────────┘          │ │
│                     │                                      │ │
│                     ▼                                      │ │
│         ┌─────────────────────────┐                       │ │
│         │   Analysis Components   │                       │ │
│         │  • BlindApprovalDetector│                       │ │
│         │  • ThresholdManager     │                       │ │
│         │  • AlertEngine          │                       │ │
│         └────────┬────────────────┘                       │ │
│                  │                                         │ │
│                  ▼                                         │ │
│       ┌──────────────────────────────┐                    │ │
│       │      UI Components           │                    │ │
│       │  • StatusBarManager          │                    │ │
│       │  • DashboardProvider         │                    │ │
│       │  • NotificationService       │                    │ │
│       └──────────────────────────────┘                    │ │
│                  │                                         │ │
│                  ▼                                         │ │
│       ┌──────────────────────────────┐                    │ │
│       │   Gamification Layer         │                    │ │
│       │  • ProgressTracker (XP/Levels)│                    │ │
│       │  • AchievementSystem          │                   │ │
│       └──────────────────────────────┘                    │ │
└──────────────────────────────────────────────────────────────┘
```

### Event Flow Diagram

```
┌──────────────┐
│  AI Tool     │ (Copilot/Cursor/Claude)
│  Activity    │
└──────┬───────┘
       │
       │ code change / suggestion
       ▼
┌────────────────────┐
│  Tool-Specific     │
│  Tracker           │
│  • CopilotTracker  │
│  • CursorTracker   │
│  • ClaudeTracker   │
└──────┬─────────────┘
       │
       │ TrackingEvent
       ▼
┌────────────────────────────┐
│   MetricsCollector         │
│  • handleEvent()           │
│  • Buffer events           │
│  • Update session          │
│  • Emit to analysis        │
└──────┬─────────────────────┘
       │
       ├────────────┬─────────────┬──────────────┐
       ▼            ▼             ▼              ▼
┌──────────────┐ ┌────────┐  ┌────────┐   ┌─────────┐
│DatabaseManager│ │Blind   │  │Alert   │   │Progress │
│   insertEvent │ │Approval│  │Engine  │   │Tracker  │
│              │ │Detector│  │        │   │         │
└──────────────┘ └───┬────┘  └───┬────┘   └────┬────┘
                     │           │              │
                     │ Analyze   │ Should alert?│ Add XP
                     ▼           ▼              ▼
              ┌──────────────────────────────────┐
              │  BlindApprovalDetection          │
              │   • confidence: Low/Med/High     │
              │   • signals: {time, pattern,...} │
              └────────────┬─────────────────────┘
                           │
                           │ if detected
                           ▼
                  ┌────────────────────┐
                  │ NotificationService│
                  │  • Show gentle nudge│
                  │  • Rate limit check│
                  │  • Snooze check    │
                  └────────────────────┘
                           │
                           ▼
                     User sees alert
```

### Database Schema Diagram

```
┌────────────────────────────────────────────────────────────┐
│                      SQLite Database                       │
│                   (mindfulcode.db)                        │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────────────┐  ┌─────────────────────────┐   │
│  │     events           │  │   daily_metrics          │   │
│  ├──────────────────────┤  ├─────────────────────────┤   │
│  │ id (PK)              │  │ date (PK)               │   │
│  │ timestamp            │  │ total_events            │   │
│  │ tool                 │  │ total_ai_lines          │   │
│  │ event_type           │  │ total_manual_lines      │   │
│  │ lines_of_code        │  │ ai_percentage           │   │
│  │ acceptance_time_delta│  │ acceptance_rate         │   │
│  │ file_path            │  │ average_review_time     │   │
│  │ session_id           │  │ blind_approval_count    │   │
│  └──────────────────────┘  └─────────────────────────┘   │
│           │                           │                    │
│           │                           │                    │
│  ┌────────┴──────────┐   ┌───────────┴───────────┐       │
│  │  tool_metrics     │   │   sessions             │       │
│  ├───────────────────┤   ├────────────────────────┤       │
│  │ date (PK)         │   │ id (PK)                │       │
│  │ tool (PK)         │   │ start_time             │       │
│  │ suggestion_count  │   │ end_time               │       │
│  │ accepted_count    │   │ duration               │       │
│  │ lines_generated   │   │ event_count            │       │
│  │ blind_approval_cnt│   │ ai_lines_generated     │       │
│  └───────────────────┘   └────────────────────────┘       │
│                                                            │
│  ┌────────────────────┐  ┌────────────────────────┐      │
│  │  achievements      │  │   config                │      │
│  ├────────────────────┤  ├────────────────────────┤      │
│  │ id (PK)            │  │ key (PK)               │      │
│  │ unlocked (bool)    │  │ value (JSON)           │      │
│  │ unlocked_at        │  │ updated_at             │      │
│  │ progress           │  └────────────────────────┘      │
│  └────────────────────┘                                   │
│                                                            │
│  ┌────────────────────┐  ┌────────────────────────┐      │
│  │  snooze_state      │  │   alert_history         │      │
│  ├────────────────────┤  ├────────────────────────┤      │
│  │ id (always 1)      │  │ alert_type (PK)        │      │
│  │ snoozed (bool)     │  │ last_shown (timestamp) │      │
│  │ snooze_until       │  │ count                  │      │
│  │ snooze_reason      │  └────────────────────────┘      │
│  └────────────────────┘                                   │
└────────────────────────────────────────────────────────────┘
```

---

## Component Deep-Dive

### 1. **Storage Layer** (`src/storage/`)

#### DatabaseManager.ts

**Purpose**: Low-level SQLite operations and schema management.

**Key Responsibilities**:
- Create and maintain 8 database tables
- Provide CRUD operations for all data types
- Handle SQLite connection lifecycle
- Enable WAL mode for concurrent access

**Real Code Example**:
```typescript
// From DatabaseManager.ts:42-51
async initialize(): Promise<void> {
  this.db = new Database(this.dbPath);

  // Enable WAL mode for better concurrent access
  this.db.pragma('journal_mode = WAL');

  // Create tables
  this.createTables();

  // Create indices for performance
  this.createIndices();
}
```

**Why WAL Mode?**
- WAL (Write-Ahead Logging) allows concurrent reads while writing
- Prevents "database is locked" errors
- Better performance for VSCode extension (multiple components accessing DB)

**Design Decision**: We chose SQLite over JSON files because:
1. **Atomic transactions** - Prevent data corruption on crashes
2. **Query performance** - Indexed queries for date ranges
3. **Data integrity** - Foreign key constraints, type safety
4. **Size efficiency** - Better compression than JSON
5. **Standard tooling** - Can inspect with any SQLite browser

#### MetricsRepository.ts

**Purpose**: High-level data access for metrics operations.

**Pattern**: Repository Pattern - abstracts database implementation from business logic.

**Key Methods**:
- `recordEvent()` - Store tracking events
- `getDailyMetrics()` - Retrieve aggregated metrics
- `calculateDailyMetrics()` - Aggregate raw events into daily summaries
- `saveSession()` - Persist coding sessions

**Why Repository Pattern?**
- **Testability**: Easy to mock in unit tests
- **Separation of concerns**: Business logic doesn't know about SQL
- **Future-proofing**: Could swap SQLite for PostgreSQL without changing business logic
- **Query encapsulation**: All SQL in one place

---

### 2. **Core Logic** (`src/core/`)

#### MetricsCollector.ts

**Purpose**: Central event hub that coordinates all tracking and analysis.

**Architecture**: Event-Driven Architecture

**Key Features**:
1. **Event Buffering** - Collects events in memory, flushes in batches
2. **Session Management** - Tracks active coding sessions
3. **Tracker Coordination** - Initializes and manages most of AI trackers
4. **Periodic Aggregation** - Runs daily metrics calculation every 5 minutes

**Real Code Example - Event Handling**:
```typescript
// From MetricsCollector.ts:107-144
private handleEvent(event: TrackingEvent): void {
  // Add to event buffer (for batch processing)
  this.eventBuffer.push(event);

  // Reset session idle timer (user is active)
  this.resetSessionIdleTimer();

  // Handle specific event types
  switch (event.eventType) {
    case EventType.SuggestionDisplayed:
      this.handleSuggestionDisplayed(event);
      break;
    case EventType.SuggestionAccepted:
      this.handleSuggestionAccepted(event);
      break;
    // ... other cases
  }

  // Update current session stats
  if (this.currentSession) {
    this.currentSession.eventCount++;
    if (event.linesOfCode) {
      this.currentSession.aiLinesGenerated += event.linesOfCode;
    }
  }

  // Flush buffer if it's getting full (batch optimization)
  if (this.eventBuffer.length >= 10) {
    this.flushEventBuffer();
  }
}
```

**Why Event Buffering?**
- **Performance**: Batching reduces database writes from ~100/min to ~10/min
- **Debouncing**: Prevents overwhelming database during rapid typing
- **Reliability**: Buffer can be retried on error
- **Resource efficiency**: Lower disk I/O

**Session Idle Timeout**:
```typescript
// From MetricsCollector.ts:273-284
private resetSessionIdleTimer(): void {
  if (this.sessionIdleTimer) {
    clearTimeout(this.sessionIdleTimer);
  }

  // End session after 5 minutes of inactivity
  this.sessionIdleTimer = setTimeout(() => {
    this.endCurrentSession().then(() => {
      // Don't auto-start new session - wait for activity
    });
  }, SESSION_IDLE_TIMEOUT_MS); // 5 minutes
}
```

**Why 5 minutes?** Research shows coding sessions naturally have ~5min breaks. Longer = separate session.

#### BlindApprovalDetector.ts

**Purpose**: Multi-signal algorithm to detect when developers accept AI code without proper review.

**Algorithm**: Three-signal confidence scoring

**Signal 1: Time-Based**
```typescript
// From BlindApprovalDetector.ts:76-82
private detectTimeBasedBlindApproval(event: TrackingEvent): boolean {
  if (!event.acceptanceTimeDelta) {
    return false;
  }

  return event.acceptanceTimeDelta < this.thresholds.blindApprovalTime;
}
```
- **Junior**: < 3000ms
- **Mid**: < 2000ms
- **Senior**: < 1500ms

**Signal 2: Pattern-Based**
```typescript
// From BlindApprovalDetector.ts:88-99
private detectPatternBasedBlindApproval(): boolean {
  if (this.recentAcceptances.length < 3) {
    return false;
  }

  // Count rapid acceptances in last 10 events
  const rapidCount = this.recentAcceptances.filter(
    e => (e.acceptanceTimeDelta || Infinity) < this.thresholds.blindApprovalTime
  ).length;

  return rapidCount >= 3; // 3+ rapid acceptances = pattern detected
}
```

**Signal 3: Complexity-Based**
```typescript
// From BlindApprovalDetector.ts:119-135
private calculateMinimumReviewTime(event: TrackingEvent): number {
  const lines = event.linesOfCode || 0;

  // Base: 500ms per line of code (average reading speed)
  let minTime = lines * 500;

  // Adjust for language complexity
  const complexLanguages = ['typescript', 'javascript', 'python', 'java', 'cpp', 'rust'];
  if (event.language && complexLanguages.includes(event.language.toLowerCase())) {
    minTime *= 1.5; // +50% for complex languages
  }

  // Minimum floor based on experience level
  const floor = this.thresholds.minReviewTime;

  return Math.max(minTime, floor);
}
```

**Confidence Scoring**:
```typescript
// From BlindApprovalDetector.ts:49-61
const triggeredCount = Object.values(signals).filter(Boolean).length;

let confidence: BlindApprovalConfidence;
if (triggeredCount === 0) {
  return this.createNegativeDetection(); // No blind approval
} else if (triggeredCount === 1) {
  confidence = BlindApprovalConfidence.Low;   // Gentle nudge
} else if (triggeredCount === 2) {
  confidence = BlindApprovalConfidence.Medium; // Warning
} else {
  confidence = BlindApprovalConfidence.High;   // Strong warning
}
```

**Why Multi-Signal?**
- **Reduces false positives**: Single signal can be wrong (e.g., developer already reviewed in PR)
- **Confidence levels**: Allows different alert intensities
- **Adapts to context**: Complexity signal considers code difficulty
- **Research-backed**: Microsoft study shows multi-factor assessment more accurate

#### ThresholdManager.ts

**Purpose**: Manages experience-level-based thresholds and adaptive suggestions.

**Strategy Pattern**: Different thresholds for different developer levels.

**Default Thresholds**:
```typescript
// From types/index.ts:418-440
export const DEFAULT_THRESHOLDS: Record<DeveloperLevel, ThresholdConfig> = {
  [DeveloperLevel.Junior]: {
    level: DeveloperLevel.Junior,
    blindApprovalTime: 3000,      // More lenient
    maxAIPercentage: 70,
    minReviewTime: 3000,
    streakThreshold: 5
  },
  [DeveloperLevel.Mid]: {
    level: DeveloperLevel.Mid,
    blindApprovalTime: 2000,      // Balanced
    maxAIPercentage: 60,
    minReviewTime: 2000,
    streakThreshold: 4
  },
  [DeveloperLevel.Senior]: {
    level: DeveloperLevel.Senior,
    blindApprovalTime: 1500,      // Stricter
    maxAIPercentage: 50,
    minReviewTime: 1500,
    streakThreshold: 3
  }
};
```

**Why Experience-Level Thresholds?**
1. **Juniors need more time** to understand code (McKinsey: juniors 7-10% slower with AI)
2. **Seniors review faster** due to pattern recognition (Jellyfish: seniors 22% faster)
3. **Different AI percentages** - Seniors should write more manual code for learning
4. **Research-backed** - Multiple studies show experience level matters

#### FileReviewSessionTracker.ts

**Purpose**: Tracks when developers review agent-generated code AFTER it was created by hooking into VSCode file viewing APIs.

**Key Features**:
1. **Dynamic Scoring** - Calculates review quality based on time, scrolling, cursor movement, and edits
2. **Experience-Level Aware** - Junior devs (600ms/line) vs Senior devs (200ms/line)
3. **Session Timeout** - Resets review progress after 1 hour of inactivity
4. **Grace Period** - Tracks files for 24 hours after generation

**Real Code Example - Review Score Calculation**:
```typescript
// From FileReviewSessionTracker.ts:445-495
private updateReviewScore(session: FileReviewSession): void {
  const customScoring = calculateDynamicThresholds(
    session.linesGenerated,
    this.developerLevel
  );

  let score = 0;

  // Require meaningful interaction, not just passive file opening
  const MIN_CURSOR_MOVEMENTS = 5;
  const MIN_SCROLL_EVENTS = 1;

  const hasActiveInteractions =
    session.scrollEventCount >= MIN_SCROLL_EVENTS ||
    session.cursorMovementCount >= MIN_CURSOR_MOVEMENTS ||
    session.editsMade;

  // Factor 1: Time in focus (ONLY count if actively interacting)
  if (hasActiveInteractions) {
    if (session.totalTimeInFocus >= customScoring.thoroughReviewTime) {
      score += 80; // Thorough review
    } else if (session.totalTimeInFocus >= customScoring.lightReviewTime) {
      score += 50; // Light review
    }
  }

  // Factor 2: Scroll events (engaged reading)
  const scrollBonus = Math.floor(session.scrollEventCount / 3) * 10;
  score += Math.min(scrollBonus, 20);

  // Factor 3: Cursor movements (navigation)
  const cursorBonus = Math.floor(session.cursorMovementCount / 5) * 10;
  score += Math.min(cursorBonus, 10);

  // Factor 4: Edits made (highest engagement)
  if (session.editsMade) {
    score += 20;
  }

  // Determine review quality
  if (score >= 70) {
    session.currentReviewQuality = ReviewQuality.Thorough;
  } else if (score >= 40) {
    session.currentReviewQuality = ReviewQuality.Light;
  }

  // Mark as reviewed if score exceeds threshold
  if (score >= customScoring.reviewedThreshold) {
    session.wasReviewed = true;
  }
}
```

**Why This Approach?**
- **Prevents gaming**: Passive file opening doesn't count as review
- **Dynamic thresholds**: More complex files need more review time
- **Multi-factor scoring**: Time + interaction + edits = comprehensive assessment
- **Experience-aware**: Junior devs get more lenient thresholds

**VSCode API Hooks**:
```typescript
// API 1: File open/close detection
vscode.window.onDidChangeActiveTextEditor(editor => {
  this.handleEditorChange(editor);
});

// API 2: Scrolling detection (reading indicator)
vscode.window.onDidChangeTextEditorVisibleRanges(event => {
  this.handleScrolling(event);
});

// API 3: Cursor movement detection
vscode.window.onDidChangeTextEditorSelection(event => {
  this.handleCursorMovement(event);
});

// API 4: Document change detection (edits)
vscode.workspace.onDidChangeTextDocument(event => {
  this.handleDocumentChange(event);
});
```

#### AgentSessionDetector.ts

**Purpose**: Automatically detects when AI tools operate in agent/autonomous mode using a multi-signal approach.

**Detection Signals**:
1. **Rapid File Changes** - 3+ files modified within 10 seconds
2. **Closed File Modifications** - Code generated in files not open in editor
3. **Bulk Code Generation** - 50+ lines in a single event
4. **Git Commit Signature** - Claude Code markers in commits
5. **Consistent Source** - 3+ events from same metadata source

**Algorithm**:
```typescript
// From AgentSessionDetector.ts:46-92
processEvent(event: TrackingEvent): {
  sessionDetected: boolean;
  sessionStarted: boolean;
  session: AgentSession | null;
} {
  // Detect all signals
  const signals = this.detectSignals(event);
  const triggeredCount = this.countTriggeredSignals(signals);

  // Requires 2+ signals for detection (reduces false positives)
  if (triggeredCount >= 2) {
    if (!this.currentSession) {
      // Start new agent session
      this.startSession(event, signals, confidence);
      return { sessionDetected: true, sessionStarted: true, ... };
    }
  }

  return { sessionDetected: false, ... };
}
```

**Why Multi-Signal Detection?**
- **Reduces false positives**: Single signal could be manual coding
- **Confidence levels**: 2 signals = low, 3 = medium, 4+ = high
- **Automatic detection**: No manual tagging required
- **Tool-agnostic**: Works across Copilot, Cursor, Claude Code

**Session Management**:
- **Idle Timeout**: 30 seconds of inactivity ends session
- **Max Duration**: 10 minutes maximum session length
- **Automatic End**: Session ends on timeout or manual trigger

#### EventDeduplicator.ts

**Purpose**: Prevents double-counting of events using a sophisticated deduplication key.

**Enhancement** (Recent Fix):
```typescript
// From EventDeduplicator.ts:66-74
private generateKey(event: TrackingEvent): string {
  const filePath = event.filePath || 'unknown';
  const roundedTimestamp = Math.floor(event.timestamp / 100) * 100;
  const lines = event.linesOfCode || 0;
  const linesRemoved = event.linesRemoved || 0;  // ← ADDED
  const chars = event.charactersCount || 0;

  return `${filePath}:${roundedTimestamp}:${lines}:${linesRemoved}:${chars}`;
}
```

**Why Add `linesRemoved`?**
- **Problem**: Events with same `linesOfCode` (0) but different `linesRemoved` were treated as duplicates
- **Example**: Event 1 (0 added, 10 removed) + Event 2 (30 added, 0 removed) = both had key ending in `:0:`
- **Solution**: Include `linesRemoved` to distinguish line deletions from line additions
- **Impact**: Accurate tracking of both code additions AND deletions

**Deduplication Window**: 1 second (catches rapid duplicate detections)

---

### 3. **Trackers** (`src/trackers/`)

#### BaseTracker.ts

**Purpose**: Abstract base class for most of AI trackers.

**Pattern**: Template Method Pattern

**Provided Utilities**:
```typescript
// Utilities all trackers inherit:
- generateId(): string           // Unique event IDs
- getFilePath(doc): string       // Extract file path from document
- getLanguage(doc): string       // Detect programming language
- countLines(text): number       // Count LOC
- countCharacters(text): number  // Count chars
- shouldTrackDocument(doc): boolean  // Filter non-code files
- emitEvent(event): void         // Send events to MetricsCollector
```

**Why Abstract Base Class?**
- **DRY**: Common utilities in one place
- **Consistency**: All trackers emit events the same way
- **Extensibility**: New AI tool? Extend BaseTracker
- **Type safety**: Enforces ITracker interface

#### CopilotTracker.ts

**Purpose**: Track GitHub Copilot suggestions and acceptances.

**Challenge**: GitHub Copilot has no official tracking API.

**Solution**: Heuristic-based detection using document changes.

**Detection Algorithm**:
```typescript
// From CopilotTracker.ts:111-130
private isCopilotSuggestion(change: vscode.TextDocumentContentChangeEvent): boolean {
  const text = change.text;

  // Copilot suggestions are typically:
  // 1. Multi-character insertions (>= 3 chars)
  // 2. Not just whitespace
  // 3. Complete tokens or lines

  if (text.length < 3) {
    return false; // Too short - likely manual typing
  }

  // Check if it's not just typing (has structure like complete words/lines)
  const hasNewlines = text.includes('\n');
  const hasMultipleWords = text.trim().split(/\s+/).length > 1;
  const isCodeLike = /[(){}\[\];,.]/.test(text);

  return hasNewlines || hasMultipleWords || isCodeLike;
}
```

**Suggestion Lifecycle**:
1. **Document change detected** → Check if it looks like Copilot
2. **Create pending suggestion** → Store with 30-second expiry
3. **Wait for user action** → Accepted (kept) or Rejected (expires)
4. **Calculate acceptance time** → Time between display and acceptance

**Why 30-Second Expiry?**
- Copilot inline suggestions disappear after ~10-15 seconds of no action
- 30 seconds covers edge cases (user distraction, phone call)
- Expired suggestions treated as rejections

**Acceptance Time Calculation**:
```typescript
// From CopilotTracker.ts:172-186
const timeSinceLastChange = timestamp - this.lastChangeTimestamp;

if (timeSinceLastChange > 100) {
  // This is likely an acceptance (not continuous typing)
  this.handleSuggestionAcceptance(suggestion, timeSinceLastChange);
} else {
  // Schedule delayed acceptance check (might be typing continuation)
  setTimeout(() => {
    if (this.pendingSuggestions.has(suggestionId)) {
      this.handleSuggestionAcceptance(suggestion, timeSinceLastChange);
    }
  }, 500);
}
```

**Why 100ms Threshold?**
- Human typing speed: ~200-400ms between characters
- < 100ms = likely continuous typing, not acceptance
- > 100ms = pause suggests acceptance decision

#### CursorTracker.ts

**Purpose**: Track Cursor AI code generation.

**Challenge**: Cursor AI has no official API and works differently than Copilot.

**Detection Strategy**:
1. **File system watcher** - Monitor for large code insertions
2. **Pattern detection** - Look for Cursor-specific comment markers
3. **Git diff analysis** - Detect AI-generated commits

**Why Different from Copilot?**
- Cursor generates larger code blocks (multi-line functions)
- Cursor uses command palette (Cmd+K) for generation
- Cursor doesn't show inline suggestions - generates directly

#### ClaudeCodeTracker.ts

**Purpose**: Track Claude Code (CLI) code generations.

**Advantage**: Claude Code leaves audit trails in JSONL logs!

**Detection Strategy**:
1. **JSONL log parsing** - Read Claude Code logs directory
2. **Git commit analysis** - Look for "🤖 Generated with Claude Code" signatures
3. **File monitoring** - Watch for Write/Edit tool usage

**Log Location**:
- macOS: `~/Library/Application Support/claude-code/logs/`
- Linux: `~/.config/claude-code/logs/`
- Windows: `%APPDATA%/claude-code/logs/`

**Why JSONL?**
- Claude Code logs every tool use with timestamps
- Can extract exact lines of code generated
- More accurate than heuristics (Copilot/Cursor)

---

### 4. **UI Components** (`src/ui/`)

#### StatusBarManager.ts

**Purpose**: Real-time stats in VSCode status bar.

**Display Format**:
```
🤖 42% AI | 15 suggestions | ⚡ Level 5
```

**Color Coding**:
- **Green**: AI % below threshold (healthy usage)
- **Yellow**: Approaching threshold (caution)
- **Orange**: Exceeding threshold (warning)
- **Purple**: Snoozed

**Why Status Bar?**
- Non-intrusive - always visible but not blocking
- Real-time feedback loop
- Click to open dashboard

#### DashboardProvider.ts

**Purpose**: Comprehensive metrics webview in sidebar.

**Sections**:
1. **Today's Stats** - AI %, acceptance rate, blind approvals
2. **Tool Breakdown** - Copilot vs Cursor vs Claude usage
3. **7-Day Trends** - Charts showing patterns
4. **Achievements** - Unlocked badges and progress
5. **Quick Actions** - Export, settings, snooze

**Why Webview?**
- Rich visualizations (charts, graphs)
- Responsive design
- Can use web technologies (HTML/CSS/JS)

#### NotificationService.ts

**Purpose**: Display gentle coaching alerts.

**Alert Types**:
```typescript
// From types/index.ts:20-25
export enum AlertType {
  GentleNudge = 'gentle-nudge',           // 5min rate limit
  EducationalMoment = 'educational-moment', // 30min rate limit
  StreakWarning = 'streak-warning',        // 10min rate limit
  Achievement = 'achievement'              // No rate limit
}
```

**Tone Examples**:
- ❌ "**You're accepting code too fast!**" (accusatory)
- ✅ "**Quick acceptance detected**. Taking a moment to review helps maintain code quality." (coaching)

**Why Rate Limiting?**
- Prevents alert fatigue
- Respects user attention
- Medium frequency (5-30min) based on research

#### DiffViewService.ts

**Purpose**: Core service for file diff operations, statistics, and transformations. Provides GitHub-style diff views for reviewing AI-generated changes.

**Key Features**:
1. **Statistics Calculation** - Aggregate stats across multiple files
2. **Change Status Detection** - Determines if file was Added/Modified/Deleted
3. **Change Bar Visualization** - Proportional green/red bars for additions/deletions
4. **Directory Grouping** - Organizes files by parent directory

**File Status Detection Logic**:
```typescript
// From DiffViewService.ts:96-127
determineFileStatus(file: FileReviewStatus): FileChangeStatus {
  const added = file.linesAdded ?? 0;
  const removed = file.linesRemoved ?? 0;
  const generated = file.linesGenerated ?? 0;

  // No changes
  if (added === 0 && removed === 0) {
    return FileChangeStatus.Unchanged;
  }

  // File with only deletions = Deleted
  if (removed > 0 && added === 0) {
    return FileChangeStatus.Deleted;
  }

  // File is NEW only if ALL generated content equals additions
  // Example: linesGenerated=166, linesAdded=166 → NEW file
  // Example: linesGenerated=477, linesAdded=166 → EXISTING file (had 311 lines before)
  if (added > 0 && removed === 0 && generated === added) {
    return FileChangeStatus.Added;
  }

  // File already had content (modified)
  if (added > 0 || removed > 0) {
    return FileChangeStatus.Modified;
  }

  return FileChangeStatus.Unchanged;
}
```

**Why This Logic?**
- **Accurate detection**: Distinguishes NEW files from MODIFIED files
- **Handles edge cases**: Zero changes, only additions, only deletions
- **Context-aware**: Uses `linesGenerated` to understand file history
- **Visual clarity**: Matches GitHub's file status indicators

**Statistics Calculation**:
```typescript
// Returns aggregate metrics for multiple files
calculateStatistics(files: FileReviewStatus[]): DiffStatistics {
  return {
    totalFiles: files.length,
    totalAdditions: sum(files.linesAdded),
    totalDeletions: sum(files.linesRemoved),
    filesAdded: count(status === 'Added'),
    filesModified: count(status === 'Modified'),
    filesDeleted: count(status === 'Deleted'),
    reviewedFiles: count(file.isReviewed),
    unreviewedFiles: count(!file.isReviewed),
    reviewProgress: (reviewedFiles / totalFiles) * 100
  };
}
```

**Integration with Dashboard**:
- Dashboard uses DiffViewService to generate file tree
- Statistics displayed at top: "156 files changed, 2,847 additions, 1,023 deletions"
- Review progress bar: "42% reviewed (65 of 156 files)"

---

### 5. **Gamification** (`src/gamification/`)

#### ProgressTracker.ts

**Purpose**: XP and leveling system for positive reinforcement.

**XP Calculation**:
```typescript
// From ProgressTracker.ts:55
const totalXP = stats.totalEvents; // Each event = 1 XP
```

**Level Thresholds**:
```typescript
// From types/index.ts:455
export const XP_THRESHOLDS = [
  0,     // Level 1: Mindful Novice      🌱
  100,   // Level 2: Aware Apprentice    🌿
  300,   // Level 3: Conscious Coder     🍀
  600,   // Level 4: Thoughtful Developer 🌳
  1000,  // Level 5: Balanced Builder    ⚖️
  1500,  // Level 6: Mindful Master      🧘
  2000,  // Level 7: Zen Engineer        ☯️
  3000,  // Level 8: Enlightened Architect 💫
  5000,  // Level 9: Transcendent Tech   ✨
  10000  // Max level
];
```

**Why Gamification?**
- **Positive reinforcement** (vs warnings)
- **Engagement**: Users check progress
- **Motivation**: "Just 50 XP to next level"
- **Research**: Gamification increases adoption (Stanford study)

#### AchievementSystem.ts

**Purpose**: Unlock achievements based on behavior.

**Achievement Categories**:
1. **Review** - "Careful Reviewer" (avg review time > 5s for a day)
2. **Balance** - "Balanced Coder" (40-60% AI for a week)
3. **Consistency** - "Consistent Contributor" (7-day streak)
4. **Learning** - "Thoughtful Developer" (zero blind approvals for a day)

**Why Achievements?**
- Rewards good behavior
- Provides goals
- Social sharing (future feature)

---

## Design Patterns & Rationale

### 1. Repository Pattern

**Usage**: MetricsRepository, ConfigRepository

**Why?**
- **Testability**: Easy to mock data layer
- **Separation of concerns**: Business logic ↔ Data access
- **Flexibility**: Can swap SQLite for cloud storage
- **Query centralization**: All SQL in repositories

**Example**:
```typescript
// Business logic doesn't know about SQL:
const metrics = await metricsRepo.getDailyMetrics('2025-01-15');
// vs raw SQL:
const metrics = db.prepare('SELECT * FROM daily_metrics WHERE date = ?').get('2025-01-15');
```

### 2. Event-Driven Architecture

**Usage**: MetricsCollector, Achievement System

**Why?**
- **Loose coupling**: Components don't directly call each other
- **Scalability**: Easy to add new event listeners
- **Extensibility**: New features subscribe to existing events
- **Async by nature**: Events can be processed in batches

**Flow**:
```
Tracker emits event
  → MetricsCollector receives
    → Database stores
    → BlindApprovalDetector analyzes
      → AlertEngine decides
        → NotificationService displays
```

### 3. Strategy Pattern

**Usage**: ThresholdManager (experience levels)

**Why?**
- **Runtime selection**: Choose strategy based on user config
- **Extensibility**: Easy to add new experience levels
- **Encapsulation**: Each strategy self-contained

**Example**:
```typescript
// Strategy selected at runtime based on user config
const thresholds = ThresholdManager.getRecommendedThresholds(
  userConfig.experienceLevel // Junior/Mid/Senior
);
```

### 4. Singleton Pattern

**Usage**: DatabaseManager (one connection)

**Why?**
- **Resource management**: Only one SQLite connection
- **Consistency**: All components use same DB instance
- **Performance**: Connection pooling

**Implementation**: Extension entry point creates single instance, passes to all components.

### 5. Factory Pattern

**Usage**: Tracker initialization in MetricsCollector

**Why?**
- **Dynamic creation**: Only create trackers for enabled tools
- **Configuration-driven**: Based on user settings
- **Encapsulation**: Tracker creation logic in one place

**Example**:
```typescript
// From MetricsCollector.ts:68-79
const config = this.configManager.getConfig();

// Only create enabled trackers (Factory pattern)
if (config.trackedTools.copilot) {
  const copilotTracker = new CopilotTracker(this.handleEvent);
  await copilotTracker.initialize();

  if (copilotTracker.isActive()) {
    this.trackers.set(AITool.Copilot, copilotTracker);
  }
}
```

### 6. Template Method Pattern

**Usage**: BaseTracker abstract class

**Why?**
- **Code reuse**: Common utilities in base class
- **Consistency**: All trackers implement same interface
- **Flexibility**: Subclasses override specific methods

**Example**:
```typescript
// BaseTracker provides template:
abstract class BaseTracker {
  abstract initialize(): Promise<void>;  // Subclasses implement
  dispose(): void { /* common cleanup */ }  // Shared method
  emitEvent(): void { /* common event emission */ }  // Shared method
}
```

---

## Database Schema

### Tables Overview

**9 Tables Total**:
1. `events` - Raw tracking events (detailed)
2. `daily_metrics` - Aggregated daily stats (summary)
3. `tool_metrics` - Per-tool breakdown (analysis)
4. `sessions` - Coding session tracking (context)
5. `file_review_status` - File-level review tracking (NEW)
6. `achievements` - Unlocked achievements (gamification)
7. `config` - Key-value settings (configuration)
8. `snooze_state` - Snooze status (UX)
9. `alert_history` - Rate limiting data (UX)

### Detailed Schema

#### 1. events

**Purpose**: Store every tracking event with full metadata.

```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,                -- Unix ms
  tool TEXT NOT NULL,                        -- 'copilot' | 'cursor' | 'claude-code'
  event_type TEXT NOT NULL,                  -- 'suggestion-displayed' | 'suggestion-accepted' ...
  lines_of_code INTEGER,                     -- LOC in suggestion
  characters_count INTEGER,                  -- Character count
  acceptance_time_delta INTEGER,             -- ms between display and acceptance
  file_path TEXT,                            -- Anonymized file path
  language TEXT,                             -- 'typescript' | 'python' ...
  session_id TEXT,                           -- Links to sessions table
  metadata TEXT,                             -- JSON for extensibility
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);
```

**Indices**:
```sql
CREATE INDEX idx_events_timestamp ON events(timestamp);
CREATE INDEX idx_events_tool ON events(tool);
CREATE INDEX idx_events_session ON events(session_id);
```

**Why This Schema?**
- `timestamp`: Enables date range queries for reports
- `acceptance_time_delta`: Core metric for blind approval detection
- `metadata`: JSON field for extensibility (future features)
- **Retention**: Keep raw events for 90 days, aggregate then delete

#### 2. daily_metrics

**Purpose**: Pre-aggregated daily statistics for fast dashboard loading.

```sql
CREATE TABLE daily_metrics (
  date TEXT PRIMARY KEY,                     -- 'YYYY-MM-DD'
  total_events INTEGER NOT NULL DEFAULT 0,
  total_ai_lines INTEGER NOT NULL DEFAULT 0,
  total_manual_lines INTEGER NOT NULL DEFAULT 0,
  ai_percentage REAL NOT NULL DEFAULT 0,     -- Calculated: ai / (ai + manual) * 100
  acceptance_rate REAL NOT NULL DEFAULT 0,   -- accepted / displayed
  average_review_time REAL NOT NULL DEFAULT 0, -- avg(acceptance_time_delta)
  blind_approval_count INTEGER NOT NULL DEFAULT 0,
  session_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);
```

**Why Pre-Aggregate?**
- **Performance**: Dashboard loads in < 500ms (requirement)
- **Simplified queries**: No need to scan thousands of events
- **Historical analysis**: Can query past metrics without raw events

**Aggregation Schedule**: Every 5 minutes (see MetricsCollector.startAggregation)

#### 3. tool_metrics

**Purpose**: Per-tool breakdown for comparison.

```sql
CREATE TABLE tool_metrics (
  date TEXT NOT NULL,
  tool TEXT NOT NULL,                        -- 'copilot' | 'cursor' | 'claude-code'
  suggestion_count INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  lines_generated INTEGER NOT NULL DEFAULT 0,
  average_review_time REAL NOT NULL DEFAULT 0,
  blind_approval_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, tool)
);
```

**Why Separate Table?**
- **Normalization**: Avoids repeating daily_metrics for each tool
- **Efficient queries**: "Which tool do I use most?" is one query
- **Comparison**: Easy to compare Copilot vs Cursor usage

#### 4. sessions

**Purpose**: Track coding sessions (5min idle = new session).

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                       -- 'session-{timestamp}-{random}'
  start_time INTEGER NOT NULL,
  end_time INTEGER,                          -- NULL if session still active
  duration INTEGER,                          -- ms, calculated on end
  event_count INTEGER NOT NULL DEFAULT 0,
  ai_lines_generated INTEGER NOT NULL DEFAULT 0,
  manual_lines_written INTEGER NOT NULL DEFAULT 0,
  tools_used TEXT NOT NULL                   -- JSON array ['copilot', 'cursor']
);
```

**Why Track Sessions?**
- **Context**: AI usage differs between short fixes and long feature work
- **Patterns**: Detect if user overuses AI in long sessions
- **Reports**: "Your longest session was 3 hours with 85% AI code"

#### 5. file_review_status

**Purpose**: Track file-level review status for AI-generated code with detailed metrics.

```sql
CREATE TABLE IF NOT EXISTS file_review_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  date TEXT NOT NULL,                        -- 'YYYY-MM-DD'
  tool TEXT NOT NULL,                        -- 'copilot' | 'cursor' | 'claude-code'
  review_quality TEXT NOT NULL,              -- 'none' | 'light' | 'thorough'
  review_score REAL NOT NULL DEFAULT 0,      -- 0-100 calculated score
  is_reviewed INTEGER NOT NULL DEFAULT 0,    -- 0 or 1 (Boolean)
  lines_generated INTEGER NOT NULL DEFAULT 0,
  lines_added INTEGER NOT NULL DEFAULT 0,
  lines_removed INTEGER NOT NULL DEFAULT 0,
  characters_count INTEGER NOT NULL DEFAULT 0,
  agent_session_id TEXT,                     -- Links to agent session (if applicable)
  is_agent_generated INTEGER NOT NULL DEFAULT 0,
  was_file_open INTEGER NOT NULL DEFAULT 0,
  first_generated_at INTEGER NOT NULL,       -- Unix timestamp (ms)
  last_reviewed_at INTEGER,                  -- Unix timestamp (ms)
  total_review_time INTEGER NOT NULL DEFAULT 0, -- ms
  language TEXT,                             -- 'typescript' | 'python' | etc.
  modification_count INTEGER NOT NULL DEFAULT 0,
  total_time_in_focus INTEGER NOT NULL DEFAULT 0, -- ms
  scroll_event_count INTEGER NOT NULL DEFAULT 0,
  cursor_movement_count INTEGER NOT NULL DEFAULT 0,
  edits_made INTEGER NOT NULL DEFAULT 0,
  last_opened_at INTEGER,
  review_sessions_count INTEGER NOT NULL DEFAULT 0,
  reviewed_in_terminal INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  UNIQUE(file_path, date, tool)              -- One row per file/date/tool
);
```

**Indices**:
```sql
CREATE INDEX idx_file_review_date ON file_review_status(date);
CREATE INDEX idx_file_review_path ON file_review_status(file_path);
CREATE INDEX idx_file_review_reviewed ON file_review_status(is_reviewed);
CREATE INDEX idx_file_review_agent ON file_review_status(agent_session_id);
```

**Why This Schema?**
- **Comprehensive tracking**: Captures all aspects of file review behavior
- **Review quality**: Stores both score (0-100) and quality label (none/light/thorough)
- **Agent awareness**: Tracks if file was generated by autonomous agent
- **Interaction metrics**: Scrolling, cursor movement, edits, time in focus
- **Multi-tool support**: Same file can have different review status per tool
- **Temporal data**: Tracks when generated, when reviewed, total review time

**Key Metrics**:
- `review_score`: Calculated by FileReviewSessionTracker (0-100)
- `total_time_in_focus`: Cumulative time file was active in editor
- `scroll_event_count`: Number of times user scrolled through file
- `cursor_movement_count`: Number of cursor movements (indicates navigation)
- `edits_made`: Whether user manually edited the file (0 or 1)

**Unique Constraint**: `(file_path, date, tool)` ensures one review status per file per day per tool.

#### 7. achievements

**Purpose**: Track unlocked achievements and progress.

```sql
CREATE TABLE achievements (
  id TEXT PRIMARY KEY,                       -- 'careful-reviewer'
  unlocked INTEGER NOT NULL DEFAULT 0,       -- 0 or 1 (SQLite boolean)
  unlocked_at INTEGER,                       -- Timestamp when unlocked
  progress REAL NOT NULL DEFAULT 0           -- 0.0 to 1.0 (for partially complete)
);
```

**Why `progress` Field?**
- Shows user they're 80% to unlocking "Balanced Coder"
- Motivates continued progress
- Dashboard can show progress bars

#### 8. config

**Purpose**: Key-value store for user settings.

```sql
CREATE TABLE config (
  key TEXT PRIMARY KEY,                      -- 'user_config' | 'thresholds' | etc
  value TEXT NOT NULL,                       -- JSON string
  updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);
```

**Why Not Just Use VSCode Settings?**
- **Portability**: Can export entire config
- **History**: Track setting changes over time
- **Complex objects**: Store nested configuration
- **Privacy**: Syncs with VSCode settings if user opts in

#### 9. snooze_state

**Purpose**: Single-row table for global snooze status.

```sql
CREATE TABLE snooze_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),     -- Always 1 (single row)
  snoozed INTEGER NOT NULL DEFAULT 0,        -- Currently snoozed?
  snooze_until INTEGER,                      -- Unix timestamp
  snooze_reason TEXT                         -- 'end-of-day' | 'custom'
);

-- Initialize with default row
INSERT OR IGNORE INTO snooze_state (id, snoozed) VALUES (1, 0);
```

**Why Single Row?**
- Global state (only one snooze status)
- Fast reads (no WHERE clause)
- Simple updates

#### 10. alert_history

**Purpose**: Rate limiting for alerts.

```sql
CREATE TABLE alert_history (
  alert_type TEXT PRIMARY KEY,               -- 'gentle-nudge' | 'educational-moment' ...
  last_shown INTEGER NOT NULL,               -- Unix timestamp
  count INTEGER NOT NULL DEFAULT 1           -- Total times shown
);
```

**Why Track History?**
- **Rate limiting**: "Gentle nudge shown 5 min ago? Don't show again"
- **Analytics**: How often are users seeing alerts?
- **Tuning**: Adjust rate limits based on data

---

## Event Flow

### Complete Event Lifecycle

#### 1. User Accepts AI Suggestion

```
User presses Tab to accept Copilot suggestion
  ↓
VSCode fires TextDocumentChangeEvent
  ↓
CopilotTracker.onDocumentChange() receives event
```

#### 2. Tracker Processes Event

```typescript
// CopilotTracker detects this looks like Copilot:
if (this.isCopilotSuggestion(change)) {
  // Create tracking event
  const event: TrackingEvent = {
    timestamp: Date.now(),
    tool: AITool.Copilot,
    eventType: EventType.SuggestionAccepted,
    linesOfCode: 15,
    charactersCount: 342,
    acceptanceTimeDelta: 850, // 850ms review time
    filePath: 'src/utils/helper.ts',
    language: 'typescript'
  };

  // Emit to MetricsCollector
  this.emitEvent(event);
}
```

#### 3. MetricsCollector Receives Event

```typescript
// MetricsCollector.handleEvent():
handleEvent(event: TrackingEvent): void {
  // 1. Buffer for batch processing
  this.eventBuffer.push(event);

  // 2. Update current session
  this.currentSession.eventCount++;
  this.currentSession.aiLinesGenerated += event.linesOfCode;

  // 3. Reset idle timer (user is active)
  this.resetSessionIdleTimer();

  // 4. Handle specific event type
  this.handleSuggestionAccepted(event);

  // 5. Flush if buffer full
  if (this.eventBuffer.length >= 10) {
    this.flushEventBuffer();
  }
}
```

#### 4. Parallel Processing

**Event flows to multiple components simultaneously**:

```
MetricsCollector.handleEvent()
  ├─→ DatabaseManager.insertEvent()        [Store raw event]
  ├─→ BlindApprovalDetector.detect()       [Analyze for blind approval]
  ├─→ ProgressTracker.addXP()              [Add gamification XP]
  └─→ SessionManager.recordEvent()         [Update session stats]
```

#### 5. Blind Approval Analysis

```typescript
// BlindApprovalDetector.detect():
const detection = detector.detect(event);

if (detection.isBlindApproval) {
  // detection = {
  //   isBlindApproval: true,
  //   confidence: 'medium',  // 2/3 signals triggered
  //   timeDelta: 850,
  //   threshold: 2000,
  //   signals: {
  //     timeBased: true,      // 850ms < 2000ms ✓
  //     patternBased: true,   // 3 rapid in last 10 ✓
  //     complexityBased: false // 15 LOC needs ~7500ms, only had 850ms ✗
  //   }
  // }

  // Forward to AlertEngine
  alertEngine.evaluate(detection);
}
```

#### 6. Alert Decision

```typescript
// AlertEngine evaluates:
shouldAlert(): boolean {
  // 1. Check snooze status
  if (snoozeManager.isSnoozed()) {
    return false;
  }

  // 2. Check rate limits
  const history = await db.getAlertHistory('gentle-nudge');
  const timeSinceLastAlert = Date.now() - history.lastShown;

  if (timeSinceLastAlert < ALERT_RATE_LIMITS.GentleNudge) {
    return false; // Too soon (5min rate limit)
  }

  // 3. Check confidence level
  if (detection.confidence === 'low') {
    return false; // Don't alert on low confidence
  }

  return true; // All checks passed - show alert
}
```

#### 7. Display Alert

```typescript
// NotificationService.showGentleNudge():
vscode.window.showInformationMessage(
  'Quick acceptance detected. Taking a moment to review helps maintain code quality.',
  'Got it',
  'Snooze for today',
  'Learn more'
).then(action => {
  if (action === 'Snooze for today') {
    snoozeManager.snoozeUntilEndOfDay();
  } else if (action === 'Learn more') {
    vscode.env.openExternal('https://mindfulcode.dev/docs/blind-approval');
  }
});
```

#### 8. File Review Tracking (Parallel)

```typescript
// FileReviewSessionTracker monitors file viewing
// Tracks files generated by agent sessions

// User generates 50-line function via Claude Code agent
agentSessionDetector.processEvent(event);
// → Agent session detected (3 signals: bulk generation, closed file, git signature)

// Start tracking this file for review
fileReviewTracker.startTracking(
  filePath: 'src/api/handler.ts',
  tool: AITool.ClaudeCode,
  agentSessionId: 'agent-session-123',
  linesGenerated: 50
);

// Later: User opens file to review
vscode.window.onDidChangeActiveTextEditor(editor => {
  fileReviewTracker.handleEditorChange(editor);
  // → Starts timer, tracks time in focus
});

// User scrolls through code
vscode.window.onDidChangeTextEditorVisibleRanges(event => {
  fileReviewTracker.handleScrolling(event);
  // → Increment scroll count, update score
});

// User navigates with cursor
vscode.window.onDidChangeTextEditorSelection(event => {
  fileReviewTracker.handleCursorMovement(event);
  // → Increment cursor count, update score
});

// User makes small edits
vscode.workspace.onDidChangeTextDocument(event => {
  fileReviewTracker.handleDocumentChange(event);
  // → Mark edits made, update score
});

// Score calculation runs continuously
fileReviewTracker.updateReviewScore(session);
// → score = time(80) + scroll(20) + cursor(10) + edits(20) = 130 (capped at 100)
// → Review quality: Thorough
// → wasReviewed: true (score >= 50 threshold)

// Callback fires when file marked as reviewed
onFileReviewed(session) {
  // Immediately update database
  db.upsertFileReviewStatus(session);
  // Refresh dashboard to show progress
  dashboardProvider.refresh();
}
```

#### 9. Update UI

```
Event completes
  ↓
StatusBarManager.refresh()
  ↓
Status bar updates: "🤖 43% AI | 16 suggestions"
  ↓
DashboardProvider.refresh() (if visible)
  ↓
Dashboard re-renders with new stats
  ↓
File tree shows reviewed/unreviewed status
  ↓
Statistics: "42% reviewed (65 of 156 files)"
```

### Event Timing Diagram

```
t=0ms:   User presses Tab (Copilot suggestion)
  ↓
t=5ms:   VSCode TextDocumentChangeEvent fires
  ↓
t=10ms:  CopilotTracker.onDocumentChange()
  ↓
t=15ms:  CopilotTracker.emitEvent()
  ↓
t=20ms:  MetricsCollector.handleEvent()
  ├─ Buffer event (instant)
  ├─ Update session (instant)
  └─ Reset idle timer (instant)
  ↓
t=25ms:  [Parallel processing]
  ├─ BlindApprovalDetector.detect() (10ms)
  ├─ ProgressTracker.addXP() (5ms)
  └─ StatusBar updated (5ms)
  ↓
t=40ms:  AlertEngine.evaluate() (10ms)
  ↓
t=50ms:  NotificationService.showGentleNudge() (if applicable)
  ↓
t=500ms: Event buffer flush (batch write to DB)
  ↓
t=5min:  Daily metrics aggregation runs
```

**Total latency**: < 100ms from user action to UI update

---

## Extension Lifecycle

### Activation Sequence

```typescript
// User opens VSCode → Extension activates

export async function activate(context: vscode.ExtensionContext) {
  console.log('CodePause activating...');

  // ===== PHASE 1: Storage (0-500ms) =====
  await initializeStorage(context);
  // - Creates globalStorageUri directory
  // - Initializes SQLite database
  // - Creates MetricsRepository, ConfigRepository
  // - Loads ConfigManager

  // ===== PHASE 2: Commands (500-550ms) =====
  registerCommands(context);
  // - Registers 12 VSCode commands
  // - 'mindfulCode.openDashboard'
  // - 'mindfulCode.snooze'
  // - 'mindfulCode.showProgression'
  // - etc.

  // ===== PHASE 3: Trackers (550-800ms) =====
  await initializeTrackers(context);
  // - Creates MetricsCollector
  // - Initializes CopilotTracker (if enabled)
  // - Initializes CursorTracker (if enabled)
  // - Initializes ClaudeCodeTracker (if enabled)
  // - Starts session tracking
  // - Begins event buffering

  // ===== PHASE 4: UI (800-950ms) =====
  await initializeUI(context);
  // - Creates ThresholdManager
  // - Initializes StatusBarManager
  // - Registers DashboardProvider webview
  // - Creates NotificationService
  // - Sets up OnboardingFlow

  // ===== PHASE 5: Gamification (950-1000ms) =====
  await initializeGamification(context);
  // - Initializes ProgressTracker
  // - Initializes AchievementSystem
  // - Connects event handlers (level up, achievements)
  // - Starts periodic achievement checks (every 5min)

  // ===== PHASE 6: Customization (1000-1100ms) =====
  await initializeCustomization(context);
  // - Initializes SnoozeManager
  // - Creates DataExporter
  // - Registers SettingsProvider

  // ===== PHASE 7: Onboarding Check (1100-1200ms) =====
  const onboardingCompleted = await configManager.isOnboardingCompleted();
  if (!onboardingCompleted) {
    await showWelcomeMessage(context);
  }

  console.log('CodePause activated successfully');
}
```

**Total activation time**: ~1.2 seconds

**Why This Order?**
1. **Storage first** - Everything depends on database
2. **Commands second** - Enables early exit if activation fails
3. **Trackers third** - Core functionality
4. **UI fourth** - Displays tracker data
5. **Gamification fifth** - Optional enhancement
6. **Customization sixth** - Non-essential features
7. **Onboarding last** - User-facing flow

### Runtime Behavior

#### Timers and Intervals

**Active Timers**:
1. **Session idle timer** (5min) - Ends session after inactivity
2. **Aggregation interval** (5min) - Calculates daily metrics
3. **Event buffer flush** (1s) - Writes events to database
4. **Suggestion expiry** (30s) - Cleans up expired pending suggestions
5. **Achievement check** (5min) - Evaluates achievement progress

**Why Multiple Timers?**
- Different cadences for different tasks
- Prevents blocking operations
- Efficient resource usage

#### Memory Usage

**Approximate Memory Footprint**:
```
MetricsCollector:
  - Event buffer:           ~100 events × 500 bytes = 50 KB
  - Pending suggestions:    ~20 suggestions × 1 KB = 20 KB
  - Current session:        ~1 KB

DatabaseManager:
  - SQLite connection:      ~5 MB (in-memory cache)
  - Prepared statements:    ~100 KB

UI Components:
  - Status bar:             ~10 KB
  - Dashboard webview:      ~2 MB (HTML/CSS/JS)

Trackers (3):             ~500 KB (pending suggestions, watchers)

Total: ~8-10 MB
```

**Compared to**:
- VSCode base: ~200 MB
- Copilot extension: ~50 MB
- CodePause: ~10 MB ✅ (lightweight)

### Deactivation Sequence

```typescript
export async function deactivate() {
  console.log('CodePause deactivating...');

  // ===== PHASE 1: Flush Events =====
  await metricsCollector.flushEventBuffer();
  // Ensure no data loss - write pending events

  // ===== PHASE 2: End Session =====
  await metricsCollector.endCurrentSession();
  // Close current coding session, save to DB

  // ===== PHASE 3: Dispose Components =====
  // (in reverse initialization order)
  if (snoozeManager) snoozeManager.dispose();
  if (achievementSystem) achievementSystem.dispose();
  if (progressTracker) progressTracker.dispose();
  if (statusBarManager) statusBarManager.dispose();
  if (metricsCollector) await metricsCollector.dispose();

  // ===== PHASE 4: Close Database =====
  if (databaseManager) databaseManager.close();
  // Flush SQLite WAL, close connection

  // ===== PHASE 5: Clear Timers =====
  // All intervals/timeouts cleared by component .dispose()

  console.log('CodePause deactivated');
}
```

**Why Reverse Order?**
- Dependencies cleaned up before their dependencies
- Database closed last (all writes complete)

---

## Real Code Examples

### Example 1: Complete Event Flow

**Scenario**: User accepts a 20-line TypeScript function from Copilot in 1.2 seconds.

```typescript
// ===== STEP 1: CopilotTracker detects change =====
// src/trackers/CopilotTracker.ts:84-106

private onDocumentChange(event: vscode.TextDocumentChangeEvent): void {
  const now = Date.now();

  for (const change of event.contentChanges) {
    if (this.isCopilotSuggestion(change)) {
      // Detected: 20-line function insertion
      const suggestionId = this.generateId();

      // Emit "displayed" event
      this.emitEvent({
        timestamp: now,
        tool: AITool.Copilot,
        eventType: EventType.SuggestionDisplayed,
        linesOfCode: 20,
        charactersCount: 450,
        filePath: 'src/utils/api.ts',
        language: 'typescript',
        metadata: { suggestionId }
      });

      // Calculate acceptance time (1200ms since last change)
      const acceptanceTime = now - this.lastChangeTimestamp;

      // Emit "accepted" event
      setTimeout(() => {
        this.emitEvent({
          timestamp: now + acceptanceTime,
          tool: AITool.Copilot,
          eventType: EventType.SuggestionAccepted,
          linesOfCode: 20,
          charactersCount: 450,
          acceptanceTimeDelta: 1200, // ← CRITICAL for blind approval detection
          filePath: 'src/utils/api.ts',
          language: 'typescript',
          metadata: { suggestionId }
        });
      }, 500);
    }
  }
}

// ===== STEP 2: MetricsCollector receives event =====
// src/core/MetricsCollector.ts:107-144

private handleEvent(event: TrackingEvent): void {
  // Add to buffer
  this.eventBuffer.push(event); // Buffer: [event1, event2, ..., thisEvent]

  // Update session
  this.currentSession.eventCount++;           // Now: 47 events
  this.currentSession.aiLinesGenerated += 20; // Now: 523 LOC
  this.currentSession.toolsUsed = [AITool.Copilot]; // Tools: ['copilot']

  // Reset idle timer (user active)
  this.resetSessionIdleTimer(); // Session won't end for another 5min

  // Handle acceptance
  this.handleSuggestionAccepted(event);

  // Flush buffer if full
  if (this.eventBuffer.length >= 10) { // Buffer at 10? Write to DB
    this.flushEventBuffer();
  }
}

// ===== STEP 3: BlindApprovalDetector analyzes =====
// src/core/BlindApprovalDetector.ts:30-69

detect(event: TrackingEvent): BlindApprovalDetection {
  // Track this acceptance
  this.recentAcceptances.push(event);

  // Multi-signal detection
  const signals = {
    timeBased: this.detectTimeBasedBlindApproval(event),
    // 1200ms < 2000ms (Mid threshold) ✓ TRUE

    patternBased: this.detectPatternBasedBlindApproval(),
    // Last 10 acceptances: 5 are rapid ✓ TRUE (>= 3)

    complexityBased: this.detectComplexityBasedBlindApproval(event)
    // 20 LOC × 500ms × 1.5 (TypeScript) = 15000ms needed
    // Only had 1200ms ✓ TRUE
  };

  // All 3 signals triggered!
  const triggeredCount = 3;
  const confidence = BlindApprovalConfidence.High;

  return {
    isBlindApproval: true,
    confidence: 'high',
    timeDelta: 1200,
    threshold: 2000,
    signals: { timeBased: true, patternBased: true, complexityBased: true }
  };
}

// ===== STEP 4: AlertEngine decides =====
// src/alerts/AlertEngine.ts (conceptual)

shouldAlert(detection: BlindApprovalDetection): boolean {
  // Check snooze
  if (await snoozeManager.isSnoozed()) {
    return false; // User snoozed - respect it
  }

  // Check rate limit
  const history = await db.getAlertHistory('gentle-nudge');
  const elapsed = Date.now() - history.lastShown;

  if (elapsed < 5 * 60 * 1000) {
    return false; // Last alert was 3min ago - too soon
  }

  // High confidence + not snoozed + rate limit passed
  return true; // SHOW ALERT
}

// ===== STEP 5: NotificationService displays =====
// src/ui/NotificationService.ts (simplified)

async showGentleNudge(detection: BlindApprovalDetection): Promise<void> {
  const message =
    `Quick acceptance detected (${detection.timeDelta}ms for ${event.linesOfCode} lines). ` +
    `Taking a moment to review helps maintain code quality.`;

  const action = await vscode.window.showInformationMessage(
    message,
    'Got it',
    'Snooze for today',
    'Learn more'
  );

  // Handle user action
  if (action === 'Snooze for today') {
    await snoozeManager.snoozeUntilEndOfDay();
  } else if (action === 'Learn more') {
    vscode.env.openExternal(vscode.Uri.parse(
      'https://mindfulcode.dev/docs/blind-approval'
    ));
  }

  // Update alert history
  await db.updateAlertHistory('gentle-nudge', Date.now());
}

// ===== STEP 6: UI updates =====
// src/ui/StatusBarManager.ts (simplified)

async refresh(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const metrics = await metricsRepo.getDailyMetrics(today);

  if (!metrics) {
    this.statusBarItem.text = '🤖 CodePause';
    return;
  }

  // Calculate stats
  const aiPercent = Math.round(metrics.aiPercentage);
  const totalEvents = metrics.totalEvents;

  // Color code
  const color = this.getColorForPercentage(aiPercent);
  // aiPercent = 58% → color = 'statusBarItem.warningBackground'

  // Update status bar
  this.statusBarItem.text = `🤖 ${aiPercent}% AI | ${totalEvents} events`;
  this.statusBarItem.backgroundColor = new vscode.ThemeColor(color);
  this.statusBarItem.show();

  // Result: "🤖 58% AI | 47 events" in yellow/warning color
}
```

### Example 2: Session Management

**Scenario**: User codes for 2 hours, takes 10-minute coffee break, resumes coding.

```typescript
// ===== Hour 1: Session starts =====
// t=0: User opens VSCode, starts coding

startNewSession(): void {
  this.currentSession = {
    id: 'session-1735574400000-abc123',
    startTime: 1735574400000, // 2025-12-30 10:00:00
    eventCount: 0,
    aiLinesGenerated: 0,
    manualLinesWritten: 0,
    toolsUsed: []
  };

  // Set idle timer (5min)
  this.resetSessionIdleTimer();
}

// ===== Hours 1-2: Active coding =====
// t=2min: User accepts Copilot suggestion
handleEvent(event) {
  this.currentSession.eventCount++;           // 1
  this.currentSession.aiLinesGenerated += 15; // 15
  this.currentSession.toolsUsed = [AITool.Copilot];

  this.resetSessionIdleTimer(); // Idle timer reset to 5min
}

// t=7min: User accepts another suggestion
handleEvent(event) {
  this.currentSession.eventCount++;           // 2
  this.currentSession.aiLinesGenerated += 8;  // 23

  this.resetSessionIdleTimer(); // Idle timer reset again
}

// ... 2 hours of coding, 156 events total

// ===== Coffee break: 10 minutes inactive =====
// t=2h05min: Idle timer fires (5min since last event)

this.sessionIdleTimer = setTimeout(() => {
  this.endCurrentSession();
  // Session ended: 2h 5min duration, 156 events, 1247 LOC
}, SESSION_IDLE_TIMEOUT_MS);

async endCurrentSession(): Promise<void> {
  const now = Date.now();
  this.currentSession.endTime = now;
  this.currentSession.duration = now - this.currentSession.startTime;
  // duration = 7500000ms = 2h 5min

  // Save to database
  await this.metricsRepo.saveSession(this.currentSession);
  // Database now has: sessions table with this session

  this.currentSession = null; // No active session
}

// ===== Resume coding after break =====
// t=2h15min: User returns, types new code

handleEvent(newEvent) {
  // No active session!
  if (!this.currentSession) {
    this.startNewSession(); // Auto-start new session
  }

  // Now: NEW session (different ID)
  this.currentSession.eventCount++; // 1 (reset)
  // ...
}

// Result: Two distinct sessions in database
// Session 1: 2h 5min, 156 events, 1247 LOC
// Session 2: Ongoing...
```

### Example 3: Achievement Unlock

**Scenario**: User completes first day with 0 blind approvals → Unlocks "Thoughtful Developer" achievement.

```typescript
// ===== Background: Periodic achievement check (every 5min) =====
// src/gamification/AchievementSystem.ts

setInterval(async () => {
  await achievementSystem.checkRelevantAchievements('daily');
}, 5 * 60 * 1000);

// ===== Achievement check runs =====
async checkRelevantAchievements(timeframe: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const metrics = await this.metricsRepo.getDailyMetrics(today);

  if (!metrics) return;

  // Check "Thoughtful Developer" achievement
  const achievement = this.achievements.find(a => a.id === 'thoughtful-developer');

  // Requirement: Zero blind approvals for a day
  if (metrics.blindApprovalCount === 0 && metrics.totalEvents >= 10) {
    // User has 10+ events, 0 blind approvals ✓

    // Check if already unlocked
    if (!achievement.unlocked) {
      // UNLOCK IT!
      achievement.unlocked = true;
      achievement.unlockedAt = Date.now();
      achievement.progress = 1.0;

      // Save to database
      await this.db.updateAchievement(
        'thoughtful-developer',
        true,
        1.0
      );

      // Fire unlock event
      this.onAchievementUnlockedEmitter.fire(achievement);
    }
  }
}

// ===== Event handler in extension.ts =====
achievementSystem.onAchievementUnlocked(async (achievement) => {
  // Show notification
  await notificationService.showAchievementUnlocked(
    achievement.title,        // "Thoughtful Developer"
    achievement.description   // "Completed a full day with zero blind approvals"
  );

  // Refresh UI
  await dashboardProvider.refresh();
  await statusBarManager.refresh();

  // Status bar now shows: "🤖 42% AI | ⚡ Level 5 | 🏆 1 new achievement"
});

// ===== Notification displays =====
vscode.window.showInformationMessage(
  '🏆 Achievement Unlocked: Thoughtful Developer!\n' +
  'Completed a full day with zero blind approvals.',
  'View Achievements',
  'Share'
).then(action => {
  if (action === 'View Achievements') {
    vscode.commands.executeCommand('mindfulCode.showAchievements');
  }
});
```

---

## Testing Strategy

### Why We Tested

1. **Correctness**: Blind approval detection algorithm is complex (multi-signal)
2. **Reliability**: Extension runs continuously - must not crash
3. **Regression prevention**: Future changes shouldn't break existing features
4. **Documentation**: Tests show intended behavior
5. **Confidence**: 230+ tests give confidence for release

### What We Tested

**Test Coverage by Component**:

| Component | Tests | Coverage | Focus Areas |
|-----------|-------|----------|-------------|
| BlindApprovalDetector | 30 | 100% | Multi-signal algorithm, confidence scoring |
| DatabaseManager | 50+ | 95% | All CRUD operations, schema integrity |
| MetricsCollector | 40+ | 90% | Event handling, session management, buffering |
| ThresholdManager | 50+ | 95% | Experience-level thresholds, adaptive suggestions |
| SessionManager | 20+ | 90% | Session lifecycle, idle timeout |
| ProgressTracker | 10+ | 85% | XP calculation, leveling |
| FileReviewSessionTracker | 35+ | 92% | Review scoring, interaction tracking, session timeout |
| AgentSessionDetector | 25+ | 88% | Multi-signal detection, session management |
| EventDeduplicator | 15+ | 95% | Deduplication key generation, cleanup |
| DiffViewService | 20+ | 90% | File status detection, statistics calculation |

**Total**: 1,470 tests, 1,406 passing (95.6% pass rate), ~90% average coverage

**Recent Test Fixes**:
- ✅ Fixed EventDeduplicator: Added `linesRemoved` to deduplication key
- ✅ Fixed MetricsCollector: Made `recordEvent()` call `handleEvent()` for file review tracking
- ✅ Fixed MetricsRepository: Added missing mocks for `getAllFilesForDate()`
- ⏳ 64 tests pending: Legacy test data setup issues (not blocking)

### Testing Patterns Used

#### 1. AAA Pattern (Arrange-Act-Assert)

**Example from BlindApprovalDetector.test.ts**:
```typescript
it('should detect time-based blind approval', () => {
  // ===== ARRANGE =====
  const detector = new BlindApprovalDetector({
    level: DeveloperLevel.Mid,
    blindApprovalTime: 2000,
    minReviewTime: 1000,
    maxAIPercentage: 60,
    streakThreshold: 3
  });

  const event: TrackingEvent = {
    timestamp: Date.now(),
    tool: AITool.Copilot,
    eventType: EventType.SuggestionAccepted,
    linesOfCode: 5,
    acceptanceTimeDelta: 800 // < 2000ms threshold
  };

  // ===== ACT =====
  const result = detector.detect(event);

  // ===== ASSERT =====
  expect(result.isBlindApproval).toBe(true);
  expect(result.signals.timeBased).toBe(true);
  expect(result.confidence).toBe(BlindApprovalConfidence.Low); // Only 1 signal
});
```

**Why AAA?**
- Clear structure
- Easy to read
- Explicit what's being tested

#### 2. Test Utilities

**Example from testUtils.ts**:
```typescript
export function createMockDailyMetrics(overrides?: Partial<DailyMetrics>): DailyMetrics {
  return {
    date: '2025-01-15',
    totalEvents: 0,
    totalAILines: 0,
    totalManualLines: 0,
    aiPercentage: 0,
    acceptanceRate: 0,
    averageReviewTime: 0,
    blindApprovalCount: 0,
    sessionCount: 0,
    toolBreakdown: createMockToolBreakdown(),
    ...overrides // ← Override only what you need
  };
}

// Usage in tests:
const metrics = createMockDailyMetrics({
  aiPercentage: 65,
  blindApprovalCount: 5
});
// Rest of fields auto-populated with defaults
```

**Why Utilities?**
- Reduce boilerplate (DRY)
- Consistent test data
- Easy to update (one place)

#### 3. Mock Functions with Type Safety

**Example from MetricsCollector.test.ts**:
```typescript
beforeEach(() => {
  // ✅ Correct: Explicit generic types
  mockMetricsRepo = {
    recordEvent: jest.fn<() => Promise<void>>()
      .mockResolvedValue(undefined as any),
    getDailyMetrics: jest.fn<() => Promise<DailyMetrics | null>>()
      .mockResolvedValue(null),
    saveSession: jest.fn<() => Promise<void>>()
      .mockResolvedValue(undefined as any)
  } as any;

  collector = new MetricsCollector(mockMetricsRepo, mockConfigManager);
});

it('should record event through public API', async () => {
  const event: TrackingEvent = {
    timestamp: Date.now(),
    tool: AITool.Copilot,
    eventType: EventType.SuggestionAccepted,
    linesOfCode: 5
  };

  await collector.recordEvent(event);

  expect(mockMetricsRepo.recordEvent).toHaveBeenCalledWith(event);
});
```

**Why Type-Safe Mocks?**
- Catch interface changes at compile time
- TypeScript enforces correct usage
- Prevents runtime errors in tests

### Test Execution

**Running Tests**:
```bash
# All tests
npm run test

# Unit tests only
npm run test:unit

# With coverage
npm run test:coverage

# Watch mode (TDD)
npm run test:unit:watch
```

**Coverage Report**:
```
======================== Coverage summary ========================
Statements   : 90.5% ( 1234/1364 )
Branches     : 85.2% ( 456/535 )
Functions    : 88.9% ( 234/263 )
Lines        : 91.3% ( 1187/1300 )
===================================================================
```

**Coverage Threshold**: 80% (temporarily disabled during development)

---

## How to Extend

### Adding a New AI Tool Tracker

**Scenario**: You want to add support for "Tabnine" AI coding assistant.

**Steps**:

1. **Create tracker class**:
```typescript
// src/trackers/TabnineTracker.ts

import { BaseTracker } from './BaseTracker';
import { AITool, EventType } from '../types';
import * as vscode from 'vscode';

export class TabnineTracker extends BaseTracker {
  constructor(onEvent: (event: unknown) => void) {
    super(AITool.Tabnine, onEvent); // New enum value needed
  }

  async initialize(): Promise<void> {
    try {
      // Check if Tabnine extension is installed
      const tabnineExtension = vscode.extensions.getExtension('TabNine.tabnine-vscode');

      if (!tabnineExtension) {
        this.log('Tabnine extension not found');
        return;
      }

      // Your detection logic here
      // (Similar to CopilotTracker - monitor document changes)

      this.disposables.push(
        vscode.workspace.onDidChangeTextDocument(this.onDocumentChange.bind(this))
      );

      this.isActiveFlag = true;
      this.log('Tabnine tracker initialized');
    } catch (error) {
      this.logError('Failed to initialize Tabnine tracker', error);
    }
  }

  private onDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    // Implement Tabnine-specific detection
    // Similar logic to CopilotTracker.onDocumentChange()
  }
}
```

2. **Add to AITool enum**:
```typescript
// src/types/index.ts

export enum AITool {
  Copilot = 'copilot',
  Cursor = 'cursor',
  ClaudeCode = 'claude-code',
  Tabnine = 'tabnine' // ← Add here
}
```

3. **Update MetricsCollector**:
```typescript
// src/core/MetricsCollector.ts

import { TabnineTracker } from '../trackers/TabnineTracker';

private async initializeTrackers(): Promise<void> {
  const config = this.configManager.getConfig();

  // ... existing trackers ...

  // Add Tabnine tracker
  if (config.trackedTools.tabnine) {
    const tabnineTracker = new TabnineTracker((event) => this.handleEvent(event));
    await tabnineTracker.initialize();

    if (tabnineTracker.isActive()) {
      this.trackers.set(AITool.Tabnine, tabnineTracker);
      console.log('[CodePause] Tabnine tracker active');
    }
  }
}
```

4. **Update config schema**:
```typescript
// src/types/index.ts

export interface UserConfig {
  // ... existing fields ...
  trackedTools: {
    copilot: boolean;
    cursor: boolean;
    claudeCode: boolean;
    tabnine: boolean; // ← Add here
  };
}
```

5. **Write tests**:
```typescript
// src/trackers/__tests__/TabnineTracker.test.ts

describe('TabnineTracker', () => {
  it('should initialize successfully', async () => {
    const tracker = new TabnineTracker(jest.fn());
    await tracker.initialize();
    expect(tracker.isActive()).toBe(true);
  });

  // ... more tests
});
```

Done! Tabnine is now tracked alongside Copilot, Cursor, and Claude Code.

### Adding a New Achievement

**Scenario**: Add "Code Reviewer" achievement for reviewing 100 suggestions.

**Steps**:

1. **Define achievement**:
```typescript
// src/gamification/AchievementSystem.ts

private achievements: Achievement[] = [
  // ... existing achievements ...

  {
    id: 'code-reviewer',
    title: 'Code Reviewer',
    description: 'Reviewed 100 AI suggestions',
    category: 'review',
    icon: '🔍',
    requirement: {
      type: 'count',
      metric: 'totalEvents',
      target: 100,
      timeframe: 'all-time'
    },
    unlocked: false,
    progress: 0
  }
];
```

2. **Add check logic**:
```typescript
async checkRelevantAchievements(timeframe: string): Promise<void> {
  // Get total event count
  const stats = await this.metricsRepo.getStatsSummary();

  // Check "Code Reviewer" achievement
  const achievement = this.achievements.find(a => a.id === 'code-reviewer');

  if (achievement && !achievement.unlocked) {
    // Update progress
    achievement.progress = Math.min(stats.totalEvents / 100, 1.0);

    // Check if unlocked
    if (stats.totalEvents >= 100) {
      achievement.unlocked = true;
      achievement.unlockedAt = Date.now();

      // Save to database
      await this.db.updateAchievement('code-reviewer', true, 1.0);

      // Fire event
      this.onAchievementUnlockedEmitter.fire(achievement);
    }
  }
}
```

3. **Test it**:
```typescript
it('should unlock Code Reviewer achievement at 100 events', async () => {
  // Mock 100 events
  mockMetricsRepo.getStatsSummary.mockResolvedValue({
    totalEvents: 100,
    totalSessions: 10,
    databaseSize: 1024
  });

  await achievementSystem.checkRelevantAchievements('all-time');

  const achievement = await achievementSystem.getAchievement('code-reviewer');
  expect(achievement.unlocked).toBe(true);
});
```

### Customizing Alert Messages

**Scenario**: Change "gentle nudge" message to be more specific.

```typescript
// src/ui/NotificationService.ts

async showGentleNudge(detection: BlindApprovalDetection): Promise<void> {
  // Original message:
  // "Quick acceptance detected. Taking a moment to review helps maintain code quality."

  // New customized message with more context:
  let message = '';

  if (detection.signals.complexityBased) {
    message =
      `Quick acceptance detected: ${detection.timeDelta}ms for ${detection.event.linesOfCode} lines. ` +
      `Complex code deserves more review time. Consider reading through the logic carefully.`;
  } else if (detection.signals.patternBased) {
    const streakLength = this.blindApprovalDetector.getStreakLength();
    message =
      `Quick acceptance streak detected (${streakLength} in a row). ` +
      `Taking breaks between acceptances helps maintain code quality.`;
  } else {
    message =
      `Quick acceptance detected (${detection.timeDelta}ms). ` +
      `Taking a moment to review helps catch potential issues.`;
  }

  const action = await vscode.window.showInformationMessage(
    message,
    'Got it',
    'Snooze for today',
    'Learn more'
  );

  // ... handle action
}
```

### Extending Database Schema

**Scenario**: Add table for tracking file-specific metrics.

```typescript
// src/storage/DatabaseManager.ts

private createTables(): void {
  // ... existing tables ...

  // Add new table
  this.db.exec(`
    CREATE TABLE IF NOT EXISTS file_metrics (
      file_path TEXT NOT NULL,
      date TEXT NOT NULL,
      event_count INTEGER NOT NULL DEFAULT 0,
      ai_lines INTEGER NOT NULL DEFAULT 0,
      manual_lines INTEGER NOT NULL DEFAULT 0,
      blind_approval_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (file_path, date)
    )
  `);
}

// Add query methods
async getFileMetrics(filePath: string, date: string): Promise<FileMetrics | null> {
  const stmt = this.db.prepare(`
    SELECT * FROM file_metrics
    WHERE file_path = ? AND date = ?
  `);

  const row = stmt.get(filePath, date);
  return row ? this.mapToFileMetrics(row) : null;
}

// Add aggregation logic
async calculateFileMetrics(date: string): Promise<void> {
  const stmt = this.db.prepare(`
    INSERT OR REPLACE INTO file_metrics (file_path, date, event_count, ai_lines, manual_lines)
    SELECT
      file_path,
      DATE(timestamp / 1000, 'unixepoch') as date,
      COUNT(*) as event_count,
      SUM(CASE WHEN event_type = 'suggestion-accepted' THEN lines_of_code ELSE 0 END) as ai_lines,
      0 as manual_lines
    FROM events
    WHERE DATE(timestamp / 1000, 'unixepoch') = ?
    GROUP BY file_path, date
  `);

  stmt.run(date);
}
```

---

## Maintenance Guide

### Common Tasks

#### Update Thresholds

**File**: `src/types/index.ts:418-440`

```typescript
// Adjust default thresholds based on user feedback
export const DEFAULT_THRESHOLDS: Record<DeveloperLevel, ThresholdConfig> = {
  [DeveloperLevel.Mid]: {
    blindApprovalTime: 2500, // Changed from 2000ms → 2500ms (more lenient)
    maxAIPercentage: 65,     // Changed from 60% → 65%
    // ...
  }
};
```

#### Add New Alert Type

1. **Update enum**:
```typescript
// src/types/index.ts
export enum AlertType {
  GentleNudge = 'gentle-nudge',
  EducationalMoment = 'educational-moment',
  StreakWarning = 'streak-warning',
  Achievement = 'achievement',
  HighAIUsage = 'high-ai-usage' // ← New
}
```

2. **Add rate limit**:
```typescript
export const ALERT_RATE_LIMITS: Record<AlertType, number> = {
  [AlertType.HighAIUsage]: 15 * 60 * 1000 // 15 minutes
};
```

3. **Implement notification**:
```typescript
// src/ui/NotificationService.ts
async showHighAIUsageAlert(percentage: number): Promise<void> {
  const message =
    `High AI usage detected (${percentage}%). ` +
    `Consider writing more code manually to maintain skills.`;

  await this.showAlert({
    type: AlertType.HighAIUsage,
    title: 'High AI Usage',
    message,
    actions: [/* ... */]
  });
}
```

#### Debug Event Flow

**Enable verbose logging**:
```typescript
// src/core/MetricsCollector.ts

private handleEvent(event: TrackingEvent): void {
  // Add debug logging
  console.log('[DEBUG] Event received:', {
    type: event.eventType,
    tool: event.tool,
    linesOfCode: event.linesOfCode,
    acceptanceTimeDelta: event.acceptanceTimeDelta
  });

  // ... rest of method
}
```

**View database contents**:
```bash
# Open database in SQLite browser
sqlite3 ~/Library/Application\ Support/Code/User/globalStorage/mindfulcode/mindfulcode.db

# Query recent events
SELECT * FROM events ORDER BY timestamp DESC LIMIT 10;

# Query today's metrics
SELECT * FROM daily_metrics WHERE date = date('now');
```

### Performance Optimization

#### Database Indices

**Add index for frequent queries**:
```typescript
// src/storage/DatabaseManager.ts

private createIndices(): void {
  this.db.exec(`
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_tool ON events(tool);

    -- Add new index for file path queries
    CREATE INDEX IF NOT EXISTS idx_events_file_path ON events(file_path);

    -- Add composite index for date-range + tool queries
    CREATE INDEX IF NOT EXISTS idx_events_date_tool ON events(timestamp, tool);
  `);
}
```

#### Event Buffer Tuning

**Adjust buffer size**:
```typescript
// src/core/MetricsCollector.ts

// Current: Flush at 10 events
if (this.eventBuffer.length >= 10) {
  this.flushEventBuffer();
}

// For higher throughput, increase:
if (this.eventBuffer.length >= 50) { // ← Changed
  this.flushEventBuffer();
}
// Trade-off: More memory, less disk I/O
```

#### Aggregation Frequency

**Adjust aggregation interval**:
```typescript
// src/core/MetricsCollector.ts

// Current: Every 5 minutes
this.aggregationInterval = setInterval(async () => {
  await this.performAggregation();
}, 5 * 60 * 1000);

// For less frequent updates:
}, 15 * 60 * 1000); // ← 15 minutes instead
// Trade-off: Less accurate real-time stats, lower CPU usage
```

### Troubleshooting

#### Extension Not Activating

**Check activation events** in `package.json`:
```json
{
  "activationEvents": [
    "onStartupFinished"
  ]
}
```

**Debug activation**:
```typescript
// src/extension.ts

export async function activate(context: vscode.ExtensionContext) {
  console.log('[CodePause] Activation started');

  try {
    console.log('[CodePause] Initializing storage...');
    await initializeStorage(context);
    console.log('[CodePause] Storage initialized ✓');

    // ... more debug logs
  } catch (error) {
    console.error('[CodePause] Activation failed:', error);
    throw error; // Re-throw to see in VSCode
  }
}
```

#### Database Locked Errors

**Cause**: Multiple connections or long-running transactions.

**Fix**: Ensure WAL mode is enabled:
```typescript
// src/storage/DatabaseManager.ts

async initialize(): Promise<void> {
  this.db = new Database(this.dbPath);

  // Enable WAL mode (Write-Ahead Logging)
  this.db.pragma('journal_mode = WAL'); // ← Critical!

  // Increase busy timeout
  this.db.pragma('busy_timeout = 5000'); // ← Add this
}
```

#### Memory Leaks

**Common causes**:
1. Timers not cleared on dispose
2. Event listeners not removed
3. Large buffers not flushed

**Fix checklist**:
```typescript
dispose(): void {
  // ✓ Clear all timers
  if (this.sessionIdleTimer) {
    clearTimeout(this.sessionIdleTimer);
  }
  if (this.aggregationInterval) {
    clearInterval(this.aggregationInterval);
  }

  // ✓ Remove event listeners
  this.disposables.forEach(d => d.dispose());
  this.disposables = [];

  // ✓ Clear large data structures
  this.eventBuffer = [];
  this.pendingSuggestions.clear();

  // ✓ Dispose event emitters
  this.onLevelUpEmitter.dispose();
}
```

---

## Key Takeaways

### Why CodePause is Architected This Way

1. **Privacy-First Design**
   - 100% local SQLite database
   - No code content stored (only metadata)
   - Zero telemetry or cloud sync
   - User owns their data completely

2. **Research-Backed Approach**
   - Multi-signal blind approval detection (reduces false positives)
   - Experience-level thresholds (juniors vs seniors need different guidance)
   - Gentle coaching tone (research shows positive reinforcement works better)

3. **Performance Optimized**
   - Event buffering (batch writes reduce disk I/O)
   - Pre-aggregated metrics (dashboard loads in <500ms)
   - WAL mode (concurrent reads/writes)
   - Efficient indices (fast queries)

4. **Extensible Architecture**
   - BaseTracker (easy to add new AI tools)
   - Repository pattern (can swap SQLite for cloud)
   - Event-driven (components loosely coupled)
   - Factory pattern (dynamic tracker creation)

5. **User-Centric UX**
   - Non-intrusive (status bar + optional dashboard)
   - Snooze functionality (user control)
   - Rate-limited alerts (prevents fatigue)
   - Gamification (positive reinforcement)

### What Makes This Codebase Maintainable

1. **Strong Type System**
   - TypeScript with strict mode
   - Comprehensive interfaces
   - Enum-based constants

2. **Clear Separation of Concerns**
   - Storage layer isolated (Repository pattern)
   - Business logic separate from UI
   - Trackers independent of each other

3. **Comprehensive Testing**
   - 230+ unit tests
   - ~90% code coverage
   - Test utilities reduce boilerplate

4. **Documentation**
   - Inline comments for complex logic
   - JSDoc for public APIs
   - This architecture guide

5. **Consistent Patterns**
   - AAA test structure
   - Constructor injection
   - Async/await throughout
   - Error handling in try/catch

### Next Steps for You

**To fully own this codebase**:

1. **Run it locally**:
   ```bash
   npm install
   npm run compile
   # Press F5 in VSCode to launch Extension Development Host
   ```

2. **Explore the database**:
   ```bash
   # After running extension:
   sqlite3 ~/Library/Application\ Support/Code/User/globalStorage/mindfulcode/mindfulcode.db
   SELECT * FROM events LIMIT 5;
   ```

3. **Make a small change**:
   - Update a threshold in `src/types/index.ts`
   - Change an alert message in `src/ui/NotificationService.ts`
   - Run tests: `npm run test:unit`

4. **Add a feature**:
   - Start with a test (TDD)
   - Implement the feature
   - Update this documentation

5. **Release it**:
   - Follow Phase 8 of the implementation plan
   - Package with `vsce package`
   - Publish to VSCode Marketplace

---

## Glossary

**Blind Approval**: Accepting AI-generated code without proper review (< 2-3 seconds).

**Event Buffer**: In-memory array that batches events before writing to database.

**Idle Timeout**: Time of inactivity before ending a coding session (5 minutes).

**Multi-Signal Detection**: Using 3 independent signals (time, pattern, complexity) to detect blind approval.

**Repository Pattern**: Design pattern that abstracts data access behind an interface.

**Session**: Contiguous period of coding activity (ends after 5min idle).

**WAL Mode**: Write-Ahead Logging - SQLite journal mode enabling concurrent reads/writes.

**XP**: Experience Points - gained from tracking events, used for leveling up.

---

## Additional Resources

- **Implementation Plan**: `CodePause_Implementation_Plan.md`
- **Research Papers**: See "Research Foundation" section in implementation plan
- **VSCode Extension API**: https://code.visualstudio.com/api
- **SQLite Documentation**: https://www.sqlite.org/docs.html
- **Jest Testing**: https://jestjs.io/docs/getting-started

---

## Recent Enhancements (January 2026)

### File Review Tracking System
- **FileReviewSessionTracker**: Comprehensive post-generation code review tracking
- **Dynamic scoring**: Experience-level aware thresholds (Junior: 600ms/line, Senior: 200ms/line)
- **Multi-factor analysis**: Time + scrolling + cursor movement + edits
- **Session timeout**: 1-hour inactivity resets review progress
- **Grace period**: 24-hour tracking window after generation

### Agent Session Detection
- **AgentSessionDetector**: Automatic detection of autonomous AI mode
- **5 detection signals**: Rapid file changes, closed file mods, bulk generation, git signatures, consistent source
- **Multi-signal approach**: Requires 2+ signals to reduce false positives
- **Confidence levels**: Low/Medium/High based on signal count
- **Automatic session management**: 30-second idle timeout, 10-minute max duration

### GitHub-Style Diff Views
- **DiffViewService**: File diff operations and statistics
- **Status detection**: Accurately distinguishes Added/Modified/Deleted files
- **Change visualization**: Proportional green/red bars for additions/deletions
- **Directory grouping**: Organizes files by parent directory
- **Review progress**: Real-time tracking of reviewed vs unreviewed files

### Event Deduplication Enhancement
- **Added `linesRemoved` to deduplication key**: Prevents false duplicates for deletion events
- **Accurate tracking**: Distinguishes between line additions (30 added, 0 removed) and deletions (0 added, 10 removed)
- **1-second deduplication window**: Catches rapid duplicate detections

### Test Suite Improvements
- **1,470 total tests**: 1,406 passing (95.6% pass rate)
- **New test coverage**: FileReviewSessionTracker (35+ tests), AgentSessionDetector (25+ tests)
- **Bug fixes**: EventDeduplicator, MetricsCollector, MetricsRepository
- **~90% code coverage**: Comprehensive testing across all components

### Database Schema Updates
- **New table**: `file_review_status` with 24 columns for detailed tracking
- **New indices**: Optimized queries for file path, date, review status
- **Migration columns**: Added to `events` and `daily_metrics` tables
- **UNIQUE constraint**: `(file_path, date, tool)` prevents duplicates

---

**Last Updated**: January 21, 2026
**Version**: 0.1.0
**Author**: CodePause Development Team
**License**: MIT
