# GBOS CLI

Command-line interface for the **Generative Business Operating System (GBOS)** - a task management platform that connects AI coding agents to development workflows.

## Installation

```bash
npm install -g gbos
```

## Quick Start

```bash
# 1. Authenticate with GBOS
gbos auth

# 2. Connect to a development node (automatic after auth)
gbos connect

# 3. Start working on tasks
gbos continue
```

## Commands

### Authentication & Connection

| Command | Description |
|---------|-------------|
| `gbos auth` | Authenticate with GBOS (opens browser for OAuth) |
| `gbos auth --force` | Force re-authentication |
| `gbos connect` | Connect to a development node |
| `gbos disconnect` | Disconnect from the current node |
| `gbos logout` | Log out and clear credentials |
| `gbos status` | Show current authentication and connection status |

### Task Management

| Command | Description |
|---------|-------------|
| `gbos tasks` | List all tasks assigned to this node |
| `gbos next` | Preview the next task in the queue |
| `gbos continue` | Get the next task and output prompt for coding agent |
| `gbos fallback` | Cancel current task and revert changes |
| `gbos add_task` | Create a new task interactively |

### Help

| Command | Description |
|---------|-------------|
| `gbos -h` | Show help and all available commands |
| `gbos <command> -h` | Show help for a specific command |

## How It Works

### 1. Authentication Flow

```
gbos auth
    │
    ├─→ Opens browser for GBOS OAuth
    ├─→ Saves session to ~/.gbos/session.json
    ├─→ Registers MCP server for coding tools
    └─→ Automatically proceeds to connect
```

### 2. Task Workflow

```
gbos continue
    │
    ├─→ Checks for in-progress task (GET /cli/tasks/current)
    ├─→ If none, fetches next task with auto-assign (GET /cli/tasks/next?auto_assign=true)
    ├─→ Marks task as in_progress (POST /cli/tasks/:id/start)
    └─→ Outputs task prompt for coding agent
```

### 3. Working with Coding Agents

After connecting, run your favorite coding agent in the same terminal:

```bash
# Claude Code
claude

# Gemini CLI
gemini

# OpenAI Codex
codex
```

Then simply ask the agent to work on GBOS tasks:
- "Fetch and work on the next task from GBOS"
- "Run gbos continue and complete the task"
- "Check gbos tasks and work on the highest priority one"

## Supported Coding Agents

GBOS CLI automatically configures MCP servers for:

- **Claude Code** - `~/.claude/settings.json`
- **Claude Desktop** - `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Gemini CLI** - `~/.gemini/settings.json`
- **Codex CLI** - `~/.codex/config.json`
- **Cursor IDE** - `~/.cursor/mcp.json`
- **VS Code** - `~/.vscode/mcp.json`
- **AntiGravity IDE** - `~/.antigravity/mcp.json`

## Project Integration

When you run `gbos connect` in a project directory, it creates:

### Skill Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Instructions for Claude Code |
| `.cursorrules` | Instructions for Cursor IDE |
| `GEMINI.md` | Instructions for Gemini CLI |
| `AGENTS.md` | Instructions for other agents |
| `.claude/skills/gbos/SKILL.md` | Claude Code `/gbos` slash command |

### VS Code Tasks

`.vscode/tasks.json` with quick-access tasks:
- GBOS: Status
- GBOS: Tasks
- GBOS: Continue
- GBOS: Fallback

## Configuration

### Session File

Stored at `~/.gbos/session.json`:

```json
{
  "access_token": "gbos_...",
  "refresh_token": "gbos_refresh_...",
  "user_id": 1,
  "user_name": "John Doe",
  "account_id": 2,
  "account_name": "My Account",
  "connection": {
    "node": { "id": 72, "name": "my-node" },
    "application": { "id": 48, "name": "My App" }
  }
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DEBUG=1` | Enable debug output |
| `GBOS_API_URL` | Override API endpoint (default: `https://api.gbos.io/api/v1`) |

## API Endpoints

The CLI communicates with the GBOS API:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/cli/auth/init` | POST | Initialize device auth flow |
| `/cli/auth/status/:code` | GET | Check auth status |
| `/cli/applications` | GET | List available applications |
| `/cli/nodes` | GET | List available nodes |
| `/cli/connect/:nodeId` | POST | Connect to a node |
| `/cli/tasks` | GET | List tasks for node |
| `/cli/tasks` | POST | Create a task |
| `/cli/tasks/current` | GET | Get in-progress task |
| `/cli/tasks/next` | GET | Get next task (supports `?auto_assign=true`) |
| `/cli/tasks/:id/start` | POST | Start a task |
| `/cli/tasks/:id/complete` | POST | Complete a task |
| `/cli/tasks/:id/fail` | POST | Fail a task |
| `/cli/tasks/:id/cancel` | POST | Cancel a task |

## MCP Server

GBOS provides an MCP (Model Context Protocol) server that coding agents can use directly:

```
https://gbos-mcp-server-579767694933.us-south1.run.app/mcp
```

This is automatically configured when you run `gbos auth`.

## Examples

### Basic Workflow

```bash
# Install
npm install -g gbos

# Authenticate and connect
gbos auth

# Check status
gbos status

# See available tasks
gbos tasks

# Start working on next task
gbos continue

# If task fails or needs to be cancelled
gbos fallback
```

### Create a Task

```bash
gbos add_task
# Follow interactive prompts:
# - Title
# - Description
# - Priority (low/medium/high/critical)
# - Task type (feature/bug/refactor/test/docs)
# - Prompt for agent
# - Attachments
# - Due date
```

### Debug Mode

```bash
DEBUG=1 gbos connect
DEBUG=1 gbos tasks
```

## Troubleshooting

### Token Expired

```bash
gbos auth --force
```

### Not Connected

```bash
gbos connect
```

### Tasks Not Showing

Tasks may need to be assigned to your node. Use `gbos next` which auto-assigns pending tasks, or assign from the GBOS dashboard.

### MCP Server Not Working

Re-run authentication to re-register MCP servers:

```bash
gbos auth --force
```

## Links

- **GBOS Platform**: [https://gbos.io](https://gbos.io)
- **API Documentation**: [https://api.gbos.io/docs](https://api.gbos.io/docs)
- **Issues**: [https://github.com/mystroanalytics/gbos-cli/issues](https://github.com/mystroanalytics/gbos-cli/issues)

## License

MIT
