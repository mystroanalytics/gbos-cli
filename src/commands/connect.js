const api = require('../lib/api');
const config = require('../lib/config');
const readline = require('readline');
const path = require('path');
const { execSync } = require('child_process');

// Simple selection prompt
async function selectOption(message, options) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(`\n${message}\n`);

  options.forEach((opt, index) => {
    const status = opt.status ? ` [${opt.status}]` : '';
    const connected = opt.is_connected ? ' (connected by another user)' : '';
    console.log(`  ${index + 1}. ${opt.name}${status}${connected}`);
    if (opt.description) {
      console.log(`     ${opt.description}`);
    }
  });

  console.log('');

  return new Promise((resolve) => {
    rl.question('Enter number (or q to quit): ', (answer) => {
      rl.close();
      if (answer.toLowerCase() === 'q') {
        resolve(null);
        return;
      }
      const index = parseInt(answer, 10) - 1;
      if (index >= 0 && index < options.length) {
        resolve(options[index]);
      } else {
        resolve(null);
      }
    });
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
  // Check authentication
  if (!config.isAuthenticated()) {
    console.log('\nNot authenticated. Please run "gbos auth" first.\n');
    process.exit(1);
  }

  try {
    // Check if already connected
    const currentConnection = config.getConnection();
    if (currentConnection && !options.force) {
      console.log(`\nAlready connected to node: ${currentConnection.node?.name}`);
      console.log(`Connection ID: ${currentConnection.connection_id}`);
      console.log(`\nUse --force to reconnect or 'gbos disconnect' first.\n`);
      return;
    }

    console.log('\nFetching available nodes...\n');

    // Fetch available nodes
    const nodesResponse = await api.listNodes();
    const nodes = nodesResponse.data || [];

    if (nodes.length === 0) {
      console.log('No development nodes available.');
      console.log('Please create a development node in the GBOS web interface.\n');
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

    // If multiple applications, let user select one first
    let selectedApp = null;
    const appIds = Object.keys(nodesByApp);

    if (appIds.length > 1) {
      const appOptions = appIds.map((appId) => ({
        id: appId,
        name: nodesByApp[appId].application?.name || `Application ${appId}`,
        description: `${nodesByApp[appId].nodes.length} node(s) available`,
      }));

      selectedApp = await selectOption('Select an application:', appOptions);

      if (!selectedApp) {
        console.log('Connection cancelled.\n');
        return;
      }
    } else {
      selectedApp = { id: appIds[0] };
    }

    // Get nodes for selected application
    const appNodes = nodesByApp[selectedApp.id].nodes;

    // Let user select a node
    const nodeOptions = appNodes.map((node) => ({
      ...node,
      name: node.name,
      description: node.node_type || '',
    }));

    const selectedNode = await selectOption('Select a development node:', nodeOptions);

    if (!selectedNode) {
      console.log('Connection cancelled.\n');
      return;
    }

    // Check if node is busy
    if (selectedNode.is_connected && selectedNode.active_connection) {
      console.log(`\nNode "${selectedNode.name}" is already connected by another user.`);
      console.log('Please select a different node.\n');
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
      connected_at: new Date().toISOString(),
      working_directory: workingDirectory,
      git_repo_url: gitRepoUrl,
      git_branch: gitBranch,
    });

    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│                    Connected to GBOS                        │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log(`│  Node:          ${node.name.padEnd(42)}│`);
    console.log(`│  Connection ID: ${connection_id.substring(0, 36).padEnd(42)}│`);
    console.log(`│  Working Dir:   ${workingDirectory.substring(0, 42).padEnd(42)}│`);
    console.log('└─────────────────────────────────────────────────────────────┘');

    console.log('\n✓ Successfully connected!\n');

    // Show session info for other tools
    console.log('Session data stored at: ~/.gbos/session.json');
    console.log('\nEnvironment variables available:');
    const envVars = config.getSessionEnv();
    Object.entries(envVars).forEach(([key, value]) => {
      if (value) {
        console.log(`  ${key}=${value}`);
      }
    });

    console.log('\nOther CLI tools can access this session by reading ~/.gbos/session.json');
    console.log('or by using the GBOS MCP server.\n');

  } catch (error) {
    if (error.code === 'NODE_BUSY') {
      console.error(`\nNode is already connected to another CLI session.\n`);
    } else {
      console.error(`\nConnection failed: ${error.message}\n`);
    }
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exit(1);
  }
}

module.exports = connectCommand;
