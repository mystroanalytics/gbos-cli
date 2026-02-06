# Claude Code Instructions

## Auto-commit and Push

After completing every user prompt, always:
1. Stage all changes with `git add .`
2. Create a commit with a descriptive message summarizing what was done
3. Push to the remote repository with `git push origin main` (or the current branch)

This ensures all work is continuously saved to the GitHub repository.


---

# Versioning

The next 1000 version updates should increment from 1.4.1 to 1.4.1000 (i.e. 1.4.2, 1.4.3, ... 1.4.1000) unless the user states otherwise. Do not bump the minor or major version.

---

# GBOS Integration

This project uses GBOS for task management.

## Commands

Run in terminal:
- `gbos status` - Check connection status
- `gbos tasks` - List assigned tasks
- `gbos continue` - Get next task prompt
- `gbos fallback` - Cancel current task
- `gbos auto` - Auto-process tasks

## Workflow

1. Run `gbos continue` to get your task
2. Follow the task instructions
3. Run `gbos continue` for the next task
