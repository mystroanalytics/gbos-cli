/**
 * Workspace Manager
 * Handles repository setup, branches, and environment configuration
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const execAsync = promisify(exec);

const WORKSPACES_DIR = path.join(os.homedir(), '.gbos', 'workspaces');

class WorkspaceManager {
  constructor(options = {}) {
    this.options = options;
    this.workingDir = null;
    this.repoUrl = null;
    this.branch = null;
    this.isReady = false;
  }

  /**
   * Ensure workspaces directory exists
   */
  static ensureWorkspacesDir() {
    if (!fs.existsSync(WORKSPACES_DIR)) {
      fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
    }
  }

  /**
   * Initialize workspace from application config
   * @param {Object} app - Application object from GBOS API
   * @param {Object} task - Task object
   */
  async initialize(app, task) {
    // Get repo URL from application
    this.repoUrl = app.gitlab_repo_url || app.repo_url || app.repository_url;

    if (!this.repoUrl) {
      throw new Error('No repository URL configured for this application');
    }

    // Determine working directory
    if (this.options.workingDir) {
      this.workingDir = this.options.workingDir;
    } else {
      // Use current directory if it's a git repo with matching remote
      const currentDir = process.cwd();
      const isMatchingRepo = await this.isMatchingRepo(currentDir, this.repoUrl);

      if (isMatchingRepo) {
        this.workingDir = currentDir;
      } else {
        // Clone to workspaces directory
        WorkspaceManager.ensureWorkspacesDir();
        const repoName = this.extractRepoName(this.repoUrl);
        this.workingDir = path.join(WORKSPACES_DIR, repoName);
      }
    }

    // Create task branch name
    this.branch = this.options.branch ||
      `task/${task.task_key || task.id}-${this.sanitizeBranchName(task.title || 'work')}`;

    return this;
  }

  /**
   * Check if directory has matching git remote
   */
  async isMatchingRepo(dir, repoUrl) {
    try {
      const { stdout } = await execAsync('git remote get-url origin', { cwd: dir });
      const currentUrl = stdout.trim();

      // Normalize URLs for comparison
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
   * Extract repository name from URL
   */
  extractRepoName(url) {
    const match = url.match(/\/([^\/]+?)(\.git)?$/);
    return match ? match[1] : 'repo';
  }

  /**
   * Sanitize string for branch name
   */
  sanitizeBranchName(str) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 30);
  }

  /**
   * Prepare the workspace
   */
  async prepare() {
    // Clone if needed
    if (!fs.existsSync(this.workingDir)) {
      await this.cloneRepo();
    }

    // Ensure it's a git repo
    if (!await this.isGitRepo()) {
      throw new Error(`${this.workingDir} is not a git repository`);
    }

    // Fetch latest
    await this.fetchLatest();

    // Clean working directory
    await this.cleanWorkingDir();

    // Create and checkout branch
    await this.checkoutBranch();

    // Check for required tooling
    await this.checkTooling();

    this.isReady = true;
    return this;
  }

  /**
   * Clone the repository
   */
  async cloneRepo() {
    const parentDir = path.dirname(this.workingDir);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    await execAsync(`git clone ${this.repoUrl} ${this.workingDir}`);
  }

  /**
   * Check if directory is a git repo
   */
  async isGitRepo() {
    try {
      await execAsync('git rev-parse --is-inside-work-tree', { cwd: this.workingDir });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Fetch latest from remote
   */
  async fetchLatest() {
    try {
      await execAsync('git fetch origin --prune', { cwd: this.workingDir });
    } catch (e) {
      // May fail if no network, continue anyway
    }
  }

  /**
   * Clean working directory
   */
  async cleanWorkingDir() {
    try {
      // Stash any local changes
      await execAsync('git stash --include-untracked', { cwd: this.workingDir });
    } catch (e) {
      // No changes to stash
    }

    // Reset to clean state
    try {
      await execAsync('git checkout -- .', { cwd: this.workingDir });
    } catch (e) {
      // May fail if nothing to checkout
    }
  }

  /**
   * Checkout the task branch
   */
  async checkoutBranch() {
    // First checkout main/master
    try {
      await execAsync('git checkout main', { cwd: this.workingDir });
    } catch (e) {
      try {
        await execAsync('git checkout master', { cwd: this.workingDir });
      } catch (e2) {
        // Use current branch
      }
    }

    // Pull latest
    try {
      await execAsync('git pull origin HEAD --rebase', { cwd: this.workingDir });
    } catch (e) {
      // May fail if no remote tracking
    }

    // Check if branch exists
    let branchExists = false;
    try {
      await execAsync(`git show-ref --verify --quiet refs/heads/${this.branch}`, { cwd: this.workingDir });
      branchExists = true;
    } catch (e) {
      branchExists = false;
    }

    // Create or checkout branch
    if (branchExists) {
      await execAsync(`git checkout ${this.branch}`, { cwd: this.workingDir });
    } else {
      await execAsync(`git checkout -b ${this.branch}`, { cwd: this.workingDir });
    }
  }

  /**
   * Check for required tooling
   */
  async checkTooling() {
    const tools = {
      node: 'node --version',
      npm: 'npm --version',
      git: 'git --version',
    };

    const results = {};
    for (const [name, cmd] of Object.entries(tools)) {
      try {
        const { stdout } = await execAsync(cmd);
        results[name] = { available: true, version: stdout.trim() };
      } catch (e) {
        results[name] = { available: false, version: null };
      }
    }

    // Check for package.json and install dependencies
    const packageJson = path.join(this.workingDir, 'package.json');
    if (fs.existsSync(packageJson)) {
      const nodeModules = path.join(this.workingDir, 'node_modules');
      if (!fs.existsSync(nodeModules)) {
        await execAsync('npm install', { cwd: this.workingDir });
      }
    }

    return results;
  }

  /**
   * Set up environment variables
   */
  getEnvironment(additionalVars = {}) {
    return {
      ...process.env,
      GBOS_WORKSPACE: this.workingDir,
      GBOS_BRANCH: this.branch,
      GBOS_REPO: this.repoUrl,
      ...additionalVars,
    };
  }

  /**
   * Get current git status
   */
  async getGitStatus() {
    const { stdout } = await execAsync('git status --porcelain', { cwd: this.workingDir });
    const lines = stdout.trim().split('\n').filter(l => l);

    return {
      hasChanges: lines.length > 0,
      modified: lines.filter(l => l.startsWith(' M') || l.startsWith('M ')).map(l => l.substring(3)),
      added: lines.filter(l => l.startsWith('A ') || l.startsWith('??')).map(l => l.substring(3)),
      deleted: lines.filter(l => l.startsWith(' D') || l.startsWith('D ')).map(l => l.substring(3)),
    };
  }

  /**
   * Get current commit hash
   */
  async getCurrentCommit() {
    const { stdout } = await execAsync('git rev-parse HEAD', { cwd: this.workingDir });
    return stdout.trim();
  }

  /**
   * Get current branch
   */
  async getCurrentBranch() {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: this.workingDir });
    return stdout.trim();
  }

  /**
   * Get workspace summary
   */
  async getSummary() {
    return {
      workingDir: this.workingDir,
      repoUrl: this.repoUrl,
      branch: this.branch,
      isReady: this.isReady,
      currentCommit: this.isReady ? await this.getCurrentCommit() : null,
      gitStatus: this.isReady ? await this.getGitStatus() : null,
    };
  }
}

module.exports = WorkspaceManager;
