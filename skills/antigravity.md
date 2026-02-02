# GBOS Integration for Antigravity

## Setup Instructions

Add this to your Antigravity project configuration or instructions.

---

## GBOS Task Management

GBOS provides a task queue system for coordinating AI coding agents.

### CLI Commands

```bash
gbos status      # Check connection status
gbos tasks       # List assigned tasks
gbos next_task   # Preview next task
gbos continue    # Get task prompt to execute
gbos fallback    # Cancel current task
gbos auto        # Auto-process task queue
```

### Integration

#### Get Task Programmatically

```javascript
const { execSync } = require('child_process');

function getNextTask() {
  try {
    const output = execSync('gbos continue', { encoding: 'utf8' });
    return output;
  } catch (error) {
    return null;
  }
}

function getTaskList() {
  try {
    const output = execSync('gbos tasks', { encoding: 'utf8' });
    return output;
  } catch (error) {
    return null;
  }
}
```

#### Task Output Format

```markdown
# Task: [Title]

**Task ID:** [id]
**Priority:** [priority]

## Instructions
[What to do]

## Metadata
```json
{"key": "value"}
```

## Attachments
- [file.txt](https://url)
```

### Workflow

1. Connect: `gbos connect` (select app and node)
2. Work: `gbos continue` (get task prompt)
3. Execute: Follow instructions
4. Repeat: `gbos continue` (next task)

### Auto Mode

Run `gbos auto` for continuous processing:
- Executes tasks sequentially
- Polls every 60s for new tasks
- Exit with Ctrl+C
