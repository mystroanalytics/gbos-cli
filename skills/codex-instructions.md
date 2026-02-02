# GBOS Integration for OpenAI Codex CLI

## Setup Instructions

Add this to your project's `AGENTS.md` or instructions file for Codex CLI.

---

## GBOS Task Management

This project uses GBOS for task coordination. Execute these shell commands to interact with the task system.

### Commands

```bash
# Check status
gbos status

# List all tasks
gbos tasks

# Get next task
gbos next_task

# Get task prompt to work on (outputs to stdout)
gbos continue

# Cancel current task
gbos fallback

# Auto-process all tasks
gbos auto
```

### Workflow

1. Run `gbos continue` to get your task instructions
2. Parse the markdown-formatted output
3. Execute the task as instructed
4. Run `gbos continue` again for the next task

### Output Format

The `gbos continue` command outputs:

```markdown
# Task: [Title]

**Task ID:** [id]
**Priority:** [priority]

## Instructions

[Task prompt/description]

## Metadata

```json
{...}
```

## Attachments

- [filename](url)
```

### Integration Example

```python
import subprocess
import json

def get_next_task():
    result = subprocess.run(['gbos', 'continue'], capture_output=True, text=True)
    return result.stdout

def get_task_list():
    result = subprocess.run(['gbos', 'tasks'], capture_output=True, text=True)
    return result.stdout
```
