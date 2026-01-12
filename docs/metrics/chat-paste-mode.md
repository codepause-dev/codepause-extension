# Chat/Paste Mode

**Large code blocks pasted from AI chat interfaces.**

## Quick Summary

Chat/Paste Mode detects when you paste large blocks of code (>100 characters) from ChatGPT, Claude, Cursor Chat, or other chat interfaces. These suggestions are medium-risk because they're generated outside your editor context and need integration.

---

## Why It Matters

Chat-generated code differs from inline suggestions:
- **No context:** AI doesn't see your full codebase
- **Larger blocks:** Often 20-100+ lines at once
- **Integration needed:** Must fit with existing code
- **Less tested:** AI can't run your tests
- **Copy-paste errors:** May include chat artifacts

---

## Detection Method

```
Chat/Paste Detection:
1. Single paste >100 characters
2. Contains code structure (braces, keywords)
3. Not from file copy (within VS Code)
4. Rapid appearance (typing speed impossible)
```

---

## Best Practices

### Before Pasting

1. **Review in chat:** Understand logic before copying
2. **Ask questions:** Have AI explain complex parts
3. **Check assumptions:** Verify AI understood your requirements

### After Pasting

1. **Read thoroughly:** Don't trust blindly
2. **Check imports:** May reference libraries you don't have
3. **Verify types:** Ensure type safety
4. **Test immediately:** Run code, check outputs
5. **Refactor:** Make it match your style
6. **Add comments:** Document complex sections

---

## Common Issues

**Chat-specific problems:**
- **Outdated patterns:** AI trained on old data
- **Over-engineered:** More complex than needed
- **Missing edge cases:** AI doesn't know your data
- **Security blind spots:** Doesn't know your threat model
- **Style mismatches:** Won't match your conventions

---

## When to Use

**Good use cases:**
- Algorithm implementations (sorting, searching)
- Data transformation functions
- Boilerplate with specific patterns
- Examples for learning new tech

**Avoid for:**
- Business logic (too context-dependent)
- Security features
- Performance-critical code
- Integration code (needs codebase context)

---

## Dashboard Location

**"How You Work With AI" section:**
- Chat/Paste Mode card
- Percentage of AI lines from chat/paste
- Number of paste events
- Average lines per paste

---

## Related Metrics

- [Agent Mode](./agent-mode.md) - Higher risk
- [Inline Autocomplete](./inline-autocomplete.md) - Lower risk
- [Code Ownership Score](./code-ownership-score.md) - Review quality matters more for paste

---

**Remember:** Code from chat needs extra scrutiny. It wasn't generated in your codebase context.
