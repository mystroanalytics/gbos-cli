const fs = require('fs');
const path = require('path');
const os = require('os');

// MCP Server configuration
const MCP_CONFIG = {
  mcpServers: {
    gbos: {
      url: 'https://gbos-mcp-server-579767694933.us-south1.run.app/mcp'
    }
  }
};

// Skill content generators
const SKILLS = {
  'CLAUDE.md': () => `# GBOS Integration

This project uses GBOS (Generative Business Operating System) for task management.

## /gbos Command

When the user types \`/gbos\` or asks about GBOS commands, run \`gbos status\` to show the current status, then list the available commands below.

## Available Commands

Run these in the terminal:

| Command | Description |
|---------|-------------|
| \`gbos status\` | Show current authentication and connection status |
| \`gbos tasks\` | List all tasks assigned to this development node |
| \`gbos continue\` | Get the next task prompt to work on |
| \`gbos next\` | Preview the next task in the queue |
| \`gbos fallback\` | Cancel current task and revert changes |
| \`gbos add_task\` | Create a new task interactively |
| \`gbos disconnect\` | Disconnect from the current node |

## Workflow

1. Run \`gbos continue\` to get your next task
2. Follow the task instructions provided
3. When done, run \`gbos continue\` for the next task

## Quick Actions

- To check status: Run \`gbos status\`
- To get work: Run \`gbos continue\`
- To see all tasks: Run \`gbos tasks\`
`,

  '.cursorrules': () => `# GBOS Task Management

When user types "/gbos", run "gbos status" and show available commands.

## Commands
| Command | Description |
|---------|-------------|
| gbos status | Show status |
| gbos tasks | List tasks |
| gbos continue | Get next task |
| gbos next | Preview next task |
| gbos fallback | Cancel task |
| gbos add_task | Create task |

## Workflow
1. Run: gbos continue
2. Execute the task instructions
3. Run: gbos continue (for next task)
`,

  'GEMINI.md': () => `# GBOS Integration

When user types "/gbos" or asks about GBOS, run "gbos status" and show available commands.

## Commands

| Command | Description |
|---------|-------------|
| gbos status | Show current status |
| gbos tasks | List assigned tasks |
| gbos continue | Get next task prompt |
| gbos next | Preview next task |
| gbos fallback | Cancel current task |
| gbos add_task | Create new task |

## Workflow

1. Run \`gbos continue\` to get task
2. Follow the instructions
3. Run \`gbos continue\` for next task
`,

  'AGENTS.md': () => `# GBOS Integration (Codex/Agents)

When user mentions "/gbos" or asks about GBOS commands, execute "gbos status" and list available commands.

## Shell Commands

\`\`\`bash
gbos status      # Show current status
gbos tasks       # List assigned tasks
gbos continue    # Get next task prompt
gbos next        # Preview next task
gbos fallback    # Cancel current task
gbos add_task    # Create new task
\`\`\`

## Workflow

1. Run: gbos continue
2. Execute the task
3. Run: gbos continue (next task)
`,
};

// Generate skills files in the working directory
function generateSkillsFiles(workingDirectory) {
  const results = [];

  for (const [filename, generator] of Object.entries(SKILLS)) {
    const filePath = path.join(workingDirectory, filename);

    // Check if file already exists
    if (fs.existsSync(filePath)) {
      // Read existing content
      const existing = fs.readFileSync(filePath, 'utf8');

      // Check if GBOS section already exists
      if (existing.includes('GBOS') || existing.includes('gbos')) {
        results.push({ file: filename, status: 'skipped', reason: 'GBOS section exists' });
        continue;
      }

      // Append GBOS section to existing file
      const content = existing + '\n\n---\n\n' + generator();
      fs.writeFileSync(filePath, content, 'utf8');
      results.push({ file: filename, status: 'updated' });
    } else {
      // Create new file
      fs.writeFileSync(filePath, generator(), 'utf8');
      results.push({ file: filename, status: 'created' });
    }
  }

  return results;
}

// VS Code tasks.json
function generateVSCodeTasks(workingDirectory) {
  const vscodeDir = path.join(workingDirectory, '.vscode');
  const tasksFile = path.join(vscodeDir, 'tasks.json');

  const tasks = {
    version: '2.0.0',
    tasks: [
      { label: 'GBOS: Status', type: 'shell', command: 'gbos', args: ['status'] },
      { label: 'GBOS: Tasks', type: 'shell', command: 'gbos', args: ['tasks'] },
      { label: 'GBOS: Continue', type: 'shell', command: 'gbos', args: ['continue'] },
      { label: 'GBOS: Fallback', type: 'shell', command: 'gbos', args: ['fallback'] },
      { label: 'GBOS: Auto', type: 'shell', command: 'gbos', args: ['auto'], isBackground: true },
    ]
  };

  if (!fs.existsSync(vscodeDir)) {
    fs.mkdirSync(vscodeDir, { recursive: true });
  }

  if (fs.existsSync(tasksFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
      // Check if GBOS tasks already exist
      const hasGbos = existing.tasks?.some(t => t.label?.startsWith('GBOS:'));
      if (hasGbos) {
        return { file: '.vscode/tasks.json', status: 'skipped', reason: 'GBOS tasks exist' };
      }
      // Merge tasks
      existing.tasks = [...(existing.tasks || []), ...tasks.tasks];
      fs.writeFileSync(tasksFile, JSON.stringify(existing, null, 2), 'utf8');
      return { file: '.vscode/tasks.json', status: 'updated' };
    } catch (e) {
      // Invalid JSON, overwrite
    }
  }

  fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2), 'utf8');
  return { file: '.vscode/tasks.json', status: 'created' };
}

// Register MCP server with coding tools
function registerMCPServer() {
  const results = [];

  // Tool configurations with their config file locations
  const toolConfigs = [
    // Claude Code / Claude Desktop
    {
      name: 'Claude Code',
      paths: [
        path.join(os.homedir(), '.claude', 'claude_desktop_config.json'),
        path.join(os.homedir(), '.config', 'claude', 'config.json'),
      ],
      format: 'claude',
    },
    // Gemini CLI
    {
      name: 'Gemini CLI',
      paths: [
        path.join(os.homedir(), '.config', 'gemini', 'config.json'),
        path.join(os.homedir(), '.gemini', 'config.json'),
      ],
      format: 'gemini',
    },
    // OpenAI Codex CLI
    {
      name: 'Codex CLI',
      paths: [
        path.join(os.homedir(), '.codex', 'config.json'),
        path.join(os.homedir(), '.config', 'codex', 'config.json'),
      ],
      format: 'codex',
    },
  ];

  for (const tool of toolConfigs) {
    for (const configPath of tool.paths) {
      const configDir = path.dirname(configPath);

      try {
        // Ensure directory exists
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
        }

        let config = {};
        if (fs.existsSync(configPath)) {
          try {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          } catch (e) {
            // Invalid JSON, start fresh
          }
        }

        // Check if GBOS MCP server already registered
        if (config.mcpServers?.gbos) {
          results.push({ tool: tool.name, path: configPath, status: 'skipped', reason: 'Already registered' });
          continue;
        }

        // Merge MCP config based on tool format
        if (tool.format === 'claude') {
          config.mcpServers = {
            ...(config.mcpServers || {}),
            ...MCP_CONFIG.mcpServers,
          };
        } else if (tool.format === 'gemini') {
          // Gemini uses similar format
          config.mcpServers = {
            ...(config.mcpServers || {}),
            gbos: {
              url: MCP_CONFIG.mcpServers.gbos.url,
              name: 'GBOS',
              description: 'Generative Business Operating System task management',
            },
          };
        } else if (tool.format === 'codex') {
          // Codex uses similar format with additional metadata
          config.mcpServers = {
            ...(config.mcpServers || {}),
            gbos: {
              url: MCP_CONFIG.mcpServers.gbos.url,
              name: 'GBOS',
              enabled: true,
            },
          };
        }

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        results.push({ tool: tool.name, path: configPath, status: 'registered' });
      } catch (e) {
        results.push({ tool: tool.name, path: configPath, status: 'error', reason: e.message });
      }
    }
  }

  return results;
}

// Generate all skill files for a project
function setupProjectSkills(workingDirectory) {
  const results = {
    skills: generateSkillsFiles(workingDirectory),
    vscode: generateVSCodeTasks(workingDirectory),
  };

  return results;
}

module.exports = {
  generateSkillsFiles,
  generateVSCodeTasks,
  registerMCPServer,
  setupProjectSkills,
  MCP_CONFIG,
};
