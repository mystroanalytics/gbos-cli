const api = require('../lib/api');
const config = require('../lib/config');
const { checkForUpdates } = require('../lib/version');
const { displayConnectBanner, displayMessageBox, colors } = require('../lib/display');
const { setupProjectSkills } = require('../lib/skills');
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

    // Try to fetch applications directly first
    let appOptions = [];
    let nodesByApp = {};

    try {
      // Try the applications endpoint first
      const appsResponse = await api.listApplications();
      if (process.env.DEBUG) {
        console.log('Applications API response:', JSON.stringify(appsResponse, null, 2));
      }
      const applications = appsResponse.data || [];

      if (applications.length > 0) {
        appOptions = applications.map((app) => ({
          id: app.id,
          name: app.name || `Application ${app.id}`,
          description: app.description,
          nodeCount: app.nodes_count || app.nodesCount || '?',
          application: app,
        }));
      }
      if (process.env.DEBUG) {
        console.log(`Found ${applications.length} applications from /cli/applications`);
      }
    } catch (err) {
      // Applications endpoint not available, fall back to deriving from nodes
      if (process.env.DEBUG) {
        console.log('Note: /cli/applications endpoint error:', err.message);
        console.log('Falling back to nodes endpoint');
      }
    }

    // If no applications from direct endpoint, derive from nodes
    if (appOptions.length === 0) {
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
      nodes.forEach((node) => {
        const appId = node.application_id || 'unassigned';
        if (nodesByApp[appId] === undefined) {
          nodesByApp[appId] = {
            application: node.application,
            nodes: [],
          };
        }
        nodesByApp[appId].nodes.push(node);
      });

      const appIds = Object.keys(nodesByApp);
      appOptions = appIds.map((appId) => ({
        id: appId,
        name: nodesByApp[appId].application?.name || `Application ${appId}`,
        nodeCount: nodesByApp[appId].nodes.length,
        application: nodesByApp[appId].application,
      }));
    }

    if (appOptions.length === 0) {
      displayMessageBox(
        'No Applications Available',
        'No applications found. Please create an application in the GBOS web interface.',
        'warning'
      );
      process.exit(1);
    }

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
    let appNodes;
    let selectedApplication = selectedApp.application;

    if (nodesByApp[selectedApp.id]) {
      // We already have nodes from the fallback path
      appNodes = nodesByApp[selectedApp.id].nodes;
      selectedApplication = nodesByApp[selectedApp.id].application || selectedApp.application;
    } else {
      // Fetch nodes for the selected application
      console.log(`\nFetching nodes for ${selectedApp.name}...\n`);
      const nodesResponse = await api.listNodes(selectedApp.id);
      appNodes = nodesResponse.data || [];

      if (appNodes.length === 0) {
        displayMessageBox(
          'No Nodes Available',
          `No development nodes found for "${selectedApp.name}". Please create a development node in the GBOS web interface.`,
          'warning'
        );
        return;
      }
    }

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
    if (!accountName || accountName.startsWith('Account ')) {
      try {
        const sessionInfo = await api.getSession();
        accountName = sessionInfo.data?.account?.name || session.account_name || `Account ${session.account_id}`;
      } catch (e) {
        // Keep existing account_name or fallback
      }
    }

    // Get application name - prefer from node's embedded application, then selectedApplication
    const applicationName = node.application?.name ||
      selectedNode.application?.name ||
      selectedApplication?.name ||
      'N/A';

    // Save connection to session
    config.saveConnection({
      connection_id,
      node: {
        id: node.id,
        uuid: node.uuid,
        name: node.name,
        node_type: node.node_type,
        system_prompt: node.system_prompt,
        application_id: node.application_id || selectedNode.application_id,
      },
      application: {
        id: node.application?.id || selectedApplication?.id,
        name: applicationName,
      },
      connected_at: new Date().toISOString(),
      working_directory: workingDirectory,
      git_repo_url: gitRepoUrl,
      git_branch: gitBranch,
    });

    // Generate skill files for coding tools
    const skillsResults = setupProjectSkills(workingDirectory);
    if (process.env.DEBUG) {
      console.log('Skills setup results:', JSON.stringify(skillsResults, null, 2));
    }

    // Get user name from session
    const userName = session.user_first_name && session.user_last_name
      ? `${session.user_first_name} ${session.user_last_name}`
      : session.user_name || 'N/A';

    // Display success with banner
    displayConnectBanner({
      accountName: accountName,
      userName: userName,
      sessionId: connection_id,
      applicationName: applicationName,
      nodeName: node.name,
    });

    // Exit after successful connection
    process.exit(0);

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
