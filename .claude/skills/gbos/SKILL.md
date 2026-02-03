---
name: gbos
description: Show GBOS status and available commands
---

# /gbos - GBOS Task Management

When this skill is invoked, run the following steps:

1. Execute `gbos status` in the terminal to show the current connection status
2. Display the available GBOS commands to the user

## Available Commands

| Command | Description |
|---------|-------------|
| `gbos status` | Show current authentication and connection status |
| `gbos tasks` | List all tasks assigned to this development node |
| `gbos continue` | Get the next task prompt to work on |
| `gbos next` | Preview the next task in the queue |
| `gbos fallback` | Cancel current task and revert changes |
| `gbos add_task` | Create a new task interactively |
| `gbos disconnect` | Disconnect from the current node |

## Workflow

1. Run `gbos continue` to get your next task
2. Follow the task instructions provided
3. When done, run `gbos continue` for the next task
