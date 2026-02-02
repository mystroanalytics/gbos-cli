const api = require('../lib/api');
const config = require('../lib/config');
const { checkForUpdates } = require('../lib/version');
const { displayConnectSuccess, displayMessageBox, colors } = require('../lib/display');
const readline = require('readline');
const { execSync } = require('child_process');

const ESC = '\x1b';
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const PURPLE = `${ESC}[38;5;99m`;
const WHITE = `${ESC}[37m`;
const CYAN = `${ESC}[36m`;

// Interactive arrow key selector
async function selectWithArrows(title, options, displayFn) {
  return new Promise((resolve) => {
    let selectedIndex = 0;
    const stdin = process.stdin;
    const stdout = process.stdout;

    // Save cursor position and hide cursor
    stdout.write(`${ESC}[?25l`);

    function render() {
      // Move cursor to start and clear
      stdout.write(`${ESC}[${options.length + 3}A${ESC}[J`);

      console.log(`\n${PURPLE}${title}${RESET}\n`);

      options.forEach((opt, index) => {
        const isSelected = index === selectedIndex;
        const prefix = isSelected ? `${CYAN}❯${RESET}` : ' ';
        const text = displayFn ? displayFn(opt, isSelected) : opt.name;

        if (isSelected) {
          console.log(`  ${prefix} ${BOLD}${WHITE}${text}${RESET}`);
        } else {
          console.log(`  ${prefix} ${DIM}${text}${RESET}`);
        }
      });

      console.log(`\n  ${DIM}↑/↓ to navigate, Enter to select, q to cancel${RESET}`);
    }

    // Initial render
    console.log(`\n${PURPLE}${title}${RESET}\n`);
    options.forEach((opt, index) => {
      const isSelected = index === selectedIndex;
      const prefix = isSelected ? `${CYAN}❯${RESET}` : ' ';
      const text = displayFn ? displayFn(opt, isSelected) : opt.name;

      if (isSelected) {
        console.log(`  ${prefix} ${BOLD}${WHITE}${text}${RESET}`);
      } else {
        console.log(`  ${prefix} ${DIM}${text}${RESET}`);
      }
    });
    console.log(`\n  ${DIM}↑/↓ to navigate, Enter to select, q to cancel${RESET}`);

    // Enable raw mode
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.setEncoding('utf8');

    function cleanup() {
      if (stdin.isTTY) {
        stdin.setRawMode(false);
      }
      stdin.removeListener('data', onKeypress);
      // Show cursor
      stdout.write(`${ESC}[?25h`);
    }

    function onKeypress(key) {
      // Ctrl+C
      if (key === '\u0003') {
        cleanup();
        process.exit();
      }

      // q or Q to quit
      if (key === 'q' || key === 'Q') {
        cleanup();
        resolve(null);
        return;
      }

      // Enter
      if (key === '\r' || key === '\n') {
        cleanup();
        resolve(options[selectedIndex]);
        return;
      }

      // Arrow keys (escape sequences)
      if (key === `${ESC}[A` || key === 'k') {
        // Up
        selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : options.length - 1;
        render();
      } else if (key === `${ESC}[B` || key === 'j') {
        // Down
        selectedIndex = selectedIndex < options.length - 1 ? selectedIndex + 1 : 0;
        render();
      }
    }

    stdin.on('data', onKeypress);
  });
}

// Get git info from current directory
function getGitInfo() {
  try {
    const gitRepoUrl = execSync('git config --get remote.origin.url', { encoding: 'utf8' }).trim();
    const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    return { gitRepoUrl, gitBranch };
  } catch (e) {
    return { gitRepoUrl: null, gitBranch: null };
  }
}

async function connectCommand(options) {
  // Check for updates first
  await checkForUpdates();

  // Check authentication
  if (!config.isAuthenticated()) {
    displayMessageBox(
      'Not Authenticated',
      'Please run "gbos auth" first to authenticate.',
      'warning'
    );
    process.exit(1);
  }

  try {
    // Check if already connected
    const currentConnection = config.getConnection();
    if (currentConnection && !options.force) {
      displayMessageBox(
        'Already Connected',
        `Connected to node: ${currentConnection.node?.name}. Use --force to reconnect or "gbos disconnect" first.`,
        'info'
      );
      return;
    }

    console.log('\nFetching available applications...\n');

    // Fetch available nodes
    const nodesResponse = await api.listNodes();
    const nodes = nodesResponse.data || [];

    if (nodes.length === 0) {
      displayMessageBox(
        'No Nodes Available',
        'No development nodes available. Please create a development node in the GBOS web interface.',
        'warning'
      );
      process.exit(1);
    }

    // Group nodes by application
    const nodesByApp = {};
    nodes.forEach((node) => {
      const appId = node.application_id || 'unassigned';
      if (!nodesByApp[appId]) {
        nodesByApp[appId] = {
          application: node.application,
          nodes: [],
        };
      }
      nodesByApp[appId].nodes.push(node);
    });

    const appIds = Object.keys(nodesByApp);

    // Build application options
    const appOptions = appIds.map((appId) => ({
      id: appId,
      name: nodesByApp[appId].application?.name || `Application ${appId}`,
      nodeCount: nodesByApp[appId].nodes.length,
      application: nodesByApp[appId].application,
    }));

    // Always show application selection (even if only one)
    const selectedApp = await selectWithArrows(
      'Select an application:',
      appOptions,
      (opt) => `${opt.name} ${DIM}(${opt.nodeCount} node${opt.nodeCount > 1 ? 's' : ''})${RESET}`
    );

    if (!selectedApp) {
      console.log('\nConnection cancelled.\n');
      return;
    }

    // Get nodes for selected application
    const appNodes = nodesByApp[selectedApp.id].nodes;
    const selectedApplication = nodesByApp[selectedApp.id].application;

    // Build node options
    const nodeOptions = appNodes.map((node) => ({
      ...node,
      displayName: node.name,
      nodeType: node.node_type || '',
      isBusy: node.is_connected && node.active_connection,
    }));

    // Select a node
    const selectedNode = await selectWithArrows(
      'Select a development node:',
      nodeOptions,
      (opt) => {
        let text = opt.displayName;
        if (opt.nodeType) text += ` ${DIM}[${opt.nodeType}]${RESET}`;
        if (opt.isBusy) text += ` ${DIM}(busy)${RESET}`;
        return text;
      }
    );

    if (!selectedNode) {
      console.log('\nConnection cancelled.\n');
      return;
    }

    // Check if node is busy
    if (selectedNode.isBusy) {
      displayMessageBox(
        'Node Busy',
        `Node "${selectedNode.name}" is already connected by another user. Please select a different node.`,
        'warning'
      );
      return;
    }

    // Get connection info
    const workingDirectory = options.dir || process.cwd();
    const { gitRepoUrl, gitBranch } = getGitInfo();
    const agentCli = options.agent || 'claude-code';

    console.log(`\nConnecting to node: ${selectedNode.name}...`);

    // Connect to node
    const connectResponse = await api.connectToNode(selectedNode.id, {
      working_directory: workingDirectory,
      git_repo_url: gitRepoUrl,
      git_branch: gitBranch,
      agent_cli: agentCli,
    });

    const { connection_id, node } = connectResponse.data;

    // Get session info (already has account_name from auth)
    const session = config.loadSession() || {};

    // Try to get account name from session API if not stored
    let accountName = session.account_name;
    if (!accountName) {
      try {
        const sessionInfo = await api.getSession();
        accountName = sessionInfo.data?.account?.name || `Account ${session.account_id}`;
      } catch (e) {
        accountName = `Account ${session.account_id}`;
      }
    }

    // Save connection to session
    config.saveConnection({
      connection_id,
      node: {
        id: node.id,
        uuid: node.uuid,
        name: node.name,
        node_type: node.node_type,
        system_prompt: node.system_prompt,
        application_id: selectedNode.application_id,
      },
      application: {
        id: selectedApplication?.id,
        name: selectedApplication?.name,
      },
      connected_at: new Date().toISOString(),
      working_directory: workingDirectory,
      git_repo_url: gitRepoUrl,
      git_branch: gitBranch,
    });

    // Display success with logo and summary
    displayConnectSuccess({
      accountName: accountName,
      applicationName: selectedApplication?.name || 'N/A',
      nodeName: node.name,
    });

  } catch (error) {
    if (error.code === 'NODE_BUSY') {
      displayMessageBox(
        'Node Busy',
        'This node is already connected to another CLI session.',
        'error'
      );
    } else {
      displayMessageBox('Connection Failed', error.message, 'error');
    }
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exit(1);
  }
}

module.exports = connectCommand;
