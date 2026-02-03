const config = require('../lib/config');
const { displayMessageBox, fg, LOGO_PURPLE, LOGO_LIGHT, RESET, BOLD, DIM, getTerminalWidth } = require('../lib/display');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Colors
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

// GitLab configuration
const GITLAB_CONFIG_FILE = path.join(os.homedir(), '.gbos', 'gitlab.json');
const SYNC_PID_DIR = path.join(os.homedir(), '.gbos', 'sync');

// Load GitLab config
function loadGitLabConfig() {
  try {
    if (fs.existsSync(GITLAB_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(GITLAB_CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    // Ignore errors
  }
  return { syncs: {}, repos: [] };
}

// Save GitLab config
function saveGitLabConfig(config) {
  const dir = path.dirname(GITLAB_CONFIG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(GITLAB_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

// Get GitLab URL from session or config
function getGitLabUrl() {
  const session = config.loadSession();
  return session?.gitlab_url || process.env.GITLAB_URL || 'https://gitlab.com';
}

// Get GitLab token
function getGitLabToken() {
  const session = config.loadSession();
  return session?.gitlab_token || process.env.GITLAB_TOKEN || null;
}

// Execute git command
function execGit(args, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    exec(`git ${args}`, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// ==================== SYNC COMMANDS ====================

// Start auto-sync for a directory
async function syncStartCommand(options) {
  const targetPath = options.path || process.cwd();
  const absolutePath = path.resolve(targetPath);

  // Verify it's a git repository
  try {
    await execGit('rev-parse --is-inside-work-tree', absolutePath);
  } catch (e) {
    displayMessageBox('Not a Git Repository', `${absolutePath} is not a git repository.`, 'error');
    process.exit(1);
  }

  // Get remote URL
  let remoteUrl;
  try {
    remoteUrl = await execGit('remote get-url origin', absolutePath);
  } catch (e) {
    displayMessageBox('No Remote', 'No git remote "origin" configured.', 'error');
    process.exit(1);
  }

  const interval = options.interval || 60; // Default 60 seconds

  // Check if already syncing
  const gitlabConfig = loadGitLabConfig();
  if (gitlabConfig.syncs[absolutePath]) {
    console.log(`\n${YELLOW}!${RESET} Sync already active for ${absolutePath}`);
    console.log(`  ${DIM}Use "gbos gitlab sync stop" to stop it first.${RESET}\n`);
    return;
  }

  // Create sync PID directory
  if (!fs.existsSync(SYNC_PID_DIR)) {
    fs.mkdirSync(SYNC_PID_DIR, { recursive: true });
  }

  // Start background sync process
  const syncId = Date.now().toString();
  const pidFile = path.join(SYNC_PID_DIR, `${syncId}.pid`);

  // Create sync script
  const syncScript = `
    while true; do
      cd "${absolutePath}"
      git fetch origin 2>/dev/null
      git add -A 2>/dev/null
      CHANGES=$(git status --porcelain)
      if [ -n "$CHANGES" ]; then
        git commit -m "Auto-sync: $(date '+%Y-%m-%d %H:%M:%S')" 2>/dev/null
        git push origin HEAD 2>/dev/null
      fi
      sleep ${interval}
    done
  `;

  const child = spawn('bash', ['-c', syncScript], {
    detached: true,
    stdio: 'ignore',
  });

  child.unref();

  // Save PID
  fs.writeFileSync(pidFile, child.pid.toString(), 'utf8');

  // Update config
  gitlabConfig.syncs[absolutePath] = {
    syncId,
    pid: child.pid,
    pidFile,
    remote: remoteUrl,
    interval,
    startedAt: new Date().toISOString(),
  };
  saveGitLabConfig(gitlabConfig);

  console.log(`\n${GREEN}✓${RESET} ${BOLD}Auto-sync started${RESET}`);
  console.log(`  ${DIM}Path:${RESET}     ${absolutePath}`);
  console.log(`  ${DIM}Remote:${RESET}   ${remoteUrl}`);
  console.log(`  ${DIM}Interval:${RESET} ${interval} seconds`);
  console.log(`  ${DIM}PID:${RESET}      ${child.pid}\n`);
  console.log(`  ${DIM}Use "gbos gitlab sync stop" to stop syncing.${RESET}\n`);
}

// Stop auto-sync
async function syncStopCommand(options) {
  const targetPath = options.path ? path.resolve(options.path) : process.cwd();

  const gitlabConfig = loadGitLabConfig();

  // Find sync for this path or stop all
  let syncsToStop = [];

  if (options.all) {
    syncsToStop = Object.entries(gitlabConfig.syncs);
  } else if (gitlabConfig.syncs[targetPath]) {
    syncsToStop = [[targetPath, gitlabConfig.syncs[targetPath]]];
  } else {
    console.log(`\n${DIM}No active sync for ${targetPath}${RESET}\n`);
    return;
  }

  for (const [syncPath, syncInfo] of syncsToStop) {
    try {
      // Kill the process
      process.kill(syncInfo.pid, 'SIGTERM');
    } catch (e) {
      // Process may already be dead
    }

    // Remove PID file
    try {
      if (fs.existsSync(syncInfo.pidFile)) {
        fs.unlinkSync(syncInfo.pidFile);
      }
    } catch (e) {
      // Ignore
    }

    // Remove from config
    delete gitlabConfig.syncs[syncPath];

    console.log(`${GREEN}✓${RESET} Stopped sync for ${syncPath}`);
  }

  saveGitLabConfig(gitlabConfig);
  console.log('');
}

// Show sync status
async function syncStatusCommand() {
  const gitlabConfig = loadGitLabConfig();
  const syncs = Object.entries(gitlabConfig.syncs);

  const termWidth = getTerminalWidth();
  const tableWidth = Math.min(100, termWidth - 4);

  console.log(`\n${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}`);
  console.log(`${BOLD}  Active Syncs${RESET}`);
  console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}\n`);

  if (syncs.length === 0) {
    console.log(`  ${DIM}No active syncs.${RESET}`);
    console.log(`  ${DIM}Use "gbos gitlab sync start" to start syncing a repository.${RESET}\n`);
  } else {
    for (const [syncPath, syncInfo] of syncs) {
      // Check if process is still running
      let isRunning = false;
      try {
        process.kill(syncInfo.pid, 0);
        isRunning = true;
      } catch (e) {
        isRunning = false;
      }

      const status = isRunning ? `${GREEN}● running${RESET}` : `${RED}● stopped${RESET}`;
      console.log(`  ${status}  ${BOLD}${syncPath}${RESET}`);
      console.log(`     ${DIM}Remote: ${syncInfo.remote}${RESET}`);
      console.log(`     ${DIM}Interval: ${syncInfo.interval}s | PID: ${syncInfo.pid}${RESET}`);
      console.log(`     ${DIM}Started: ${new Date(syncInfo.startedAt).toLocaleString()}${RESET}`);
      console.log('');
    }
  }

  console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}\n`);
}

// Force immediate sync
async function syncNowCommand(options) {
  const targetPath = options.path ? path.resolve(options.path) : process.cwd();

  // Verify it's a git repository
  try {
    await execGit('rev-parse --is-inside-work-tree', targetPath);
  } catch (e) {
    displayMessageBox('Not a Git Repository', `${targetPath} is not a git repository.`, 'error');
    process.exit(1);
  }

  console.log(`\n${DIM}Syncing ${targetPath}...${RESET}\n`);

  try {
    // Fetch from remote
    console.log(`  ${DIM}Fetching from origin...${RESET}`);
    await execGit('fetch origin', targetPath);

    // Stage all changes
    console.log(`  ${DIM}Staging changes...${RESET}`);
    await execGit('add -A', targetPath);

    // Check for changes
    const status = await execGit('status --porcelain', targetPath);

    if (status) {
      // Commit changes
      const commitMsg = `Manual sync: ${new Date().toISOString()}`;
      console.log(`  ${DIM}Committing changes...${RESET}`);
      await execGit(`commit -m "${commitMsg}"`, targetPath);

      // Push to remote
      console.log(`  ${DIM}Pushing to origin...${RESET}`);
      await execGit('push origin HEAD', targetPath);

      console.log(`\n${GREEN}✓${RESET} ${BOLD}Sync complete${RESET} - Changes pushed to remote.\n`);
    } else {
      console.log(`\n${GREEN}✓${RESET} ${BOLD}Already in sync${RESET} - No local changes to push.\n`);
    }

    // Pull any remote changes
    try {
      console.log(`  ${DIM}Pulling remote changes...${RESET}`);
      await execGit('pull origin HEAD --rebase', targetPath);
    } catch (e) {
      // May fail if there are conflicts
      console.log(`  ${YELLOW}!${RESET} ${DIM}Could not pull remote changes (may have conflicts).${RESET}`);
    }

  } catch (error) {
    displayMessageBox('Sync Failed', error.message, 'error');
    process.exit(1);
  }
}

// ==================== REPO COMMANDS ====================

// Create a new repository
async function repoCreateCommand(name, options) {
  const token = getGitLabToken();
  const gitlabUrl = getGitLabUrl();

  if (!token) {
    displayMessageBox('Not Configured', 'GitLab token not configured. Set GITLAB_TOKEN environment variable.', 'error');
    process.exit(1);
  }

  const visibility = options.private ? 'private' : (options.public ? 'public' : 'private');
  const description = options.description || '';

  console.log(`\n${DIM}Creating repository "${name}" on GitLab...${RESET}\n`);

  try {
    const response = await fetch(`${gitlabUrl}/api/v4/projects`, {
      method: 'POST',
      headers: {
        'PRIVATE-TOKEN': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        description,
        visibility,
        initialize_with_readme: options.readme || false,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `Failed to create repository: ${response.status}`);
    }

    const repo = await response.json();

    console.log(`${GREEN}✓${RESET} ${BOLD}Repository created${RESET}`);
    console.log(`  ${DIM}Name:${RESET}       ${repo.name}`);
    console.log(`  ${DIM}URL:${RESET}        ${repo.web_url}`);
    console.log(`  ${DIM}Clone SSH:${RESET}  ${repo.ssh_url_to_repo}`);
    console.log(`  ${DIM}Clone HTTP:${RESET} ${repo.http_url_to_repo}`);
    console.log(`  ${DIM}Visibility:${RESET} ${repo.visibility}\n`);

    // Save to config
    const gitlabConfig = loadGitLabConfig();
    gitlabConfig.repos.push({
      id: repo.id,
      name: repo.name,
      path: repo.path_with_namespace,
      url: repo.web_url,
      ssh_url: repo.ssh_url_to_repo,
      http_url: repo.http_url_to_repo,
      createdAt: new Date().toISOString(),
    });
    saveGitLabConfig(gitlabConfig);

  } catch (error) {
    displayMessageBox('Failed', error.message, 'error');
    process.exit(1);
  }
}

// List repositories
async function repoListCommand(options) {
  const token = getGitLabToken();
  const gitlabUrl = getGitLabUrl();

  if (!token) {
    displayMessageBox('Not Configured', 'GitLab token not configured. Set GITLAB_TOKEN environment variable.', 'error');
    process.exit(1);
  }

  console.log(`\n${DIM}Fetching repositories from GitLab...${RESET}\n`);

  try {
    const owned = options.all ? '' : '&owned=true';
    const response = await fetch(`${gitlabUrl}/api/v4/projects?per_page=50${owned}`, {
      headers: {
        'PRIVATE-TOKEN': token,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list repositories: ${response.status}`);
    }

    const repos = await response.json();

    const termWidth = getTerminalWidth();
    const tableWidth = Math.min(100, termWidth - 4);

    console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}`);
    console.log(`${BOLD}  GitLab Repositories${RESET}`);
    console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}\n`);

    if (repos.length === 0) {
      console.log(`  ${DIM}No repositories found.${RESET}\n`);
    } else {
      repos.forEach((repo, i) => {
        const visibility = repo.visibility === 'private' ? `${YELLOW}private${RESET}` : `${GREEN}${repo.visibility}${RESET}`;
        console.log(`  ${CYAN}${i + 1}.${RESET} ${BOLD}${repo.path_with_namespace}${RESET} (${visibility})`);
        if (repo.description) {
          console.log(`     ${DIM}${repo.description.substring(0, 60)}${repo.description.length > 60 ? '...' : ''}${RESET}`);
        }
        console.log(`     ${DIM}${repo.http_url_to_repo}${RESET}`);
        if (i < repos.length - 1) console.log('');
      });
    }

    console.log(`\n${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}`);
    console.log(`${DIM}  Total: ${repos.length} repository(ies)${RESET}\n`);

  } catch (error) {
    displayMessageBox('Failed', error.message, 'error');
    process.exit(1);
  }
}

// Clone a repository
async function repoCloneCommand(name, options) {
  const token = getGitLabToken();
  const gitlabUrl = getGitLabUrl();

  if (!token) {
    displayMessageBox('Not Configured', 'GitLab token not configured. Set GITLAB_TOKEN environment variable.', 'error');
    process.exit(1);
  }

  console.log(`\n${DIM}Searching for repository "${name}"...${RESET}\n`);

  try {
    // Search for repository
    const response = await fetch(`${gitlabUrl}/api/v4/projects?search=${encodeURIComponent(name)}`, {
      headers: {
        'PRIVATE-TOKEN': token,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to search repositories: ${response.status}`);
    }

    const repos = await response.json();

    if (repos.length === 0) {
      displayMessageBox('Not Found', `Repository "${name}" not found.`, 'error');
      process.exit(1);
    }

    // Find exact match or use first result
    const repo = repos.find(r => r.name === name || r.path_with_namespace === name) || repos[0];

    const cloneUrl = options.ssh ? repo.ssh_url_to_repo : repo.http_url_to_repo;
    const targetDir = options.dir || repo.name;

    console.log(`  ${DIM}Cloning ${repo.path_with_namespace}...${RESET}`);
    console.log(`  ${DIM}URL: ${cloneUrl}${RESET}\n`);

    await execGit(`clone ${cloneUrl} ${targetDir}`);

    console.log(`${GREEN}✓${RESET} ${BOLD}Repository cloned${RESET}`);
    console.log(`  ${DIM}Location:${RESET} ${path.resolve(targetDir)}\n`);

  } catch (error) {
    displayMessageBox('Clone Failed', error.message, 'error');
    process.exit(1);
  }
}

module.exports = {
  syncStartCommand,
  syncStopCommand,
  syncStatusCommand,
  syncNowCommand,
  repoCreateCommand,
  repoListCommand,
  repoCloneCommand,
};
