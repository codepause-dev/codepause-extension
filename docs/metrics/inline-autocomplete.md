# Inline Autocomplete Mode

**Real-time AI suggestions as you type - the most common AI interaction.**

## Quick Summary

Inline Autocomplete tracks AI code suggestions that appear inline in your editor as you type (Copilot, Cursor Tab, etc.). These are the gray/ghost text suggestions you accept with Tab. This is typically the lowest-risk AI usage mode since you see suggestions in context.

---

## Why It Matters

Inline completions are the "gateway drug" to AI coding:
- **Immediate feedback:** Suggestions appear as you code
- **Low friction:** Just press Tab to accept
- **Context aware:** AI sees your cursor position and recent code
- **High volume:** Can trigger 50-100+ times per session

**The danger:** The ease of Tab-accepting can lead to blind approvals if you're not careful.

---

## Best Practices

### Healthy Inline Usage

**DO:**
- Read suggestion before accepting
- Accept for well-known patterns
- Modify after accepting
- Reject when uncertain
- Use for boilerplate

**DON'T:**
- Tab-mash through everything
- Accept without reading
- Trust for complex logic
- Use for security-critical code
- Accept just because it's there

---

## Metrics Tracked

**For inline mode:**
- Lines generated via inline suggestions
- Number of suggestions accepted
- Number rejected
- Quick acceptances (potential blind approvals)
- Percentage of total AI code from inline

---

## Comparison to Other Modes

| Mode | Risk Level | Review Need | Use Case |
|------|-----------|-------------|----------|
| **Inline** | Low-Medium | Light-Medium | Boilerplate, patterns |
| **Chat/Paste** | Medium | Medium-High | Specific algorithms |
| **Agent** | High | Very High | Multi-file features |

---

## Dashboard Location

**"How You Work With AI" section:**
- Inline Autocomplete card
- Shows percentage of AI lines from inline mode
- Number of suggestions accepted
- Comparison with other modes

---

## Related Metrics

- [Agent Mode](./agent-mode.md) - Higher risk alternative
- [Chat/Paste Mode](./chat-paste-mode.md) - Medium risk
- [Acceptance Rate](./acceptance-rate.md) - What % of inline suggestions you accept
- [Blind Approvals](./blind-approvals.md) - Quick Tab-accepts flagged here

---

**Remember:** Inline suggestions are convenient, not infallible. Read before you Tab.
