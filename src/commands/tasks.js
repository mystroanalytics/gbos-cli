const api = require('../lib/api');
const config = require('../lib/config');
const { displayMessageBox, printBanner, printStatusTable, fg, LOGO_LIGHT, LOGO_NAVY, RESET, BOLD, DIM, getTerminalWidth } = require('../lib/display');
const readline = require('readline');

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
  if (task.priority) {
    prompt += `**Priority:** ${task.priority}\n`;
  }
  prompt += '\n';

  // Main prompt/description
  if (task.prompt) {
    prompt += `## Instructions\n\n${task.prompt}\n\n`;
  } else if (task.description) {
    prompt += `## Description\n\n${task.description}\n\n`;
  }

  // Metadata
  if (task.metadata && Object.keys(task.metadata).length > 0) {
    prompt += `## Metadata\n\n`;
    prompt += '```json\n';
    prompt += JSON.stringify(task.metadata, null, 2);
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

  return prompt;
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

    if (tasks.length === 0) {
      console.log(`${DIM}No tasks assigned to this node.${RESET}\n`);
      return;
    }

    // Display tasks in a table
    const termWidth = getTerminalWidth();
    const tableWidth = Math.min(100, termWidth - 4);

    console.log(`${fg(...LOGO_NAVY)}${'─'.repeat(tableWidth)}${RESET}`);
    console.log(`${BOLD}  Tasks for ${connection.node?.name || 'this node'}${RESET}`);
    console.log(`${fg(...LOGO_NAVY)}${'─'.repeat(tableWidth)}${RESET}\n`);

    tasks.forEach((task, index) => {
      const formatted = formatTask(task, index);
      console.log(`  ${formatted.statusDisplay}  ${BOLD}${formatted.title}${RESET}`);
      console.log(`     ${DIM}ID: ${formatted.id} | Priority: ${formatted.priority}${RESET}`);
      if (index < tasks.length - 1) console.log('');
    });

    console.log(`\n${fg(...LOGO_NAVY)}${'─'.repeat(tableWidth)}${RESET}`);
    console.log(`${DIM}  Total: ${tasks.length} task(s)${RESET}\n`);

  } catch (error) {
    if (error.status === 404 || error.message?.includes('not found')) {
      console.log(`${DIM}No tasks assigned to this node.${RESET}\n`);
      console.log(`${DIM}Note: The tasks endpoint may not be implemented yet on the server.${RESET}`);
      console.log(`${DIM}Required API: GET /api/v1/cli/tasks${RESET}\n`);
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
    const task = response.data;

    if (!task) {
      console.log(`${DIM}No pending tasks available.${RESET}\n`);
      return;
    }

    const formatted = formatTask(task);
    console.log(`${fg(...LOGO_NAVY)}${'─'.repeat(60)}${RESET}`);
    console.log(`${BOLD}  Next Task${RESET}`);
    console.log(`${fg(...LOGO_NAVY)}${'─'.repeat(60)}${RESET}\n`);
    console.log(`  ${formatted.statusDisplay}  ${BOLD}${formatted.title}${RESET}`);
    console.log(`  ${DIM}ID: ${formatted.id} | Priority: ${formatted.priority}${RESET}\n`);

    if (task.prompt || task.description) {
      console.log(`  ${DIM}${(task.prompt || task.description).substring(0, 100)}...${RESET}\n`);
    }

    console.log(`${fg(...LOGO_NAVY)}${'─'.repeat(60)}${RESET}`);
    console.log(`${DIM}  Run "gbos continue" to start working on this task.${RESET}\n`);

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
    try {
      const currentResponse = await api.getCurrentTask();
      task = currentResponse.data;
    } catch (e) {
      // No current task, get next one
    }

    // If no current task, get next task
    if (!task) {
      const response = await api.getNextTask();
      task = response.data;
    }

    if (!task) {
      console.log(`${DIM}No tasks available to continue.${RESET}\n`);
      return;
    }

    // Mark task as in progress if it's pending
    if (task.status === 'pending') {
      await api.startTask(task.id);
    }

    // Output the prompt for the coding agent
    const prompt = generateAgentPrompt(task);
    console.log(prompt);

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

// Auto command - work on all tasks and poll for new ones
async function autoCommand() {
  if (!config.isAuthenticated()) {
    displayMessageBox('Not Authenticated', 'Please run "gbos auth" first.', 'warning');
    process.exit(1);
  }

  const connection = config.getConnection();
  if (!connection) {
    displayMessageBox('Not Connected', 'Please run "gbos connect" first.', 'warning');
    process.exit(1);
  }

  const POLL_INTERVAL = 60000; // 1 minute

  console.log(`\n${BOLD}Auto Mode${RESET}`);
  console.log(`${DIM}Working through tasks and polling for new ones every minute...${RESET}\n`);
  console.log(`${DIM}Press Ctrl+C to exit.${RESET}\n`);

  const processNextTask = async () => {
    try {
      // Get next task
      const response = await api.getNextTask();
      const task = response.data;

      if (!task) {
        console.log(`${DIM}[${new Date().toLocaleTimeString()}] No pending tasks. Waiting...${RESET}`);
        return false;
      }

      console.log(`\n${fg(...LOGO_LIGHT)}●${RESET} ${BOLD}Processing: ${task.title || task.name || task.id}${RESET}\n`);

      // Mark task as in progress
      if (task.status === 'pending') {
        await api.startTask(task.id);
      }

      // Output the prompt for the coding agent
      const prompt = generateAgentPrompt(task);
      console.log(prompt);

      return true;

    } catch (error) {
      if (error.status === 404) {
        console.log(`${DIM}[${new Date().toLocaleTimeString()}] No pending tasks. Waiting...${RESET}`);
        return false;
      }
      console.error(`${DIM}Error fetching task: ${error.message}${RESET}`);
      return false;
    }
  };

  // Process tasks in a loop
  const runLoop = async () => {
    while (true) {
      const hadTask = await processNextTask();

      if (!hadTask) {
        // No task available, wait and poll again
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      } else {
        // Task was output, wait a bit before checking for more
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  };

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    console.log(`\n\n${DIM}Auto mode stopped.${RESET}\n`);
    process.exit(0);
  });

  await runLoop();
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
    console.log(`\n${fg(...LOGO_NAVY)}${'─'.repeat(60)}${RESET}`);
    console.log(`${BOLD}  Task Summary${RESET}`);
    console.log(`${fg(...LOGO_NAVY)}${'─'.repeat(60)}${RESET}\n`);
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

module.exports = {
  tasksCommand,
  nextTaskCommand,
  continueCommand,
  fallbackCommand,
  autoCommand,
  addTaskCommand,
  generateAgentPrompt,
};
