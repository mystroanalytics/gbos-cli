/**
 * Git Automation Manager
 * Handles git operations: commit, push, branch management, and GitLab integration
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const config = require('../../lib/config');

const execAsync = promisify(exec);

class GitManager {
  constructor(workingDir, options = {}) {
    this.workingDir = workingDir;
    this.options = {
      remote: options.remote || 'origin',
      ...options,
    };
  }

  /**
   * Execute git command
   */
  async git(args) {
    const { stdout, stderr } = await execAsync(`git ${args}`, {
      cwd: this.workingDir,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout.trim();
  }

  /**
   * Get GitLab configuration
   */
  getGitLabConfig() {
    const session = config.loadSession();
    return {
      url: session?.gitlab_url || process.env.GITLAB_URL || 'https://gitlab.com',
      token: session?.gitlab_token || process.env.GITLAB_TOKEN || null,
    };
  }

  /**
   * Stage all changes
   */
  async stageAll() {
    await this.git('add -A');
    return this.getStatus();
  }

  /**
   * Get current status
   */
  async getStatus() {
    const output = await this.git('status --porcelain');
    const lines = output.split('\n').filter(l => l);

    return {
      hasChanges: lines.length > 0,
      files: lines.map(l => ({
        status: l.substring(0, 2).trim(),
        path: l.substring(3),
      })),
      modified: lines.filter(l => l.startsWith(' M') || l.startsWith('M ')).length,
      added: lines.filter(l => l.startsWith('A ') || l.startsWith('??')).length,
      deleted: lines.filter(l => l.startsWith(' D') || l.startsWith('D ')).length,
    };
  }

  /**
   * Create a commit
   */
  async commit(message, task = null) {
    // Build commit message
    let fullMessage = message;

    if (task) {
      const prefix = task.task_key ? `[${task.task_key}] ` : `[Task #${task.id}] `;
      fullMessage = `${prefix}${message}`;
    }

    // Add GBOS signature
    fullMessage += '\n\nAutomated by GBOS CLI orchestrator';

    // Commit
    await this.git(`commit -m "${fullMessage.replace(/"/g, '\\"')}"`);

    // Return commit info
    return this.getLastCommit();
  }

  /**
   * Get last commit info
   */
  async getLastCommit() {
    const hash = await this.git('rev-parse HEAD');
    const message = await this.git('log -1 --pretty=%B');
    const author = await this.git('log -1 --pretty=%an');
    const date = await this.git('log -1 --pretty=%ci');

    return {
      hash,
      shortHash: hash.substring(0, 7),
      message: message.trim(),
      author,
      date,
    };
  }

  /**
   * Push to remote
   */
  async push(branch = null, force = false) {
    const currentBranch = branch || await this.getCurrentBranch();
    const forceFlag = force ? '--force' : '';

    try {
      // Try to push with upstream tracking
      await this.git(`push ${forceFlag} -u ${this.options.remote} ${currentBranch}`);
    } catch (e) {
      // If that fails, try without -u
      await this.git(`push ${forceFlag} ${this.options.remote} ${currentBranch}`);
    }

    return {
      branch: currentBranch,
      remote: this.options.remote,
    };
  }

  /**
   * Get current branch
   */
  async getCurrentBranch() {
    return this.git('rev-parse --abbrev-ref HEAD');
  }

  /**
   * Get remote URL
   */
  async getRemoteUrl() {
    try {
      return await this.git(`remote get-url ${this.options.remote}`);
    } catch (e) {
      return null;
    }
  }

  /**
   * Create a merge request on GitLab
   */
  async createMergeRequest(options = {}) {
    const gitlab = this.getGitLabConfig();

    if (!gitlab.token) {
      throw new Error('GitLab token not configured');
    }

    const remoteUrl = await this.getRemoteUrl();
    if (!remoteUrl) {
      throw new Error('No remote URL configured');
    }

    // Extract project path from URL
    const projectPath = this.extractProjectPath(remoteUrl);
    const encodedPath = encodeURIComponent(projectPath);

    const currentBranch = await this.getCurrentBranch();

    const mrData = {
      source_branch: currentBranch,
      target_branch: options.targetBranch || 'main',
      title: options.title || `[GBOS] ${currentBranch}`,
      description: options.description || 'Automated merge request from GBOS orchestrator',
      remove_source_branch: options.removeSourceBranch !== false,
    };

    const response = await fetch(`${gitlab.url}/api/v4/projects/${encodedPath}/merge_requests`, {
      method: 'POST',
      headers: {
        'PRIVATE-TOKEN': gitlab.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mrData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `Failed to create MR: ${response.status}`);
    }

    const mr = await response.json();

    return {
      id: mr.iid,
      url: mr.web_url,
      title: mr.title,
      sourceBranch: mr.source_branch,
      targetBranch: mr.target_branch,
    };
  }

  /**
   * Extract project path from git URL
   */
  extractProjectPath(url) {
    // Handle SSH URLs: git@gitlab.com:group/project.git
    let match = url.match(/@[^:]+:(.+?)(?:\.git)?$/);
    if (match) {
      return match[1];
    }

    // Handle HTTPS URLs: https://gitlab.com/group/project.git
    match = url.match(/https?:\/\/[^\/]+\/(.+?)(?:\.git)?$/);
    if (match) {
      return match[1];
    }

    throw new Error(`Cannot extract project path from URL: ${url}`);
  }

  /**
   * Check if there are uncommitted changes
   */
  async hasUncommittedChanges() {
    const status = await this.getStatus();
    return status.hasChanges;
  }

  /**
   * Get diff summary
   */
  async getDiffSummary() {
    try {
      const stat = await this.git('diff --stat HEAD~1');
      const numstat = await this.git('diff --numstat HEAD~1');

      const lines = numstat.split('\n').filter(l => l);
      let additions = 0;
      let deletions = 0;

      lines.forEach(line => {
        const [add, del] = line.split('\t');
        if (add !== '-') additions += parseInt(add) || 0;
        if (del !== '-') deletions += parseInt(del) || 0;
      });

      return {
        stat,
        filesChanged: lines.length,
        additions,
        deletions,
      };
    } catch (e) {
      return { stat: '', filesChanged: 0, additions: 0, deletions: 0 };
    }
  }

  /**
   * Full commit and push workflow
   */
  async commitAndPush(message, task = null) {
    // Stage all changes
    const status = await this.stageAll();

    if (!status.hasChanges) {
      return {
        committed: false,
        pushed: false,
        message: 'No changes to commit',
      };
    }

    // Commit
    const commit = await this.commit(message, task);

    // Push
    const push = await this.push();

    // Get diff summary
    const diff = await this.getDiffSummary();

    return {
      committed: true,
      pushed: true,
      commit,
      push,
      diff,
      message: `Committed and pushed: ${commit.shortHash}`,
    };
  }

  /**
   * Full workflow: commit, push, and create MR
   */
  async commitPushAndMR(message, task = null, mrOptions = {}) {
    const result = await this.commitAndPush(message, task);

    if (!result.committed) {
      return result;
    }

    // Create MR
    try {
      const mr = await this.createMergeRequest({
        title: task ? `[${task.task_key || task.id}] ${task.title || message}` : message,
        description: this.buildMRDescription(task, result),
        ...mrOptions,
      });

      result.mergeRequest = mr;
      result.message = `Committed, pushed, and MR created: ${mr.url}`;
    } catch (e) {
      result.mergeRequestError = e.message;
      result.message = `Committed and pushed, but MR creation failed: ${e.message}`;
    }

    return result;
  }

  /**
   * Build MR description
   */
  buildMRDescription(task, commitResult) {
    const lines = [];

    lines.push('## Summary');
    lines.push('');

    if (task) {
      lines.push(`**Task:** ${task.title || task.name || 'Task'}`);
      if (task.task_key) lines.push(`**Key:** ${task.task_key}`);
      lines.push(`**ID:** ${task.id}`);
      lines.push('');

      if (task.description) {
        lines.push('### Description');
        lines.push(task.description);
        lines.push('');
      }
    }

    lines.push('### Changes');
    if (commitResult.diff) {
      lines.push(`- **Files changed:** ${commitResult.diff.filesChanged}`);
      lines.push(`- **Additions:** +${commitResult.diff.additions}`);
      lines.push(`- **Deletions:** -${commitResult.diff.deletions}`);
    }
    lines.push('');

    lines.push('---');
    lines.push('*Automated by GBOS CLI orchestrator*');

    return lines.join('\n');
  }
}

module.exports = GitManager;
