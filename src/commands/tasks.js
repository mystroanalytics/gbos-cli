const api = require('../lib/api');
const config = require('../lib/config');
const { displayMessageBox, printBanner, printStatusTable, fg, LOGO_LIGHT, LOGO_NAVY, RESET, BOLD, DIM, getTerminalWidth } = require('../lib/display');

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

module.exports = {
  tasksCommand,
  nextTaskCommand,
  continueCommand,
  fallbackCommand,
  autoCommand,
  generateAgentPrompt,
};
