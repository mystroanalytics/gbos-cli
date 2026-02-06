/**
 * Orchestrator Commands
 * CLI commands for start, resume, and stop
 * Beautiful terminal output with real-time agent streaming
 */

const config = require('../lib/config');
const api = require('../lib/api');
const { displayMessageBox, fg, LOGO_PURPLE, RESET, BOLD, DIM, getTerminalWidth } = require('../lib/display');
const Orchestrator = require('../orchestrator/orchestrator');
const { StateMachine, STATES, RUNS_DIR } = require('../orchestrator/state-machine');
const { checkInstalledAdapters } = require('../orchestrator/adapters');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Colors
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';

// Spinner characters
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function createSpinner(text) {
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r  ${CYAN}${SPINNER[i % SPINNER.length]}${RESET} ${text}`);
    i++;
  }, 80);
  return {
    stop: (finalText) => {
      clearInterval(interval);
      process.stdout.write(`\r  ${GREEN}✓${RESET} ${finalText || text}\n`);
    },
    fail: (finalText) => {
      clearInterval(interval);
      process.stdout.write(`\r  ${RED}✗${RESET} ${finalText || text}\n`);
    },
  };
}

/**
 * Prompt user for yes/no confirmation
 */
function promptConfirm(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`  ${CYAN}?${RESET} ${question} ${DIM}(y/N)${RESET}: `, (answer) => {
      rl.close();
      const lower = answer.trim().toLowerCase();
      resolve(lower === 'y' || lower === 'yes');
    });
  });
}

/**
 * Check if directory is a git repo with a matching remote
 */
async function isMatchingGitRepo(dir, repoUrl) {
  try {
    const { stdout } = await execAsync('git remote get-url origin', { cwd: dir });
    const currentUrl = stdout.trim();
    const normalize = (url) => url
      .replace(/\.git$/, '')
      .replace(/^git@([^:]+):/, 'https://$1/')
      .replace(/^https?:\/\//, '')
      .toLowerCase();
    return normalize(currentUrl) === normalize(repoUrl);
  } catch (e) {
    return false;
  }
}

/**
 * Check if a directory is empty (ignoring hidden files like .DS_Store)
 */
function isDirEmpty(dir) {
  if (!fs.existsSync(dir)) return true;
  const entries = fs.readdirSync(dir).filter(f => f !== '.DS_Store');
  return entries.length === 0;
}

/**
 * Pre-check workspace: ensure CWD is the app's repo or offer to initialize
 * Returns the working directory to use, or null to abort
 */
async function preCheckWorkspace(connection) {
  const currentDir = process.cwd();

  // Get application details to find the repo URL
  let app = connection.application;
  if (app?.id) {
    try {
      const response = await api.getApplication(app.id);
      app = response.data || response;
    } catch (e) {
      // Use connection's app data
    }
  }

  const repoUrl = app?.gitlab_repo_url || app?.repo_url || app?.repository_url;

  // If no repo URL configured, use CWD as local-only workspace
  if (!repoUrl) {
    console.log(`  ${DIM}No repository configured - using local workspace${RESET}`);
    return currentDir;
  }

  // Check if CWD is already the matching repo
  const isMatching = await isMatchingGitRepo(currentDir, repoUrl);
  if (isMatching) {
    console.log(`  ${GREEN}✓${RESET} Current directory matches app repository`);
    return currentDir;
  }

  // CWD doesn't match - check if it's empty
  const empty = isDirEmpty(currentDir);

  if (!empty) {
    // Directory is not empty and not the repo
    console.log(`  ${RED}✗${RESET} Current directory is not the app's GitLab repository`);
    console.log(`    ${DIM}Expected repo: ${repoUrl}${RESET}`);
    console.log(`    ${DIM}Current dir: ${currentDir}${RESET}\n`);
    console.log(`  ${YELLOW}!${RESET} To use this directory, it must either be:`);
    console.log(`    1. The root of the GitLab repository (clone it first)`);
    console.log(`    2. An empty folder (GBOS will initialize the repo for you)\n`);
    return null;
  }

  // Directory is empty - offer to initialize
  console.log(`  ${YELLOW}!${RESET} Current directory is empty and not a git repository`);
  console.log(`    ${DIM}App repo: ${repoUrl}${RESET}`);
  console.log(`    ${DIM}Current dir: ${currentDir}${RESET}\n`);

  const confirmed = await promptConfirm(`Initialize GitLab repository for "${app.name || 'this app'}" in this directory?`);

  if (!confirmed) {
    console.log(`\n  ${DIM}Aborted. Navigate to the correct repo directory or use an empty folder.${RESET}\n`);
    return null;
  }

  console.log('');
  return currentDir;
}

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

  // Pre-check workspace (unless --dir is explicitly provided)
  let workingDir = options.dir ? path.resolve(options.dir) : null;
  if (!workingDir) {
    workingDir = await preCheckWorkspace(connection);
    if (workingDir === null) {
      process.exit(1);
    }
  }

  // Check agent availability
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
    autoApprove: options.autoApprove !== false,
    createMR: options.mr !== false,
    continuous: options.continuous || false,
    maxTasks: options.maxTasks ? parseInt(options.maxTasks) : 1,
    workingDir: workingDir,
    skipVerification: options.skipVerification || false,
    skipGit: options.skipGit || false,
    taskId: options.taskId || null,
  });

  // Track active spinner
  let activeSpinner = null;

  // Set up event handlers
  orchestrator.on('started', ({ runId }) => {
    console.log(`  ${GREEN}✓${RESET} Run started: ${DIM}${runId}${RESET}\n`);
  });

  orchestrator.on('stage', ({ stage }) => {
    // Stop any active spinner
    if (activeSpinner) {
      activeSpinner.stop();
      activeSpinner = null;
    }

    const stageLabels = {
      auth_config: 'Authenticating & configuring',
      workspace_ready: 'Preparing workspace',
      fetch_task: 'Fetching next task',
      generate_prompt: 'Generating agent prompt',
      run_agent: null, // handled by agent_start
      post_process: 'Post-processing',
      run_tests: 'Running tests',
      commit_push: 'Committing & pushing',
      report_status: 'Reporting status to GBOS',
    };

    const label = stageLabels[stage];
    if (label) {
      activeSpinner = createSpinner(label);
    }
  });

  orchestrator.on('agent_start', ({ agent }) => {
    if (activeSpinner) {
      activeSpinner.stop();
      activeSpinner = null;
    }
    console.log(`\n${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}`);
    console.log(`${BOLD}  Agent Output${RESET} ${DIM}(${agent})${RESET}`);
    console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}\n`);
  });

  orchestrator.on('agent_done', ({ exitCode }) => {
    console.log(`\n${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}`);
    if (exitCode === 0) {
      console.log(`  ${GREEN}✓${RESET} Agent completed successfully`);
    } else {
      console.log(`  ${YELLOW}!${RESET} Agent exited with code ${exitCode}`);
    }
    console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}\n`);
  });

  orchestrator.on('log', ({ message }) => {
    // Only show important logs, not during spinner stages
    if (!activeSpinner) {
      // Don't print "Stage: X" logs since we handle those with spinners
      if (!message.startsWith('Stage:')) {
        console.log(`    ${DIM}${message}${RESET}`);
      }
    }
  });

  orchestrator.on('prompt', ({ prompt }) => {
    if (options.showPrompt) {
      if (activeSpinner) { activeSpinner.stop(); activeSpinner = null; }
      console.log(`\n${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}`);
      console.log(`${BOLD}  Task Prompt${RESET}`);
      console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}\n`);
      console.log(prompt);
      console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}\n`);
    }
  });

  orchestrator.on('committed', (result) => {
    if (activeSpinner) { activeSpinner.stop(); activeSpinner = null; }
    if (result.commit) {
      console.log(`    ${GREEN}✓${RESET} Committed: ${result.commit.shortHash}`);
    }
    if (result.mergeRequest) {
      console.log(`    ${GREEN}✓${RESET} MR: ${result.mergeRequest.url}`);
    }
  });

  orchestrator.on('completed', ({ tasksCompleted }) => {
    if (activeSpinner) { activeSpinner.stop(); activeSpinner = null; }
    console.log(`\n${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}`);
    console.log(`${GREEN}✓${RESET} ${BOLD}Orchestrator completed${RESET}`);
    console.log(`  ${DIM}Tasks completed: ${tasksCompleted}${RESET}`);
    console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}\n`);
  });

  orchestrator.on('failed', ({ error }) => {
    if (activeSpinner) { activeSpinner.fail(); activeSpinner = null; }
    console.log(`\n${RED}✗${RESET} ${BOLD}Orchestrator failed${RESET}`);
    console.log(`  ${DIM}Error: ${error.message}${RESET}\n`);
  });

  // Handle interrupts
  process.on('SIGINT', async () => {
    if (activeSpinner) { activeSpinner.fail('Interrupted'); activeSpinner = null; }
    console.log(`\n\n  ${YELLOW}!${RESET} Stopping orchestrator...`);
    await orchestrator.stop();
    console.log(`  ${DIM}Run paused. Use "gbos resume" to continue.${RESET}\n`);
    process.exit(0);
  });

  // Start the orchestrator
  try {
    await orchestrator.start();
  } catch (error) {
    if (activeSpinner) { activeSpinner.fail(); activeSpinner = null; }
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
