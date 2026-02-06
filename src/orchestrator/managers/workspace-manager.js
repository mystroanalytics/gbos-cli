/**
 * Workspace Manager
 * Handles repository setup, branches, and environment configuration
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');
const api = require('../../lib/api');

const execAsync = promisify(exec);

const WORKSPACES_DIR = path.join(os.homedir(), '.gbos', 'workspaces');

class WorkspaceManager {
  constructor(options = {}) {
    this.options = options;
    this.workingDir = null;
    this.repoUrl = null;
    this.cloudRunUrl = null;
    this.branch = null;
    this.isReady = false;
    this.application = null;
    this.gitlabService = null;
    this.hasRepo = false;
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
   * @param {Object} app - Application object from GBOS API (can be partial)
   * @param {Object} task - Task object
   */
  async initialize(app, task) {
    // Fetch full application details from GBOS API if we have an ID
    if (app?.id) {
      try {
        const response = await api.getApplication(app.id);
        this.application = response.data || response;
      } catch (e) {
        // Fall back to provided app object
        this.application = app;
      }
    } else {
      this.application = app;
    }

    // Get repo URL and cloud run URL from application
    this.repoUrl = this.application?.gitlab_repo_url ||
                   this.application?.repo_url ||
                   this.application?.repository_url;

    this.cloudRunUrl = this.application?.cloud_run_url ||
                       this.application?.deploy_url ||
                       this.application?.url;

    this.hasRepo = !!this.repoUrl;

    // Initialize GitLab service for authenticated operations (only if we have a repo)
    if (this.hasRepo) {
      try {
        const { getGitLabService } = require('../../lib/gitlab');
        this.gitlabService = await getGitLabService();
      } catch (e) {
        // GitLab service not available, will use unauthenticated operations
        this.gitlabService = null;
      }
    }

    // Determine working directory
    if (this.options.workingDir) {
      // Explicit working directory provided (pre-validated by startCommand)
      this.workingDir = this.options.workingDir;
    } else if (this.hasRepo) {
      // Use current directory if it's a git repo with matching remote
      const currentDir = process.cwd();
      const isMatchingRepo = await this.isMatchingRepo(currentDir, this.repoUrl);

      if (isMatchingRepo) {
        this.workingDir = currentDir;
      } else {
        // Fall back to workspaces directory
        WorkspaceManager.ensureWorkspacesDir();
        const repoName = this.extractRepoName(this.repoUrl);
        this.workingDir = path.join(WORKSPACES_DIR, repoName);
      }
    } else {
      // No repo URL - use current working directory
      this.workingDir = process.cwd();
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
    if (this.hasRepo) {
      return this.prepareWithRepo();
    }
    return this.prepareLocalOnly();
  }

  /**
   * Prepare workspace with remote repository
   */
  async prepareWithRepo() {
    // Check if directory exists
    const dirExists = fs.existsSync(this.workingDir);
    const isRepo = dirExists && await this.isGitRepo();

    if (!dirExists) {
      // Clone the repository
      await this.cloneRepo();
    } else if (!isRepo) {
      // Directory exists but is not a git repo - initialize it
      await this.initializeRepo();
    }

    // Ensure it's a git repo now
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
   * Prepare workspace without remote repo (local-only mode)
   */
  async prepareLocalOnly() {
    // Ensure directory exists
    if (!fs.existsSync(this.workingDir)) {
      fs.mkdirSync(this.workingDir, { recursive: true });
    }

    // Initialize git if needed
    const isRepo = await this.isGitRepo();
    if (!isRepo) {
      await execAsync('git init', { cwd: this.workingDir });
      try {
        await execAsync('git commit --allow-empty -m "Initial commit"', { cwd: this.workingDir });
      } catch (e) {
        // May fail if nothing to commit
      }
    }

    // Create and checkout branch
    await this.checkoutBranch();

    // Check for required tooling
    await this.checkTooling();

    this.isReady = true;
    return this;
  }

  /**
   * Clone the repository using GitLab authentication
   */
  async cloneRepo() {
    const parentDir = path.dirname(this.workingDir);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Use GitLab service for authenticated clone if available
    if (this.gitlabService) {
      try {
        await this.gitlabService.cloneRepo(this.repoUrl, this.workingDir);
        return;
      } catch (e) {
        // Fall back to direct clone
      }
    }

    // Direct clone (relies on git credentials being set up)
    await execAsync(`git clone "${this.repoUrl}" "${this.workingDir}"`);
  }

  /**
   * Initialize a new git repo and connect to GitLab
   */
  async initializeRepo() {
    // Create directory if needed
    if (!fs.existsSync(this.workingDir)) {
      fs.mkdirSync(this.workingDir, { recursive: true });
    }

    // Initialize git
    await execAsync('git init', { cwd: this.workingDir });

    // If we have GitLab service, set up the remote
    if (this.gitlabService) {
      const projectPath = this.gitlabService.extractProjectPath(this.repoUrl);
      if (projectPath) {
        const remoteUrl = this.gitlabService.getPublicCloneUrl(projectPath);
        try {
          await execAsync(`git remote add origin "${remoteUrl}"`, { cwd: this.workingDir });
        } catch (e) {
          // Remote may already exist
          try {
            await execAsync(`git remote set-url origin "${remoteUrl}"`, { cwd: this.workingDir });
          } catch (e2) {
            // Ignore
          }
        }
      }
    } else {
      // Use the repo URL directly
      try {
        await execAsync(`git remote add origin "${this.repoUrl}"`, { cwd: this.workingDir });
      } catch (e) {
        // Remote may already exist
      }
    }

    // Create initial commit if needed
    try {
      await execAsync('git rev-parse HEAD', { cwd: this.workingDir });
    } catch (e) {
      // No commits yet - create initial commit
      await execAsync('git add -A', { cwd: this.workingDir });
      try {
        await execAsync('git commit -m "Initial commit from GBOS CLI" --allow-empty', { cwd: this.workingDir });
      } catch (commitErr) {
        // May fail if nothing to commit
      }
    }

    // Ensure main branch
    try {
      await execAsync('git branch -M main', { cwd: this.workingDir });
    } catch (e) {
      // May already be on main
    }

    // Try to pull from remote if it exists
    try {
      await execAsync('git pull origin main --rebase --allow-unrelated-histories', { cwd: this.workingDir });
    } catch (e) {
      // May fail if remote is empty or doesn't exist
    }
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

    // Pull latest (only if we have a remote)
    if (this.hasRepo) {
      try {
        await execAsync('git pull origin HEAD --rebase', { cwd: this.workingDir });
      } catch (e) {
        // May fail if no remote tracking
      }
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
      GBOS_REPO: this.repoUrl || '',
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
      cloudRunUrl: this.cloudRunUrl,
      branch: this.branch,
      hasRepo: this.hasRepo,
      isReady: this.isReady,
      currentCommit: this.isReady ? await this.getCurrentCommit() : null,
      gitStatus: this.isReady ? await this.getGitStatus() : null,
      application: this.application ? {
        id: this.application.id,
        name: this.application.name,
        slug: this.application.slug,
      } : null,
    };
  }

  /**
   * Get cloud run URL for testing
   */
  getCloudRunUrl() {
    return this.cloudRunUrl;
  }

  /**
   * Get application details
   */
  getApplication() {
    return this.application;
  }
}

module.exports = WorkspaceManager;
