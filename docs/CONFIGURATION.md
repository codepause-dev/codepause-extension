# Configuration

> Part of [CodePause](../README.md) documentation

## Settings

`Ctrl+,` → Search for "CodePause"

```json
{
  // Your experience level (affects thresholds)
  "codePause.experienceLevel": "mid",

  // Notification frequency
  "codePause.alertFrequency": "medium",

  // Time to consider insufficient review (ms)
  "codePause.blindApprovalThreshold": 2000,

  // Anonymize file paths in exports
  "codePause.anonymizePaths": true,

  // Enable legacy features
  "codePause.enableGamification": false
}
```

## Experience Level Thresholds

| Level  | Max AI% | Notification Frequency |
|--------|---------|------------------------|
| Junior | 60%     | Hourly                 |
| Mid    | 50%     | Every 2 hours          |
| Senior | 40%     | Daily                  |

Customize in settings or via:
`Ctrl+Shift+P` → "CodePause: Change Experience Level"

---

## Commands

Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac):

| Command | Description |
|---------|-------------|
| `CodePause: Open Dashboard` | View metrics and insights |
| `CodePause: Change Experience Level` | Update your skill level |
| `CodePause: Snooze Alerts for Today` | Pause notifications until tomorrow |
| `CodePause: Open Settings` | Configure thresholds and preferences |
| `CodePause: Show Quick Stats` | Today's summary in status bar |
| `CodePause: Export Data` | Export metrics to JSON/CSV |
