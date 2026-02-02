# GBOS Skills for Claude Code

Add this to your project's `CLAUDE.md` file to enable GBOS task management.

---

## GBOS Integration

This project uses GBOS (Generative Business Operating System) for task management.

### Available Commands

Run these commands in the terminal to interact with GBOS:

- `gbos status` - Check authentication and connection status
- `gbos tasks` - List all tasks assigned to this development node
- `gbos next_task` - Get the next pending task
- `gbos continue` - Get the current/next task prompt to work on
- `gbos fallback` - Cancel current task and revert changes
- `gbos auto` - Automatically process tasks and poll for new ones

### Workflow

1. **Start a session**: Run `gbos connect` to connect to a development node
2. **Get tasks**: Run `gbos continue` to get the next task prompt
3. **Work on task**: Follow the instructions in the task prompt
4. **Complete task**: The task will be marked complete when you finish
5. **Continue**: Run `gbos continue` again for the next task

### Task Prompt Format

When you run `gbos continue`, you'll receive a structured prompt with:
- Task title and ID
- Instructions/description
- Metadata (JSON format)
- Attachment URLs (if any)
- Context information

### Auto Mode

Run `gbos auto` to enter automatic mode where:
- Tasks are processed sequentially
- New tasks are fetched every minute when queue is empty
- Press Ctrl+C to exit

---

## Example CLAUDE.md Integration

```markdown
# Project Instructions

## GBOS Task Management

This project uses GBOS for task coordination. Before starting work:

1. Ensure you're connected: `gbos status`
2. Get your next task: `gbos continue`
3. Follow the task instructions provided

When working on GBOS tasks:
- Read the full task prompt before starting
- Check any attached files or URLs
- Mark tasks complete by finishing the work
- Use `gbos fallback` if you need to abandon a task
```
