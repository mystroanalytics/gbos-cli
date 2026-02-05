/**
 * Orchestrator Commands
 * CLI commands for start, resume, and stop
 */

const config = require('../lib/config');
const { displayMessageBox, fg, LOGO_PURPLE, RESET, BOLD, DIM, getTerminalWidth } = require('../lib/display');
const Orchestrator = require('../orchestrator/orchestrator');
const { StateMachine, STATES, RUNS_DIR } = require('../orchestrator/state-machine');
const { checkInstalledAdapters } = require('../orchestrator/adapters');
const fs = require('fs');
const path = require('path');

// Colors
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';

/**
 * gbos start - Start the orchestrator
 */
async function startCommand(options) {
  // Check authentication
  if (!config.isAuthenticated()) {
    displayMessageBox('Not Authenticated', 'Please run "gbos auth" first.', 'warning');
    process.exit(1);
  }

  // Check connection
  const connection = config.getConnection();
  if (!connection) {
    displayMessageBox('Not Connected', 'Please run "gbos connect" first.', 'warning');
    process.exit(1);
  }

  const termWidth = getTerminalWidth();
  const tableWidth = Math.min(80, termWidth - 4);

  console.log(`\n${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}`);
  console.log(`${BOLD}  GBOS Orchestrator${RESET}`);
  console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}\n`);

  // Check for existing active run
  const activeRun = StateMachine.getActiveRun();
  if (activeRun) {
    console.log(`  ${YELLOW}!${RESET} An active run exists: ${activeRun.runId}`);
    console.log(`  ${DIM}State: ${activeRun.state}${RESET}`);
    console.log(`  ${DIM}Use "gbos resume" to continue or "gbos stop" to cancel.${RESET}\n`);
    return;
  }

  // Check agent availability
  console.log(`  ${DIM}Checking agent availability...${RESET}`);
  const adapters = await checkInstalledAdapters();
  const agentName = options.agent || 'claude-code';
  const agentInfo = adapters[agentName] || adapters['claude-code'];

  if (!agentInfo?.available) {
    displayMessageBox('Agent Not Found', `Agent "${agentName}" is not installed.\n\nAvailable agents: ${Object.entries(adapters).filter(([_, v]) => v.available).map(([k]) => k).join(', ') || 'none'}`, 'error');
    process.exit(1);
  }

  console.log(`  ${GREEN}✓${RESET} Agent: ${agentName} (${agentInfo.version || 'installed'})`);
  console.log(`  ${DIM}Application: ${connection.application?.name || 'N/A'}${RESET}`);
  console.log(`  ${DIM}Node: ${connection.node?.name || 'N/A'}${RESET}`);
  console.log('');

  // Create orchestrator
  const orchestrator = new Orchestrator({
    agent: agentName,
    autoApprove: options.autoApprove || false,
    createMR: options.mr !== false,
    continuous: options.continuous || false,
    maxTasks: options.maxTasks ? parseInt(options.maxTasks) : 1,
    workingDir: options.dir ? path.resolve(options.dir) : null,
  });

  // Set up event handlers
  orchestrator.on('started', ({ runId }) => {
    console.log(`  ${GREEN}✓${RESET} Run started: ${runId}\n`);
  });

  orchestrator.on('stage', ({ stage }) => {
    console.log(`  ${CYAN}▸${RESET} ${stage.replace(/_/g, ' ')}`);
  });

  orchestrator.on('log', ({ message }) => {
    console.log(`    ${DIM}${message}${RESET}`);
  });

  orchestrator.on('prompt', ({ prompt }) => {
    if (options.showPrompt) {
      console.log(`\n${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}`);
      console.log(`${BOLD}  Task Prompt${RESET}`);
      console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}\n`);
      console.log(prompt);
      console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}\n`);
    }
  });

  orchestrator.on('committed', (result) => {
    if (result.commit) {
      console.log(`    ${GREEN}✓${RESET} Committed: ${result.commit.shortHash}`);
    }
    if (result.mergeRequest) {
      console.log(`    ${GREEN}✓${RESET} MR: ${result.mergeRequest.url}`);
    }
  });

  orchestrator.on('completed', ({ tasksCompleted }) => {
    console.log(`\n${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}`);
    console.log(`${GREEN}✓${RESET} ${BOLD}Orchestrator completed${RESET}`);
    console.log(`  ${DIM}Tasks completed: ${tasksCompleted}${RESET}`);
    console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}\n`);
  });

  orchestrator.on('failed', ({ error }) => {
    console.log(`\n${RED}✗${RESET} ${BOLD}Orchestrator failed${RESET}`);
    console.log(`  ${DIM}Error: ${error.message}${RESET}\n`);
  });

  // Handle interrupts
  process.on('SIGINT', async () => {
    console.log(`\n\n  ${YELLOW}!${RESET} Stopping orchestrator...`);
    await orchestrator.stop();
    console.log(`  ${DIM}Run paused. Use "gbos resume" to continue.${RESET}\n`);
    process.exit(0);
  });

  // Start the orchestrator
  try {
    await orchestrator.start();
  } catch (error) {
    console.log(`\n${RED}✗${RESET} ${error.message}\n`);
    process.exit(1);
  }
}

/**
 * gbos resume - Resume a paused run
 */
async function resumeCommand(options) {
  const termWidth = getTerminalWidth();
  const tableWidth = Math.min(80, termWidth - 4);

  console.log(`\n${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}`);
  console.log(`${BOLD}  Resume Orchestrator${RESET}`);
  console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}\n`);

  // Find run to resume
  let runId = options.runId;
  let run;

  if (runId) {
    try {
      run = StateMachine.loadRun(runId);
    } catch (e) {
      displayMessageBox('Run Not Found', `Run "${runId}" not found.`, 'error');
      process.exit(1);
    }
  } else {
    run = StateMachine.getActiveRun();
    if (!run) {
      console.log(`  ${DIM}No active runs to resume.${RESET}`);
      console.log(`  ${DIM}Use "gbos start" to begin a new run.${RESET}\n`);
      return;
    }
    runId = run.runId;
  }

  if (!run.isResumable()) {
    console.log(`  ${YELLOW}!${RESET} Run ${runId} is not resumable (state: ${run.state})`);
    return;
  }

  console.log(`  ${DIM}Resuming run: ${runId}${RESET}`);
  console.log(`  ${DIM}State: ${run.state}${RESET}`);
  console.log(`  ${DIM}Task: ${run.context.taskKey || run.context.taskId || 'N/A'}${RESET}\n`);

  // Create orchestrator and resume
  const orchestrator = new Orchestrator({
    agent: run.context.agentVendor || 'claude-code',
    createMR: options.mr !== false,
  });

  // Set up event handlers (same as start)
  orchestrator.on('stage', ({ stage }) => {
    console.log(`  ${CYAN}▸${RESET} ${stage.replace(/_/g, ' ')}`);
  });

  orchestrator.on('log', ({ message }) => {
    console.log(`    ${DIM}${message}${RESET}`);
  });

  orchestrator.on('completed', ({ tasksCompleted }) => {
    console.log(`\n${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}`);
    console.log(`${GREEN}✓${RESET} ${BOLD}Orchestrator completed${RESET}`);
    console.log(`  ${DIM}Tasks completed: ${tasksCompleted}${RESET}`);
    console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}\n`);
  });

  orchestrator.on('failed', ({ error }) => {
    console.log(`\n${RED}✗${RESET} ${BOLD}Orchestrator failed${RESET}`);
    console.log(`  ${DIM}Error: ${error.message}${RESET}\n`);
  });

  process.on('SIGINT', async () => {
    console.log(`\n\n  ${YELLOW}!${RESET} Stopping orchestrator...`);
    await orchestrator.stop();
    process.exit(0);
  });

  try {
    await orchestrator.resume(runId);
  } catch (error) {
    console.log(`\n${RED}✗${RESET} ${error.message}\n`);
    process.exit(1);
  }
}

/**
 * gbos stop - Stop an active run
 */
async function stopCommand(options) {
  const termWidth = getTerminalWidth();
  const tableWidth = Math.min(80, termWidth - 4);

  console.log(`\n${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}`);
  console.log(`${BOLD}  Stop Orchestrator${RESET}`);
  console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}\n`);

  // Find active run
  let runId = options.runId;
  let run;

  if (runId) {
    try {
      run = StateMachine.loadRun(runId);
    } catch (e) {
      displayMessageBox('Run Not Found', `Run "${runId}" not found.`, 'error');
      process.exit(1);
    }
  } else {
    run = StateMachine.getActiveRun();
    if (!run) {
      console.log(`  ${DIM}No active runs to stop.${RESET}\n`);
      return;
    }
    runId = run.runId;
  }

  if (run.state === STATES.COMPLETED || run.state === STATES.FAILED) {
    console.log(`  ${DIM}Run ${runId} is already ${run.state}.${RESET}\n`);
    return;
  }

  // Transition to paused or failed
  if (options.force) {
    run.transition(STATES.FAILED, { reason: 'Forcefully stopped by user' });
    console.log(`  ${RED}✗${RESET} Run ${runId} forcefully stopped.\n`);
  } else {
    run.transition(STATES.PAUSED, { reason: 'Stopped by user' });
    console.log(`  ${YELLOW}!${RESET} Run ${runId} paused.`);
    console.log(`  ${DIM}Use "gbos resume" to continue.${RESET}\n`);
  }
}

/**
 * gbos runs - List recent runs
 */
async function runsCommand(options) {
  const termWidth = getTerminalWidth();
  const tableWidth = Math.min(100, termWidth - 4);

  console.log(`\n${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}`);
  console.log(`${BOLD}  Orchestrator Runs${RESET}`);
  console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}\n`);

  StateMachine.ensureRunsDir();

  const files = fs.readdirSync(RUNS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, options.limit ? parseInt(options.limit) : 10);

  if (files.length === 0) {
    console.log(`  ${DIM}No runs found.${RESET}`);
    console.log(`  ${DIM}Use "gbos start" to begin a new run.${RESET}\n`);
    return;
  }

  for (const file of files) {
    try {
      const runId = file.replace('.json', '');
      const run = StateMachine.loadRun(runId);
      const summary = run.getSummary();

      const stateColors = {
        [STATES.COMPLETED]: GREEN,
        [STATES.FAILED]: RED,
        [STATES.PAUSED]: YELLOW,
      };
      const stateColor = stateColors[summary.state] || CYAN;

      console.log(`  ${stateColor}●${RESET} ${BOLD}${summary.runId}${RESET}`);
      console.log(`    ${DIM}State: ${summary.state} | Agent: ${summary.agent}${RESET}`);
      if (summary.taskKey) {
        console.log(`    ${DIM}Task: ${summary.taskKey}${RESET}`);
      }
      if (summary.startTime) {
        console.log(`    ${DIM}Started: ${new Date(summary.startTime).toLocaleString()}${RESET}`);
      }
      console.log('');
    } catch (e) {
      // Skip invalid files
    }
  }

  console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}\n`);
}

module.exports = {
  startCommand,
  resumeCommand,
  stopCommand,
  runsCommand,
};
