# Code Ownership Score

**How thoroughly you review and understand the AI code you accept.**

## Quick Summary

Code Ownership Score measures the quality of your review process for AI-generated code. It's scored from 0-100 based on time spent reviewing, scrolling activity, cursor movement, and edits made. A score of 70+ means "thorough review", 40-69 is "light review", and below 40 suggests rushed or no review.

---

## Why It Matters

Accepting AI code without review is like merging PRs without reading them. This metric matters because:

- **You own the bugs** - If AI introduces a bug and you didn't review it, that's on you
- **Security vulnerabilities** - AI doesn't understand your security requirements
- **Maintainability debt** - Unreviewed code becomes technical debt within days
- **Learning opportunity lost** - Reviewing code is how you improve and learn patterns
- **Team impact** - Your unreviewed code becomes someone else's problem

**The Reality:** GitHub data shows 30% of developers accept AI suggestions without meaningful review. Don't be part of that statistic.

---

## How It's Calculated

The Code Ownership Score is a weighted formula based on four factors:

```typescript
Code Ownership Score =
  (Time in Focus × 40%) +
  (Scroll Activity × 20%) +
  (Cursor Movement × 20%) +
  (Edits Made × 20%)

Where each component is scored 0-100:

1. Time in Focus (40% weight)
   - Expected time = Lines of Code × 500ms
   - Minimum: 10 seconds
   - Maximum: 120 seconds
   - Score = (Actual Time / Expected Time) × 100
   - Capped at 100 even if you exceed expected time

2. Scroll Activity (20% weight)
   - Measures whether you scrolled through the code
   - 0 scroll events = 0 points
   - 1-3 scroll events = 50 points (quick scan)
   - 4+ scroll events = 100 points (thorough review)

3. Cursor Movement (20% weight)
   - Tracks cursor interactions with the code
   - 0 movements = 0 points
   - 1-5 movements = 50 points (light interaction)
   - 6+ movements = 100 points (active engagement)

4. Edits Made (20% weight)
   - Did you modify the AI-generated code?
   - No edits = 0 points
   - Any edit = 100 points (shows active ownership)
```

### What Counts as Activity?

**Time in Focus:**
- File must be the active editor
- Window must be focused (not in background)
- Time starts when file opens after AI generation
- Pauses when you switch files or windows

**Scroll Events:**
- Mouse wheel scrolling
- Trackpad scrolling
- Keyboard scrolling (arrow keys, Page Up/Down)
- Jump-to-line commands

**Cursor Movements:**
- Clicking into the code
- Moving cursor with keyboard
- Selecting text
- Hovering over symbols (shows intent to inspect)

**Edits:**
- Any character addition/deletion
- Formatting changes
- Refactoring
- Adding comments

---

## What Good Looks Like

### Score Ranges & Categories

| Score Range | Category | What It Means | Status |
|------------|----------|---------------|--------|
| **70-100** | Thorough | You spent adequate time reviewing, scrolled through code, moved cursor, and likely made edits. This is proper code ownership. | ✅ Green |
| **40-69** | Light | You looked at the code but review was superficial. May have scrolled or clicked but limited engagement. | ⚠️ Yellow |
| **0-39** | Rushed/None | Minimal or no review. File opened briefly or accepted without inspection. High risk. | 🚨 Red |

### What Different Scores Look Like

**Score: 95 (Thorough)**
```
Behavior:
- Opened file immediately after AI generation
- Spent 45 seconds reviewing 30 lines of code
- Scrolled through entire file twice
- Clicked into 8 different locations
- Modified 3 lines to match your code style
- Added a comment explaining complex logic

Interpretation: Excellent ownership. You understand this code.
```

**Score: 55 (Light)**
```
Behavior:
- Opened file 2 minutes after generation
- Spent 8 seconds on 25 lines (too fast)
- Scrolled once through the file
- Clicked into 2 locations
- Made no edits

Interpretation: Cursory glance. You know code exists but may not understand details.
```

**Score: 15 (Rushed)**
```
Behavior:
- Opened file briefly or never opened it
- Spent 2 seconds on 40 lines
- No scrolling
- No cursor movement
- No edits

Interpretation: Blind acceptance. You have no idea what this code does.
```

---

## Thresholds & Scoring

### Experience-Level Expectations

While the scoring formula is the same for everyone, expectations vary by level:

**Junior Developers:**
- **Target:** 80+ average score
- **Why:** You need to learn from every piece of code
- **Review time:** Take longer than formula suggests - it's okay!
- **Edits:** Should modify most AI suggestions as learning exercise

**Mid-Level Developers:**
- **Target:** 70+ average score
- **Why:** Balance between speed and safety
- **Review time:** Match or slightly exceed expected time
- **Edits:** Modify AI code to match team standards

**Senior Developers:**
- **Target:** 70+ average score
- **Why:** You can review faster but must still review
- **Review time:** Can be faster per line due to experience
- **Edits:** Should catch issues AI missed (security, performance, maintainability)

### Files Needing Review

CodePause tracks **"Files Needing Review"** - AI-generated files with ownership scores below 70.

**Acceptable:**
- 0-2 files needing review at end of day

**Warning:**
- 3-5 files needing review (catch up before tomorrow)

**Critical:**
- 6+ files needing review (you're accumulating technical debt)

---

## Examples & Scenarios

### Scenario 1: Agent Mode Files (Common Issue)

```
Situation:
- Claude Code generated 5 new files while you were away
- Files created: AuthService.ts, UserRepository.ts, tests/auth.test.ts
- You haven't opened any of them yet

Current State:
- 5 files needing review
- Average ownership score: 0
- Status: 🚨 Critical

Action Required:
1. Open each file sequentially
2. Spend time reading and understanding the implementation
3. Run the tests to verify functionality
4. Make modifications to match your style and standards
5. Add comments for complex sections
6. Mark as reviewed after thorough inspection

Time Investment: 15-30 minutes for proper review
Result: Ownership score jumps to 85+, you understand the codebase
```

### Scenario 2: Inline Completions (Quick Reviews)

```
Situation:
- Copilot suggests a 10-line error handling function
- You're in active coding flow

Current State:
- Suggestion appears inline
- You have 3-5 seconds before accepting

Good Review Process:
1. Read through the suggestion (scroll if needed)
2. Verify it handles your specific error cases
3. Check if logging is appropriate
4. Accept and immediately edit to add specific error messages
5. Test the error path

Time Investment: 10-15 seconds
Result: Ownership score: 75+ (adequate for inline completion)
```

### Scenario 3: Chat/Paste Mode (Large Blocks)

```
Situation:
- Asked ChatGPT for a data transformation function
- Received 60 lines of code
- Pasted into your editor

Current State:
- 60 lines of unreviewed AI code
- Complex nested logic

Proper Review Process:
1. Read through entire function (1-2 minutes)
2. Verify it handles edge cases for YOUR data
3. Check performance characteristics
4. Add type safety if missing
5. Write unit tests covering edge cases
6. Refactor for readability
7. Add documentation

Time Investment: 10-15 minutes
Result: Ownership score: 90+, code is truly yours
```

---

## Tips to Improve Your Score

### Before Accepting AI Code

1. **Read first, accept second** - Never tab-accept without reading
2. **Understand the "why"** - Don't just verify syntax, understand logic
3. **Check edge cases** - AI often misses null checks, error handling, boundaries
4. **Verify security** - SQL injection, XSS, authentication bypasses - AI doesn't know your context
5. **Consider alternatives** - Is this the best approach or just the first one AI thought of?

### During Review

1. **Take your time** - The score accounts for code complexity. 50 lines needs more time than 5 lines
2. **Scroll through everything** - Don't just read the first few lines
3. **Click around** - Interact with the code, highlight sections, check references
4. **Read imports** - AI might import unused dependencies or wrong versions
5. **Check naming** - Variable names should match your project's conventions

### After Initial Review

1. **Make it yours** - Modify AI code to match your style
2. **Add comments** - Especially for complex logic AI generated
3. **Improve it** - AI gives "working" code, not "great" code
4. **Test edge cases** - Write tests for scenarios AI didn't consider
5. **Refactor** - AI often generates verbose code that can be simplified

### For Agent Mode Files

1. **Review immediately** - Don't let unreviewed files accumulate
2. **Run the code** - Execute it, test it, see if it actually works
3. **Check file structure** - Is the code organized logically?
4. **Verify dependencies** - Did AI add packages you don't want?
5. **Read tests** - AI-generated tests often have low coverage

### Building Good Habits

1. **Set a daily goal** - "Review all AI code before end of day"
2. **Use review time productively** - Treat it as learning opportunity
3. **Batch reviews** - After an agent session, review all files together
4. **Create a checklist** - Security, performance, maintainability, style
5. **Practice "active reading"** - Make at least one small improvement to every AI suggestion

---

## Related Metrics

- **[AI Percentage](./ai-percentage.md)** - How much AI code you're accepting (quantity)
- **[Review Quality](./review-quality.md)** - Alternative view of same concept
- **[Average Review Time](./average-review-time.md)** - How long you spend on reviews
- **[Blind Approvals](./blind-approvals.md)** - Instances of accepting code too quickly
- **[Unreviewed Files](./unreviewed-files.md)** - Files still needing your attention
- **[Agent Mode](./agent-mode.md)** - Files generated while closed (highest review need)

---

## Understanding the Scoring Formula

### Why These Weights?

**Time (40%)** - Most important factor
- Reading code takes time. No shortcuts.
- If you spent 2 seconds on 50 lines, you didn't review it.
- Formula adjusts expected time based on code complexity

**Scroll (20%)** - Shows engagement
- Scrolling indicates you're reading beyond the first screen
- Multiple scrolls show thorough inspection
- No scrolling = probably didn't read it all

**Cursor Movement (20%)** - Proves interaction
- Moving cursor shows you're actively examining code
- Clicking into different sections shows detail orientation
- Hovering over symbols shows you're verifying types/references

**Edits (20%)** - Demonstrates ownership
- Any edit proves you engaged with the code
- Shows you're making it yours, not just accepting blindly
- Even small changes (comments, formatting) count

### Why Not Just Time?

You could spend 5 minutes with file open but tabbed away. Time + Activity proves you were actually reviewing, not just distracted.

### Special Cases

**Terminal Workflow Files:**
- If you reviewed code in terminal before accepting, CodePause can't measure it
- Solution: Open file in editor after creation to "officially" review
- Or: Mark as reviewed manually in dashboard

**Refactoring Sessions:**
- High edit activity automatically boosts score
- Shows strong ownership even if initial review was light

**Pair Programming:**
- Review with colleague still registers as single-user review
- Both people's activity counts (if sharing screen/session)

---

## FAQ

**Q: I reviewed code in the terminal before accepting. Why is my score 0?**

A: CodePause tracks VS Code editor activity. If you reviewed in terminal, open the file in VS Code afterward and scroll through it to register the review.

**Q: My score is low but I understand the code. Does that matter?**

A: Yes. CodePause doesn't know what you understand - only what you did. The score reflects observable behavior. If you reviewed thoroughly mentally, take a moment to interact with the code (scroll, click around) so the score reflects reality.

**Q: Can I game the score by just scrolling randomly?**

A: Technically yes, but why? The score exists to help you maintain quality. Gaming it only hurts you. The real metric is: can you explain and maintain this code?

**Q: What's a good average score to aim for?**

A: Aim for 75+ average across all AI-generated code. Some simple suggestions might be 60-70 (acceptable), but complex files should be 85+.

**Q: Should I review test files as thoroughly as production code?**

A: Yes! AI-generated tests often have poor coverage or test the wrong things. Bad tests are worse than no tests - they give false confidence.

**Q: How long should I spend reviewing?**

A: Formula suggests 500ms per line as baseline. That's 30 seconds for 60 lines. Take longer for complex code, especially if you're learning.

**Q: The score says I need to edit code. Should I edit just to boost the score?**

A: Only make meaningful edits. Add comments, improve naming, refactor complex sections, add error handling. Don't change code just to change it.

---

## Dashboard Location

**Primary Display:** Core Metrics Card #2 - "Code Ownership Score"
- Today's average ownership score (0-100)
- Visual progress bar color-coded by quality
- Category (Thorough/Light/Rushed)
- Number of files needing review

**Detailed View:** Files Needing Review section (collapsible)
- List of all unreviewed files
- Lines generated per file
- Time since generation
- Quick actions: "Review" (opens file) and "Mark as Reviewed"

**History:** Weekly Trend shows how your review quality changes over time

---

**Remember:** Every piece of AI code you accept without review is code you don't own. Code you don't own will break, confuse teammates, and cost you time later. Invest in proper review now to save 10x debugging time later.

**Your ownership score isn't about pleasing a metric - it's about protecting your codebase and your reputation as a developer.**
