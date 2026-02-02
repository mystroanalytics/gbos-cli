# GBOS Integration for Gemini CLI

## Setup Instructions

Add this to your `GEMINI.md` or project instructions file for Google Gemini CLI.

---

## GBOS Task Management System

This project uses GBOS (Generative Business Operating System) for AI-coordinated task management.

### Available Shell Commands

| Command | Purpose |
|---------|---------|
| `gbos status` | Display authentication and connection status |
| `gbos tasks` | List all tasks assigned to this node |
| `gbos next_task` | Preview the next pending task |
| `gbos continue` | Output the current task prompt for execution |
| `gbos fallback` | Cancel and revert the current task |
| `gbos auto` | Enter automatic task processing mode |

### Standard Workflow

```bash
# 1. Check connection
gbos status

# 2. Get task to work on
gbos continue

# 3. Execute the task instructions

# 4. Get next task
gbos continue
```

### Task Prompt Schema

When running `gbos continue`, the output follows this structure:

```markdown
# Task: {title}

**Task ID:** {id}
**Priority:** {priority}

## Instructions
{prompt/description}

## Metadata
```json
{metadata_object}
```

## Attachments
- [{filename}]({url})

## Context
{additional_context}
```

### Auto Mode

For continuous task processing:

```bash
gbos auto
```

This will:
1. Process all pending tasks sequentially
2. Output task prompts for execution
3. Poll for new tasks every 60 seconds
4. Continue until interrupted (Ctrl+C)

### Error Recovery

```bash
# Cancel problematic task
gbos fallback

# Check system status
gbos status

# View remaining tasks
gbos tasks

# Resume with next task
gbos continue
```
