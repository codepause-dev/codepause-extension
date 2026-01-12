# Frequently Asked Questions

> Part of [CodePause](../README.md) documentation

## Does CodePause slow down VS Code?

**No.** CodePause uses <10 MB of RAM and runs entirely in the background. There is **zero typing lag** or performance impact. We've optimized event buffering and use SQLite for efficient data storage.

## What data does CodePause collect?

**Nothing leaves your machine.** CodePause uses a 100% local SQLite database. We track **metadata only** (lines of code, timestamps, language) — never your actual code content. Your privacy is guaranteed.

## Does this work with my AI coding assistant?

**Yes!** CodePause works with **ANY AI coding assistant** including:
- GitHub Copilot
- Cursor
- Claude Code
- Tabnine
- Amazon CodeWhisperer
- Any other AI tool

No configuration needed—it auto-detects AI-generated code using 5 different methods.

## Can I customize the thresholds?

**Absolutely.** All thresholds are customizable in settings:
- Blind approval time (default: 2000ms)
- Max AI percentage (default: 50%)
- Alert frequency (low/medium/high)
- Experience level targets

Adjust them to match your team's standards or personal preferences.

## Can my manager see my metrics?

**No.** All data is stored locally on your machine. Only **YOU** can see your metrics. There is no cloud sync, no telemetry, no dashboards for managers. CodePause is for **your** personal development, not surveillance.

## Is CodePause compatible with remote development (SSH/WSL)?

**Yes!** CodePause works seamlessly with VS Code Remote Development, including:
- Remote - SSH
- Remote - Containers
- WSL (Windows Subsystem for Linux)

The extension runs on the remote machine and stores data there.

## Does CodePause track code I copy from Stack Overflow?

**Yes, if it's a large paste (>100 characters).** CodePause detects large code insertions regardless of source. This helps you maintain awareness of any code you didn't write yourself, encouraging thorough review.

## How much disk space does CodePause use?

**Very little.** The SQLite database grows approximately:
- ~1 MB per month of active use
- ~12 MB per year
- Old data can be exported and pruned if needed

## Can I export my metrics?

**Yes!** You can export your data to:
- CSV format (for Excel/Google Sheets)
- JSON format (for custom analysis)
- PDF reports (coming soon)

Use: `Ctrl+Shift+P` → "CodePause: Export Data"

## Is CodePause open source?

**Yes, with a permissive license.** CodePause uses the Business Source License (BSL 1.1):
- **100% free for all developers**
- **Source code publicly available** on GitHub
- **Fork, modify, contribute** - open to community
- Only restriction: Can't resell as competing service

See [LICENSE.md](../LICENSE.md) for details.

## I found a bug / have a feature request. Where do I report it?

We'd love to hear from you!
- **Bugs**: [GitHub Issues](https://github.com/codepause-dev/codepause-extension/issues)
- **Feature Requests**: [GitHub Discussions](https://github.com/codepause-dev/codepause-extension/discussions)
- **Email**: support@codepause.dev
- **Website**: https://codepause.dev
