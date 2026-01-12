# Agent Mode

**AI code generated while files were closed - autonomous AI coding sessions.**

## Quick Summary

Agent Mode tracks AI-generated code created while files were NOT open in your editor. This happens when AI tools (Claude Code, Cursor Agent, etc.) modify or create files autonomously. These require the most thorough review since you didn't see the code being written.

---

## Why It Matters

Agent mode is the highest-risk AI usage pattern:
- **No real-time oversight:** You didn't watch code being written
- **Multiple files:** Agents often touch 3-10 files at once
- **Complex changes:** Agents implement entire features
- **Integration risk:** New code must work with existing codebase
- **Review burden:** All code needs inspection before use

**Critical:** Agent-generated files with review score <70 are technical time bombs.

---

## How It's Detected

```
Agent Mode Detection:
1. File modified while NOT in active editor
2. External process modified file
3. Git commit markers (Co-Authored-By: Claude)
4. Rapid file creation (multiple files in seconds)
5. Change velocity impossible for human typing
```

---

## What Gets Tracked

**Per agent session:**
- Number of files created/modified
- Total lines generated
- Time taken
- Whether you reviewed each file
- Review quality scores
- Files still needing review

---

## Best Practices

### Immediate Review Required

After every agent session:
1. **Open each file** - Don't just glance at git diff
2. **Read implementation** - Understand the logic
3. **Check integration** - How does it fit with existing code?
4. **Run tests** - Verify it actually works
5. **Make edits** - Improve code quality, add comments
6. **Test edge cases** - Agent may have missed them

### Review Timing

- Review within 1 hour of generation (while context is fresh)
- Don't let unreviewed files accumulate overnight
- Batch review: Do all files from one session together

---

## Dashboard

**Agent Mode Card shows:**
- Percentage of AI lines from agent mode
- Number of files generated today
- Files needing review (with quick actions)
- Average review score for agent files

**Files Needing Review Section:**
- Unreviewed agent files listed at top
- One-click "Review" opens file
- "Mark as Reviewed" for manually reviewed files

---

## Related Metrics

- [Unreviewed Files](./unreviewed-files.md)
- [Code Ownership Score](./code-ownership-score.md)
- [Inline Autocomplete](./inline-autocomplete.md) - Lower risk alternative
- [Chat/Paste Mode](./chat-paste-mode.md) - Medium risk alternative

---

**Remember:** Agent mode is like having a junior developer work while you're in a meeting. You MUST review their work before merging. No exceptions.
