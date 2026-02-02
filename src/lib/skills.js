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

This project uses GBOS for task management.

## Commands

Run in terminal:
- \`gbos status\` - Check connection status
- \`gbos tasks\` - List assigned tasks
- \`gbos continue\` - Get next task prompt
- \`gbos fallback\` - Cancel current task
- \`gbos auto\` - Auto-process tasks

## Workflow

1. Run \`gbos continue\` to get your task
2. Follow the task instructions
3. Run \`gbos continue\` for the next task
`,

  '.cursorrules': () => `# GBOS Task Management

## Commands
- gbos status - Check connection
- gbos tasks - List tasks
- gbos continue - Get task prompt
- gbos fallback - Cancel task
- gbos auto - Auto-process

## Workflow
1. gbos continue - Get task
2. Execute instructions
3. gbos continue - Next task
`,

  'GEMINI.md': () => `# GBOS Integration

## Commands
- gbos status - Check status
- gbos tasks - List tasks
- gbos continue - Get task prompt
- gbos fallback - Cancel task
- gbos auto - Auto-process

## Workflow
Run gbos continue to get tasks.
`,

  'AGENTS.md': () => `# GBOS Integration (Codex/Agents)

## Shell Commands
\`\`\`bash
gbos status      # Check connection
gbos tasks       # List tasks
gbos continue    # Get task prompt
gbos fallback    # Cancel task
gbos auto        # Auto-process
\`\`\`

## Workflow
1. gbos continue - Get task
2. Execute task
3. gbos continue - Next task
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

// Register MCP server with Claude Code
function registerMCPServer() {
  const results = [];

  // Claude Code config locations
  const configLocations = [
    path.join(os.homedir(), '.claude', 'claude_desktop_config.json'),
    path.join(os.homedir(), '.config', 'claude', 'config.json'),
  ];

  for (const configPath of configLocations) {
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
        results.push({ path: configPath, status: 'skipped', reason: 'Already registered' });
        continue;
      }

      // Merge MCP config
      config.mcpServers = {
        ...(config.mcpServers || {}),
        ...MCP_CONFIG.mcpServers,
      };

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      results.push({ path: configPath, status: 'registered' });
    } catch (e) {
      results.push({ path: configPath, status: 'error', reason: e.message });
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
