/**
 * GitLab Service
 * Handles GitLab API operations and authentication
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const config = require('./config');

const execAsync = promisify(exec);

// GitLab configuration
const GITLAB_HOST = process.env.GITLAB_URL || 'https://git.gbos.io';
const GITLAB_CONFIG_FILE = path.join(os.homedir(), '.gbos', 'gitlab.json');
const KEYCHAIN_SERVICE = 'gbos-cli-gitlab';
const KEYCHAIN_ACCOUNT = 'token';

// Try to load keytar for secure storage
let keytar = null;
try {
  keytar = require('keytar');
} catch (e) {
  // keytar not available, will use file-based storage
}

class GitLabService {
  constructor(options = {}) {
    this.host = options.host || GITLAB_HOST;
    this.token = null;
    this.user = null;
  }

  /**
   * Initialize the service and load token
   */
  async initialize() {
    this.token = await this.getToken();

    if (!this.token) {
      throw new Error(
        'GitLab token not configured.\n' +
        'Run: gbos gitlab auth --token <your-token>\n' +
        'Or set GITLAB_TOKEN environment variable.'
      );
    }

    // Validate token and get user info
    try {
      this.user = await this.getCurrentUser();
    } catch (e) {
      throw new Error(`Invalid GitLab token: ${e.message}`);
    }

    return this;
  }

  /**
   * Get token from various sources
   */
  async getToken() {
    // 1. Environment variable (highest priority)
    if (process.env.GITLAB_TOKEN) {
      return process.env.GITLAB_TOKEN;
    }

    // 2. Session file
    const session = config.loadSession();
    if (session?.gitlab_token) {
      return session.gitlab_token;
    }

    // 3. System keychain (if keytar available)
    if (keytar) {
      try {
        const token = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
        if (token) return token;
      } catch (e) {
        // Keychain access failed
      }
    }

    // 4. GitLab config file
    try {
      if (fs.existsSync(GITLAB_CONFIG_FILE)) {
        const gitlabConfig = JSON.parse(fs.readFileSync(GITLAB_CONFIG_FILE, 'utf8'));
        if (gitlabConfig.token) return gitlabConfig.token;
      }
    } catch (e) {
      // File read failed
    }

    return null;
  }

  /**
   * Store token securely
   */
  async storeToken(token) {
    // Validate token first
    try {
      const testResponse = await fetch(`${this.host}/api/v4/user`, {
        headers: { 'PRIVATE-TOKEN': token },
      });

      if (!testResponse.ok) {
        throw new Error('Invalid token');
      }

      const user = await testResponse.json();
      this.user = user;
      this.token = token;
    } catch (e) {
      throw new Error(`Token validation failed: ${e.message}`);
    }

    // Store in keychain if available
    if (keytar) {
      try {
        await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, token);
      } catch (e) {
        // Fall back to file storage
      }
    }

    // Also store in config file as backup
    const dir = path.dirname(GITLAB_CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const gitlabConfig = {
      token,
      host: this.host,
      user: this.user?.username,
      storedAt: new Date().toISOString(),
    };

    fs.writeFileSync(GITLAB_CONFIG_FILE, JSON.stringify(gitlabConfig, null, 2), {
      mode: 0o600, // Restrict permissions
    });

    // Setup git credentials
    await this.setupGitCredentials(token);

    return this.user;
  }

  /**
   * Delete stored token
   */
  async deleteToken() {
    if (keytar) {
      try {
        await keytar.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
      } catch (e) {
        // Ignore
      }
    }

    if (fs.existsSync(GITLAB_CONFIG_FILE)) {
      fs.unlinkSync(GITLAB_CONFIG_FILE);
    }

    // Remove git credentials
    await this.removeGitCredentials();

    this.token = null;
    this.user = null;
  }

  /**
   * Setup git credentials for seamless git operations
   */
  async setupGitCredentials(token) {
    const url = new URL(this.host);
    const gitLabHost = url.host;

    // Configure git credential helper
    try {
      await execAsync(`git config --global credential.https://${gitLabHost}.helper store`);
    } catch (e) {
      // May fail if git not configured
    }

    // Create/update credentials file
    const credentialsPath = path.join(os.homedir(), '.git-credentials');
    let credentials = '';

    if (fs.existsSync(credentialsPath)) {
      credentials = fs.readFileSync(credentialsPath, 'utf8');
      // Remove existing entry for this host
      credentials = credentials
        .split('\n')
        .filter(line => !line.includes(gitLabHost))
        .join('\n');
    }

    // Add new credential
    credentials = credentials.trim();
    if (credentials) credentials += '\n';
    credentials += `https://oauth2:${token}@${gitLabHost}\n`;

    fs.writeFileSync(credentialsPath, credentials, { mode: 0o600 });
  }

  /**
   * Remove git credentials
   */
  async removeGitCredentials() {
    const url = new URL(this.host);
    const gitLabHost = url.host;

    const credentialsPath = path.join(os.homedir(), '.git-credentials');

    if (fs.existsSync(credentialsPath)) {
      let credentials = fs.readFileSync(credentialsPath, 'utf8');
      credentials = credentials
        .split('\n')
        .filter(line => !line.includes(gitLabHost))
        .join('\n');
      fs.writeFileSync(credentialsPath, credentials, { mode: 0o600 });
    }
  }

  /**
   * Make API request
   */
  async request(method, endpoint, data = null) {
    const url = `${this.host}/api/v4${endpoint}`;

    const options = {
      method,
      headers: {
        'PRIVATE-TOKEN': this.token,
        'Content-Type': 'application/json',
      },
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || error.error || `GitLab API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get current user
   */
  async getCurrentUser() {
    return this.request('GET', '/user');
  }

  /**
   * Get project by path or ID
   */
  async getProject(projectPath) {
    const encoded = encodeURIComponent(projectPath);
    return this.request('GET', `/projects/${encoded}`);
  }

  /**
   * Create a new project
   */
  async createProject(name, options = {}) {
    return this.request('POST', '/projects', {
      name,
      visibility: options.visibility || 'private',
      description: options.description || '',
      initialize_with_readme: options.initializeWithReadme || false,
    });
  }

  /**
   * List branches
   */
  async listBranches(projectId) {
    return this.request('GET', `/projects/${projectId}/repository/branches`);
  }

  /**
   * Create branch
   */
  async createBranch(projectId, branchName, ref = 'main') {
    return this.request('POST', `/projects/${projectId}/repository/branches`, {
      branch: branchName,
      ref,
    });
  }

  /**
   * Get file content
   */
  async getFile(projectId, filePath, ref = 'main') {
    const encoded = encodeURIComponent(filePath);
    return this.request('GET', `/projects/${projectId}/repository/files/${encoded}?ref=${ref}`);
  }

  /**
   * Create/update file
   */
  async updateFile(projectId, filePath, content, commitMessage, branch = 'main') {
    const encoded = encodeURIComponent(filePath);
    return this.request('PUT', `/projects/${projectId}/repository/files/${encoded}`, {
      branch,
      content,
      commit_message: commitMessage,
    });
  }

  /**
   * Create merge request
   */
  async createMergeRequest(projectId, options) {
    return this.request('POST', `/projects/${projectId}/merge_requests`, {
      source_branch: options.sourceBranch,
      target_branch: options.targetBranch || 'main',
      title: options.title,
      description: options.description || '',
      remove_source_branch: options.removeSourceBranch !== false,
    });
  }

  /**
   * Trigger pipeline
   */
  async triggerPipeline(projectId, ref = 'main', variables = {}) {
    return this.request('POST', `/projects/${projectId}/pipeline`, {
      ref,
      variables: Object.entries(variables).map(([key, value]) => ({ key, value })),
    });
  }

  /**
   * Get clone URL with embedded token
   */
  getCloneUrl(projectPath) {
    const url = new URL(this.host);
    return `https://oauth2:${this.token}@${url.host}/${projectPath}.git`;
  }

  /**
   * Get clone URL for git operations (without token)
   */
  getPublicCloneUrl(projectPath) {
    const url = new URL(this.host);
    return `https://${url.host}/${projectPath}.git`;
  }

  /**
   * Extract project path from URL
   */
  extractProjectPath(repoUrl) {
    // Handle SSH URLs: git@gitlab.com:group/project.git
    let match = repoUrl.match(/@[^:]+:(.+?)(?:\.git)?$/);
    if (match) {
      return match[1];
    }

    // Handle HTTPS URLs: https://gitlab.com/group/project.git
    match = repoUrl.match(/https?:\/\/[^\/]+\/(.+?)(?:\.git)?$/);
    if (match) {
      return match[1];
    }

    return null;
  }

  /**
   * Clone repository to directory
   */
  async cloneRepo(repoUrl, targetDir) {
    const projectPath = this.extractProjectPath(repoUrl);
    if (!projectPath) {
      throw new Error(`Cannot parse repository URL: ${repoUrl}`);
    }

    // Use authenticated URL
    const cloneUrl = this.getCloneUrl(projectPath);

    await execAsync(`git clone ${cloneUrl} "${targetDir}"`);

    return targetDir;
  }

  /**
   * Initialize a new git repo and push to GitLab
   */
  async initializeRepo(dir, projectName, options = {}) {
    // Check if already a git repo
    let isGitRepo = false;
    try {
      await execAsync('git rev-parse --is-inside-work-tree', { cwd: dir });
      isGitRepo = true;
    } catch (e) {
      isGitRepo = false;
    }

    // Initialize if needed
    if (!isGitRepo) {
      await execAsync('git init', { cwd: dir });
    }

    // Create project on GitLab if doesn't exist
    let project;
    const projectPath = `${this.user.username}/${projectName}`;

    try {
      project = await this.getProject(projectPath);
    } catch (e) {
      // Project doesn't exist, create it
      project = await this.createProject(projectName, {
        visibility: options.visibility || 'private',
        description: options.description || `Created by GBOS CLI`,
      });
    }

    // Check if remote exists
    let hasRemote = false;
    try {
      await execAsync('git remote get-url origin', { cwd: dir });
      hasRemote = true;
    } catch (e) {
      hasRemote = false;
    }

    // Add or update remote
    const remoteUrl = this.getPublicCloneUrl(project.path_with_namespace);
    if (hasRemote) {
      await execAsync(`git remote set-url origin ${remoteUrl}`, { cwd: dir });
    } else {
      await execAsync(`git remote add origin ${remoteUrl}`, { cwd: dir });
    }

    // Initial commit if needed
    try {
      await execAsync('git rev-parse HEAD', { cwd: dir });
    } catch (e) {
      // No commits yet
      try {
        await execAsync('git add -A', { cwd: dir });
        await execAsync('git commit -m "Initial commit from GBOS CLI" --allow-empty', { cwd: dir });
      } catch (commitErr) {
        // May fail if nothing to commit
      }
    }

    // Ensure main branch
    try {
      await execAsync('git branch -M main', { cwd: dir });
    } catch (e) {
      // May already be on main
    }

    // Push to remote
    try {
      await execAsync('git push -u origin main', { cwd: dir });
    } catch (e) {
      // May fail if already pushed or conflicts
    }

    return project;
  }
}

// Singleton instance
let instance = null;

/**
 * Get GitLab service instance
 */
async function getGitLabService(options = {}) {
  if (!instance || options.fresh) {
    instance = new GitLabService(options);
    await instance.initialize();
  }
  return instance;
}

/**
 * Get GitLab service without initialization (for auth command)
 */
function createGitLabService(options = {}) {
  return new GitLabService(options);
}

module.exports = {
  GitLabService,
  getGitLabService,
  createGitLabService,
  GITLAB_HOST,
  GITLAB_CONFIG_FILE,
};
