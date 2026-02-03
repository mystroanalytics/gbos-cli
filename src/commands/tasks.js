const api = require('../lib/api');
const config = require('../lib/config');
const { displayMessageBox, printBanner, printStatusTable, fg, LOGO_LIGHT, LOGO_PURPLE, RESET, BOLD, DIM, getTerminalWidth } = require('../lib/display');
const readline = require('readline');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Colors for prompts
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';

// Create readline interface for interactive prompts
function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

// Prompt for text input
async function promptText(rl, question, defaultValue = '') {
  return new Promise((resolve) => {
    const defaultStr = defaultValue ? ` ${DIM}(${defaultValue})${RESET}` : '';
    rl.question(`  ${CYAN}?${RESET} ${question}${defaultStr}: `, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

// Prompt for yes/no
async function promptYesNo(rl, question, defaultValue = false) {
  return new Promise((resolve) => {
    const defaultStr = defaultValue ? 'Y/n' : 'y/N';
    rl.question(`  ${CYAN}?${RESET} ${question} ${DIM}(${defaultStr})${RESET}: `, (answer) => {
      const lower = answer.trim().toLowerCase();
      if (lower === '') resolve(defaultValue);
      else resolve(lower === 'y' || lower === 'yes');
    });
  });
}

// Prompt for selection from list
async function promptSelect(rl, question, options) {
  console.log(`\n  ${CYAN}?${RESET} ${question}`);
  options.forEach((opt, i) => {
    console.log(`    ${DIM}${i + 1}.${RESET} ${opt.label || opt}`);
  });

  return new Promise((resolve) => {
    rl.question(`  ${DIM}Enter number (1-${options.length})${RESET}: `, (answer) => {
      const num = parseInt(answer.trim(), 10);
      if (num >= 1 && num <= options.length) {
        resolve(options[num - 1].value || options[num - 1]);
      } else {
        resolve(options[0].value || options[0]);
      }
    });
  });
}

// Format task for display
function formatTask(task, index) {
  const statusColors = {
    pending: '\x1b[33m',    // Yellow
    in_progress: '\x1b[36m', // Cyan
    completed: '\x1b[32m',   // Green
    failed: '\x1b[31m',      // Red
    cancelled: '\x1b[90m',   // Gray
  };
  const statusColor = statusColors[task.status] || '\x1b[37m';
  const statusIcon = {
    pending: '○',
    in_progress: '◐',
    completed: '●',
    failed: '✗',
    cancelled: '◌',
  };

  return {
    id: task.id,
    title: task.title || task.name || `Task ${task.id}`,
    status: task.status,
    statusDisplay: `${statusColor}${statusIcon[task.status] || '○'} ${task.status}${RESET}`,
    priority: task.priority || 'normal',
    createdAt: task.created_at || task.date_created,
  };
}

// Generate prompt for coding agent
function generateAgentPrompt(task) {
  let prompt = '';

  // Task header
  prompt += `# Task: ${task.title || task.name || 'Unnamed Task'}\n\n`;

  // Task ID for reference
  prompt += `**Task ID:** ${task.id}\n`;
  if (task.task_key) {
    prompt += `**Task Key:** ${task.task_key}\n`;
  }
  if (task.priority) {
    prompt += `**Priority:** ${task.priority}\n`;
  }
  if (task.task_type || task.layer) {
    prompt += `**Type:** ${task.task_type || ''}${task.layer ? ` (${task.layer})` : ''}\n`;
  }
  if (task.complexity) {
    prompt += `**Complexity:** ${task.complexity}\n`;
  }
  if (task.estimated_minutes) {
    prompt += `**Estimated Time:** ${task.estimated_minutes} minutes\n`;
  }
  prompt += '\n';

  // Main prompt/description
  if (task.agent_prompt) {
    prompt += `## Instructions\n\n${task.agent_prompt}\n\n`;
  } else if (task.prompt) {
    prompt += `## Instructions\n\n${task.prompt}\n\n`;
  } else if (task.description) {
    prompt += `## Description\n\n${task.description}\n\n`;
  }

  // Acceptance criteria
  if (task.acceptance_criteria && task.acceptance_criteria.length > 0) {
    prompt += `## Acceptance Criteria\n\n`;
    task.acceptance_criteria.forEach((criteria, i) => {
      prompt += `- ${criteria}\n`;
    });
    prompt += '\n';
  }

  // Target files
  if (task.target_files && task.target_files.length > 0) {
    prompt += `## Target Files\n\n`;
    task.target_files.forEach((file) => {
      prompt += `- ${file}\n`;
    });
    prompt += '\n';
  }

  // Dependencies
  if (task.dependencies && task.dependencies.length > 0) {
    prompt += `## Dependencies\n\n`;
    task.dependencies.forEach((dep) => {
      prompt += `- ${dep}\n`;
    });
    prompt += '\n';
  }

  // Metadata
  if (task.metadata && Object.keys(task.metadata).length > 0) {
    prompt += `## Metadata\n\n`;
    prompt += '```json\n';
    prompt += JSON.stringify(task.metadata, null, 2);
    prompt += '\n```\n\n';
  }

  // Agent context
  if (task.agent_context && Object.keys(task.agent_context).length > 0) {
    prompt += `## Agent Context\n\n`;
    prompt += '```json\n';
    prompt += JSON.stringify(task.agent_context, null, 2);
    prompt += '\n```\n\n';
  }

  // Attachments
  if (task.attachments && task.attachments.length > 0) {
    prompt += `## Attachments\n\n`;
    task.attachments.forEach((attachment, i) => {
      const url = attachment.url || attachment;
      const name = attachment.name || attachment.filename || `Attachment ${i + 1}`;
      prompt += `- [${name}](${url})\n`;
    });
    prompt += '\n';
  }

  // Context from node
  if (task.node_context || task.context) {
    prompt += `## Context\n\n${task.node_context || task.context}\n\n`;
  }

  // Plan info
  if (task.plan) {
    prompt += `## Plan\n\n`;
    prompt += `- **Plan:** ${task.plan.name || task.plan.id}\n`;
    if (task.plan.uuid) {
      prompt += `- **Plan ID:** ${task.plan.uuid}\n`;
    }
    prompt += '\n';
  }

  return prompt;
}

// Display full task details
function displayTaskDetails(task) {
  const termWidth = getTerminalWidth();
  const tableWidth = Math.min(80, termWidth - 4);

  console.log(`\n${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}`);
  console.log(`${BOLD}  Task Details${RESET}`);
  console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}\n`);

  // Basic info
  console.log(`  ${BOLD}${task.title || task.name || 'Unnamed Task'}${RESET}`);
  console.log(`  ${DIM}ID: ${task.id}${task.task_key ? ` | Key: ${task.task_key}` : ''}${RESET}\n`);

  // Status and priority
  const formatted = formatTask(task);
  console.log(`  ${DIM}Status:${RESET}     ${formatted.statusDisplay}`);
  console.log(`  ${DIM}Priority:${RESET}   ${task.priority || 'normal'}`);
  if (task.task_type) console.log(`  ${DIM}Type:${RESET}       ${task.task_type}${task.layer ? ` (${task.layer})` : ''}`);
  if (task.complexity) console.log(`  ${DIM}Complexity:${RESET} ${task.complexity}`);
  if (task.estimated_minutes) console.log(`  ${DIM}Estimate:${RESET}   ${task.estimated_minutes} minutes`);
  console.log('');

  // Description
  if (task.description) {
    console.log(`  ${DIM}Description:${RESET}`);
    console.log(`  ${task.description}\n`);
  }

  // Instructions/Prompt
  if (task.agent_prompt || task.prompt) {
    console.log(`  ${DIM}Instructions:${RESET}`);
    const instructions = task.agent_prompt || task.prompt;
    const lines = instructions.split('\n');
    lines.forEach(line => console.log(`  ${line}`));
    console.log('');
  }

  // Acceptance criteria
  if (task.acceptance_criteria && task.acceptance_criteria.length > 0) {
    console.log(`  ${DIM}Acceptance Criteria:${RESET}`);
    task.acceptance_criteria.forEach((criteria, i) => {
      console.log(`    ${i + 1}. ${criteria}`);
    });
    console.log('');
  }

  // Target files
  if (task.target_files && task.target_files.length > 0) {
    console.log(`  ${DIM}Target Files:${RESET}`);
    task.target_files.forEach(file => console.log(`    - ${file}`));
    console.log('');
  }

  // Plan info
  if (task.plan) {
    console.log(`  ${DIM}Plan:${RESET} ${task.plan.name || task.plan.id}`);
    console.log('');
  }

  console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}`);
}

// List tasks command
async function tasksCommand() {
  if (!config.isAuthenticated()) {
    displayMessageBox('Not Authenticated', 'Please run "gbos auth" first.', 'warning');
    process.exit(1);
  }

  const connection = config.getConnection();
  if (!connection) {
    displayMessageBox('Not Connected', 'Please run "gbos connect" first.', 'warning');
    process.exit(1);
  }

  try {
    console.log('\nFetching tasks...\n');
    const response = await api.getTasks();
    const tasks = response.data || [];

    // Display tasks in a table
    const termWidth = getTerminalWidth();
    const tableWidth = Math.min(100, termWidth - 4);

    console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}`);
    console.log(`${BOLD}  Tasks for ${connection.node?.name || 'this node'}${RESET}`);
    console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}\n`);

    if (tasks.length === 0) {
      console.log(`  ${DIM}No tasks assigned to this node.${RESET}`);
      console.log(`  ${DIM}Use "gbos next" to fetch and auto-assign the next available task.${RESET}\n`);
      console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}\n`);
      return;
    }

    // Show numbered list
    tasks.forEach((task, index) => {
      const formatted = formatTask(task, index);
      console.log(`  ${CYAN}${index + 1}.${RESET} ${formatted.statusDisplay}  ${BOLD}${formatted.title}${RESET}`);
      console.log(`     ${DIM}ID: ${formatted.id} | Priority: ${formatted.priority}${RESET}`);
      if (index < tasks.length - 1) console.log('');
    });

    console.log(`\n${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}`);
    console.log(`${DIM}  Total: ${tasks.length} task(s)${RESET}\n`);

    // Show meta info if available
    if (response.meta && response.meta.total > tasks.length) {
      console.log(`${DIM}  Showing ${tasks.length} of ${response.meta.total} total tasks${RESET}\n`);
    }

    // Allow user to select a task to view details
    const rl = createReadlineInterface();
    const answer = await new Promise((resolve) => {
      rl.question(`  ${CYAN}?${RESET} Enter task number to view details ${DIM}(or press Enter to skip)${RESET}: `, resolve);
    });
    rl.close();

    const taskNum = parseInt(answer.trim(), 10);
    if (taskNum >= 1 && taskNum <= tasks.length) {
      const selectedTask = tasks[taskNum - 1];
      displayTaskDetails(selectedTask);
    }

  } catch (error) {
    if (error.status === 404 || error.message?.includes('not found')) {
      // Fallback: try to get info from next task endpoint
      try {
        const nextResponse = await api.getNextTask();
        console.log(`${DIM}Tasks list endpoint not available yet.${RESET}`);
        if (nextResponse.pending_tasks_count) {
          console.log(`${DIM}Pending tasks in queue: ${nextResponse.pending_tasks_count}${RESET}`);
        }
        console.log(`${DIM}Use "gbos next" or "gbos continue" to get the next task.${RESET}\n`);
      } catch (e) {
        console.log(`${DIM}No tasks available.${RESET}\n`);
      }
      return;
    }
    displayMessageBox('Error', error.message, 'error');
    process.exit(1);
  }
}

// Get next task command
async function nextTaskCommand() {
  if (!config.isAuthenticated()) {
    displayMessageBox('Not Authenticated', 'Please run "gbos auth" first.', 'warning');
    process.exit(1);
  }

  const connection = config.getConnection();
  if (!connection) {
    displayMessageBox('Not Connected', 'Please run "gbos connect" first.', 'warning');
    process.exit(1);
  }

  try {
    console.log('\nFetching next task...\n');
    const response = await api.getNextTask();
    // API returns { data: { task, node } } or { data: task }
    const task = response.data?.task || response.data;

    if (!task) {
      if (response.pending_tasks_count > 0) {
        console.log(`${DIM}${response.message || 'No tasks assigned to this node.'}${RESET}`);
        console.log(`${DIM}Pending tasks in queue: ${response.pending_tasks_count}${RESET}`);
        console.log(`${DIM}Tasks may need to be assigned to this node from the GBOS dashboard.${RESET}\n`);
      } else {
        console.log(`${DIM}No pending tasks available.${RESET}\n`);
      }
      return;
    }

    // Show full task details
    displayTaskDetails(task);

    console.log(`\n  ${DIM}Run "gbos continue" to start working on this task.${RESET}\n`);

  } catch (error) {
    if (error.status === 404) {
      console.log(`${DIM}No pending tasks available.${RESET}\n`);
      return;
    }
    displayMessageBox('Error', error.message, 'error');
    process.exit(1);
  }
}

// Continue command - outputs prompt for coding agent
async function continueCommand() {
  if (!config.isAuthenticated()) {
    displayMessageBox('Not Authenticated', 'Please run "gbos auth" first.', 'warning');
    process.exit(1);
  }

  const connection = config.getConnection();
  if (!connection) {
    displayMessageBox('Not Connected', 'Please run "gbos connect" first.', 'warning');
    process.exit(1);
  }

  try {
    // First check for current in-progress task
    let task;
    let isNewTask = false;
    try {
      const currentResponse = await api.getCurrentTask();
      // API returns { data: { task, node } } or { data: task }
      task = currentResponse.data?.task || currentResponse.data;
    } catch (e) {
      // No current task, get next one
    }

    // If no current task, get next task
    let nextResponse;
    if (!task) {
      nextResponse = await api.getNextTask();
      // API returns { data: { task, node } } or { data: task }
      task = nextResponse.data?.task || nextResponse.data;
      isNewTask = true;
    }

    if (!task) {
      if (nextResponse && nextResponse.pending_tasks_count > 0) {
        console.log(`${DIM}${nextResponse.message || 'No tasks assigned to this node.'}${RESET}`);
        console.log(`${DIM}Pending tasks in queue: ${nextResponse.pending_tasks_count}${RESET}`);
        console.log(`${DIM}Tasks may need to be assigned to this node from the GBOS dashboard.${RESET}\n`);
      } else {
        console.log(`${DIM}No tasks available to continue.${RESET}\n`);
      }
      return;
    }

    // Mark task as in progress if it's pending or assigned
    if (task.status === 'pending' || task.status === 'assigned') {
      await api.startTask(task.id);
      task.status = 'in_progress';
    }

    // Show full task details
    displayTaskDetails(task);

    // Generate the prompt for the coding agent
    const prompt = generateAgentPrompt(task);

    // Show instructions
    const termWidth = getTerminalWidth();
    const tableWidth = Math.min(80, termWidth - 4);

    console.log(`\n${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}`);
    console.log(`${BOLD}  Task Prompt for Coding Agent${RESET}`);
    console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}\n`);

    // Show the prompt
    console.log(prompt);

    console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}`);
    console.log(`\n  ${GREEN}✓${RESET} ${BOLD}Task is now in progress!${RESET}\n`);
    console.log(`  ${DIM}Copy the prompt above and paste it into your favourite coding agent.${RESET}`);
    console.log(`  ${DIM}Supported agents: Claude, Codex, Gemini, Cursor, VS Code, AntiGravity${RESET}\n`);

  } catch (error) {
    if (error.status === 404) {
      console.log(`${DIM}No tasks available to continue.${RESET}\n`);
      return;
    }
    displayMessageBox('Error', error.message, 'error');
    process.exit(1);
  }
}

// Fallback command - cancel work from last completed task
async function fallbackCommand() {
  if (!config.isAuthenticated()) {
    displayMessageBox('Not Authenticated', 'Please run "gbos auth" first.', 'warning');
    process.exit(1);
  }

  const connection = config.getConnection();
  if (!connection) {
    displayMessageBox('Not Connected', 'Please run "gbos connect" first.', 'warning');
    process.exit(1);
  }

  try {
    // Get current task
    let task;
    try {
      const currentResponse = await api.getCurrentTask();
      task = currentResponse.data;
    } catch (e) {
      // No current task
    }

    if (!task) {
      console.log(`${DIM}No active task to cancel.${RESET}\n`);
      return;
    }

    // Cancel the task
    await api.cancelTask(task.id, {
      reason: 'User requested fallback',
    });

    console.log(`\n${fg(...LOGO_LIGHT)}✓${RESET} Task cancelled: ${task.title || task.name || task.id}\n`);
    console.log(`${DIM}All work from this task has been discarded.${RESET}\n`);

  } catch (error) {
    displayMessageBox('Error', error.message, 'error');
    process.exit(1);
  }
}

// Add task command - interactive task creation
async function addTaskCommand() {
  if (!config.isAuthenticated()) {
    displayMessageBox('Not Authenticated', 'Please run "gbos auth" first.', 'warning');
    process.exit(1);
  }

  const connection = config.getConnection();
  if (!connection) {
    displayMessageBox('Not Connected', 'Please run "gbos connect" first.', 'warning');
    process.exit(1);
  }

  const rl = createReadlineInterface();

  console.log(`\n${BOLD}Create New Task${RESET}`);
  console.log(`${DIM}Fill in the task details below. Press Enter to use defaults.${RESET}\n`);

  try {
    // Required fields
    const title = await promptText(rl, 'Task title', '');
    if (!title) {
      console.log(`\n${DIM}Task title is required. Cancelled.${RESET}\n`);
      rl.close();
      return;
    }

    const description = await promptText(rl, 'Description (what needs to be done)', '');

    // Priority selection
    const priority = await promptSelect(rl, 'Priority level:', [
      { label: 'Low', value: 'low' },
      { label: 'Normal', value: 'normal' },
      { label: 'High', value: 'high' },
      { label: 'Urgent', value: 'urgent' },
    ]);

    // Task type
    const taskType = await promptSelect(rl, 'Task type:', [
      { label: 'Feature - New functionality', value: 'feature' },
      { label: 'Bug Fix - Fix an issue', value: 'bug' },
      { label: 'Refactor - Improve code', value: 'refactor' },
      { label: 'Documentation - Update docs', value: 'docs' },
      { label: 'Test - Add/update tests', value: 'test' },
      { label: 'Other', value: 'other' },
    ]);

    // Prompt/instructions for coding agent
    console.log(`\n  ${CYAN}?${RESET} Detailed instructions for the coding agent:`);
    console.log(`    ${DIM}(Enter a blank line to finish)${RESET}`);

    let prompt = '';
    const promptLines = [];

    const collectPrompt = () => {
      return new Promise((resolve) => {
        const askLine = () => {
          rl.question('    ', (line) => {
            if (line === '') {
              resolve(promptLines.join('\n'));
            } else {
              promptLines.push(line);
              askLine();
            }
          });
        };
        askLine();
      });
    };

    prompt = await collectPrompt();

    // Optional: Add attachments
    const hasAttachments = await promptYesNo(rl, 'Add attachment URLs?', false);
    const attachments = [];

    if (hasAttachments) {
      console.log(`  ${DIM}Enter attachment URLs (blank line to finish):${RESET}`);
      let addingAttachments = true;
      while (addingAttachments) {
        const url = await promptText(rl, 'URL', '');
        if (!url) {
          addingAttachments = false;
        } else {
          const name = await promptText(rl, 'Name for this attachment', `Attachment ${attachments.length + 1}`);
          attachments.push({ url, name });
        }
      }
    }

    // Optional: Add metadata
    const hasMetadata = await promptYesNo(rl, 'Add custom metadata (JSON)?', false);
    let metadata = {};

    if (hasMetadata) {
      const metadataStr = await promptText(rl, 'Enter JSON metadata', '{}');
      try {
        metadata = JSON.parse(metadataStr);
      } catch (e) {
        console.log(`  ${YELLOW}Warning: Invalid JSON, using empty metadata${RESET}`);
      }
    }

    // Due date (optional)
    const hasDueDate = await promptYesNo(rl, 'Set a due date?', false);
    let dueDate = null;

    if (hasDueDate) {
      const dueDateStr = await promptText(rl, 'Due date (YYYY-MM-DD)', '');
      if (dueDateStr && /^\d{4}-\d{2}-\d{2}$/.test(dueDateStr)) {
        dueDate = dueDateStr;
      }
    }

    rl.close();

    // Build task data
    const taskData = {
      title,
      description,
      prompt: prompt || description,
      priority,
      task_type: taskType,
      node_id: connection.node?.id,
      application_id: connection.application?.id || connection.node?.application_id,
    };

    if (attachments.length > 0) {
      taskData.attachments = attachments;
    }

    if (Object.keys(metadata).length > 0) {
      taskData.metadata = metadata;
    }

    if (dueDate) {
      taskData.due_date = dueDate;
    }

    // Show summary
    console.log(`\n${fg(...LOGO_PURPLE)}${'─'.repeat(60)}${RESET}`);
    console.log(`${BOLD}  Task Summary${RESET}`);
    console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(60)}${RESET}\n`);
    console.log(`  ${DIM}Title:${RESET} ${title}`);
    console.log(`  ${DIM}Type:${RESET} ${taskType}`);
    console.log(`  ${DIM}Priority:${RESET} ${priority}`);
    if (description) console.log(`  ${DIM}Description:${RESET} ${description.substring(0, 50)}${description.length > 50 ? '...' : ''}`);
    if (attachments.length > 0) console.log(`  ${DIM}Attachments:${RESET} ${attachments.length} file(s)`);
    if (dueDate) console.log(`  ${DIM}Due date:${RESET} ${dueDate}`);
    console.log('');

    // Confirm and create
    const rl2 = createReadlineInterface();
    const confirm = await promptYesNo(rl2, 'Create this task?', true);
    rl2.close();

    if (!confirm) {
      console.log(`\n${DIM}Task creation cancelled.${RESET}\n`);
      return;
    }

    // Create task via API
    console.log(`\n${DIM}Creating task...${RESET}`);

    try {
      const response = await api.createTask(taskData);
      const task = response.data;

      console.log(`\n${GREEN}✓${RESET} ${BOLD}Task created successfully!${RESET}`);
      console.log(`  ${DIM}Task ID:${RESET} ${task.id || 'N/A'}`);
      console.log(`  ${DIM}Status:${RESET} ${task.status || 'pending'}\n`);

    } catch (error) {
      if (error.status === 404 || error.message?.includes('not found')) {
        console.log(`\n${YELLOW}Note:${RESET} The create task endpoint is not implemented yet.`);
        console.log(`${DIM}Required API: POST /api/v1/cli/tasks${RESET}`);
        console.log(`\n${DIM}Request body that would be sent:${RESET}`);
        console.log(JSON.stringify(taskData, null, 2));
        console.log('');
      } else {
        throw error;
      }
    }

  } catch (error) {
    rl.close();
    displayMessageBox('Error', error.message, 'error');
    process.exit(1);
  }
}

// Execute git command
function execGit(args, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    exec(`git ${args}`, { cwd, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// Get GitLab URL and token from session or env
function getGitLabConfig() {
  const session = config.loadSession();
  return {
    url: session?.gitlab_url || process.env.GITLAB_URL || 'https://gitlab.com',
    token: session?.gitlab_token || process.env.GITLAB_TOKEN || null,
  };
}

// Completed command - commit, push, and complete task
async function completedCommand(options) {
  const cwd = process.cwd();
  const dirName = path.basename(cwd);

  console.log(`\n${DIM}Processing completion...${RESET}\n`);

  // Step 1: Check if current directory is a git repo
  let isGitRepo = false;
  let hasRemote = false;
  let remoteUrl = '';

  try {
    await execGit('rev-parse --is-inside-work-tree', cwd);
    isGitRepo = true;
    console.log(`  ${GREEN}✓${RESET} Git repository detected`);

    // Check for remote
    try {
      remoteUrl = await execGit('remote get-url origin', cwd);
      hasRemote = true;
      console.log(`  ${GREEN}✓${RESET} Remote: ${remoteUrl}`);
    } catch (e) {
      hasRemote = false;
      console.log(`  ${YELLOW}!${RESET} No remote configured`);
    }
  } catch (e) {
    isGitRepo = false;
    console.log(`  ${YELLOW}!${RESET} Not a git repository`);
  }

  // Step 2: Initialize git if needed
  if (!isGitRepo) {
    console.log(`\n  ${DIM}Initializing git repository...${RESET}`);
    try {
      await execGit('init', cwd);
      isGitRepo = true;
      console.log(`  ${GREEN}✓${RESET} Git repository initialized`);
    } catch (e) {
      displayMessageBox('Error', `Failed to initialize git: ${e.message}`, 'error');
      process.exit(1);
    }
  }

  // Step 3: Create GitLab repo if no remote
  if (!hasRemote) {
    const gitlab = getGitLabConfig();

    if (!gitlab.token) {
      console.log(`\n  ${YELLOW}!${RESET} No GitLab token configured.`);
      console.log(`  ${DIM}Set GITLAB_TOKEN environment variable to auto-create repos.${RESET}`);
      console.log(`  ${DIM}Skipping remote setup...${RESET}\n`);
    } else {
      console.log(`\n  ${DIM}Creating GitLab repository "${dirName}"...${RESET}`);

      try {
        const response = await fetch(`${gitlab.url}/api/v4/projects`, {
          method: 'POST',
          headers: {
            'PRIVATE-TOKEN': gitlab.token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: dirName,
            visibility: 'private',
            initialize_with_readme: false,
          }),
        });

        if (response.ok) {
          const repo = await response.json();
          remoteUrl = repo.ssh_url_to_repo || repo.http_url_to_repo;

          // Add remote
          await execGit(`remote add origin ${remoteUrl}`, cwd);
          hasRemote = true;

          console.log(`  ${GREEN}✓${RESET} GitLab repository created: ${repo.web_url}`);
          console.log(`  ${GREEN}✓${RESET} Remote added: ${remoteUrl}`);
        } else {
          const error = await response.json();
          if (error.message && error.message.includes('has already been taken')) {
            // Repo exists, try to find and add it
            console.log(`  ${YELLOW}!${RESET} Repository "${dirName}" already exists on GitLab`);

            // Try to get user info and construct URL
            try {
              const userResponse = await fetch(`${gitlab.url}/api/v4/user`, {
                headers: { 'PRIVATE-TOKEN': gitlab.token },
              });
              if (userResponse.ok) {
                const user = await userResponse.json();
                remoteUrl = `git@${new URL(gitlab.url).hostname}:${user.username}/${dirName}.git`;
                await execGit(`remote add origin ${remoteUrl}`, cwd);
                hasRemote = true;
                console.log(`  ${GREEN}✓${RESET} Remote added: ${remoteUrl}`);
              }
            } catch (e) {
              console.log(`  ${DIM}Could not auto-configure remote. Add manually with:${RESET}`);
              console.log(`  ${DIM}git remote add origin <your-repo-url>${RESET}`);
            }
          } else {
            console.log(`  ${YELLOW}!${RESET} Failed to create repo: ${error.message || response.status}`);
          }
        }
      } catch (e) {
        console.log(`  ${YELLOW}!${RESET} Failed to create GitLab repo: ${e.message}`);
      }
    }
  }

  // Step 4: Stage all changes
  console.log(`\n  ${DIM}Staging changes...${RESET}`);
  try {
    await execGit('add -A', cwd);
    console.log(`  ${GREEN}✓${RESET} Changes staged`);
  } catch (e) {
    console.log(`  ${YELLOW}!${RESET} Failed to stage: ${e.message}`);
  }

  // Step 5: Check for changes to commit
  let hasChanges = false;
  try {
    const status = await execGit('status --porcelain', cwd);
    hasChanges = status.length > 0;
  } catch (e) {
    // Assume changes exist
    hasChanges = true;
  }

  // Step 6: Commit changes
  if (hasChanges) {
    console.log(`  ${DIM}Committing changes...${RESET}`);

    // Get current task for commit message
    let taskInfo = '';
    try {
      if (config.isAuthenticated() && config.getConnection()) {
        const currentResponse = await api.getCurrentTask();
        const task = currentResponse.data?.task || currentResponse.data;
        if (task) {
          taskInfo = task.task_key ? `[${task.task_key}] ` : `[Task #${task.id}] `;
        }
      }
    } catch (e) {
      // No task info available
    }

    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const commitMessage = options.message || `${taskInfo}Completed: ${timestamp}`;

    try {
      await execGit(`commit -m "${commitMessage.replace(/"/g, '\\"')}"`, cwd);
      console.log(`  ${GREEN}✓${RESET} Changes committed: "${commitMessage}"`);
    } catch (e) {
      if (e.message.includes('nothing to commit')) {
        console.log(`  ${DIM}No changes to commit${RESET}`);
      } else {
        console.log(`  ${YELLOW}!${RESET} Commit failed: ${e.message}`);
      }
    }
  } else {
    console.log(`  ${DIM}No changes to commit${RESET}`);
  }

  // Step 7: Push to remote
  if (hasRemote) {
    console.log(`  ${DIM}Pushing to remote...${RESET}`);
    try {
      // Try to get current branch
      let branch = 'main';
      try {
        branch = await execGit('rev-parse --abbrev-ref HEAD', cwd);
      } catch (e) {
        branch = 'main';
      }

      // Push with upstream tracking
      try {
        await execGit(`push -u origin ${branch}`, cwd);
        console.log(`  ${GREEN}✓${RESET} Pushed to origin/${branch}`);
      } catch (e) {
        // If push fails, try setting upstream
        if (e.message.includes('no upstream branch')) {
          await execGit(`push --set-upstream origin ${branch}`, cwd);
          console.log(`  ${GREEN}✓${RESET} Pushed to origin/${branch}`);
        } else {
          throw e;
        }
      }
    } catch (e) {
      console.log(`  ${YELLOW}!${RESET} Push failed: ${e.message}`);
      console.log(`  ${DIM}You may need to push manually with: git push -u origin main${RESET}`);
    }
  }

  // Step 8: Mark GBOS task as complete (if authenticated and connected)
  if (config.isAuthenticated() && config.getConnection()) {
    try {
      const currentResponse = await api.getCurrentTask();
      const task = currentResponse.data?.task || currentResponse.data;

      if (task && task.status === 'in_progress') {
        console.log(`\n  ${DIM}Marking GBOS task as complete...${RESET}`);
        await api.completeTask(task.id, {
          completion_notes: options.message || 'Completed via gbos completed command',
        });
        console.log(`  ${GREEN}✓${RESET} Task "${task.title || task.id}" marked as complete`);
      }
    } catch (e) {
      // Task completion is optional, don't fail the whole command
      if (e.status !== 404) {
        console.log(`  ${DIM}Note: Could not update GBOS task status${RESET}`);
      }
    }
  }

  // Final summary
  const termWidth = getTerminalWidth();
  const tableWidth = Math.min(60, termWidth - 4);

  console.log(`\n${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}`);
  console.log(`${GREEN}✓${RESET} ${BOLD}Completion finished!${RESET}`);
  console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}\n`);

  if (remoteUrl) {
    console.log(`  ${DIM}Repository:${RESET} ${remoteUrl}`);
  }
  console.log(`  ${DIM}Run "gbos continue" to start the next task.${RESET}\n`);
}

module.exports = {
  tasksCommand,
  nextTaskCommand,
  continueCommand,
  fallbackCommand,
  addTaskCommand,
  completedCommand,
  generateAgentPrompt,
};
