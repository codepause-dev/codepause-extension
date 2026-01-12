# Review Quality

**The depth and thoroughness of your code reviews.**

## Quick Summary

Review Quality is a categorical assessment of your code ownership: Thorough (70+ score), Light (40-69), or Rushed/None (<40). It's the same data as Code Ownership Score but presented as categories for quick understanding.

---

## Categories Explained

### Thorough Review (70-100 score)
**What it looks like:**
- Spent adequate time reading code
- Scrolled through entire implementation
- Moved cursor to multiple locations
- Made edits to improve code
- Understands what the code does

**Indicators:**
- Green status in dashboard
- High confidence in code quality
- Can explain code to teammates
- Would catch bugs in review

### Light Review (40-69 score)
**What it looks like:**
- Skimmed the code quickly
- Looked at some sections
- Limited interaction
- Few or no edits
- General idea but not deep understanding

**Indicators:**
- Yellow status in dashboard
- Surface-level knowledge
- Might miss subtle bugs
- Could debug but would take time

### Rushed/None (<40 score)
**What it looks like:**
- Barely opened file or never opened
- Spent seconds on complex code
- No scrolling or interaction
- No edits made
- Blind acceptance

**Indicators:**
- Red status in dashboard
- No understanding of code
- Can't explain what it does
- Won't be able to debug
- Technical debt

---

## See Also

This is a categorical view of [Code Ownership Score](./code-ownership-score.md). See that documentation for:
- Detailed scoring formula
- How to improve
- Examples and scenarios
- Best practices

---

**Remember:** The category names matter less than the behavior. "Light" review is fine for simple code. "Thorough" is required for complex or critical code.
