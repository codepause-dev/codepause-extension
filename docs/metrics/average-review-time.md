# Average Review Time

**How long you spend reviewing AI suggestions before accepting them.**

## Quick Summary

Average Review Time measures the mean time between when AI suggests code and when you accept it. Calculated across all accepted suggestions. Expected time varies by code complexity: ~500ms per line for thorough review, 200ms per line minimum.

---

## Why It Matters

Review time directly correlates with code quality and learning. Research shows:
- **Under 2 seconds:** Likely blind approval, minimal comprehension
- **2-10 seconds:** Light review, catches obvious issues
- **10-30 seconds:** Thorough review, understands logic
- **30+ seconds:** Deep review or complex code

**Key insight:** Time spent reviewing is time spent learning. Rush this and you learn nothing.

---

## Calculation

```
Average Review Time = Total Review Time / Accepted Count

Expected time per suggestion:
- Simple (1-5 lines): 2-5 seconds
- Medium (6-20 lines): 5-15 seconds  
- Complex (21+ lines): 15-60 seconds

Per line baseline: 500ms for thorough review
```

---

## Good Targets

**By Experience Level:**
- Junior: 8-15 seconds average (take time to learn)
- Mid-Level: 5-10 seconds average (balance speed/quality)
- Senior: 3-8 seconds average (experience enables faster review)

**By Suggestion Type:**
- Inline completions: 2-5 seconds
- Chat paste: 10-30 seconds
- Agent files: 60-300 seconds (per file)

---

## Related Metrics

- [Blind Approvals](./blind-approvals.md)
- [Code Ownership Score](./code-ownership-score.md)
- [Review Quality](./review-quality.md)

---

**Remember:** Fast reviews save seconds. Good reviews save hours of debugging.
