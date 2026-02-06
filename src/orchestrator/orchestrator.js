/**
 * GBOS Orchestrator
 * Main orchestrator that coordinates the entire task execution workflow
 */

const { EventEmitter } = require('events');
const api = require('../lib/api');
const config = require('../lib/config');
const { StateMachine, STATES } = require('./state-machine');
const { getAdapter, checkInstalledAdapters } = require('./adapters');
const SessionRunner = require('./runners/session-runner');
const WorkspaceManager = require('./managers/workspace-manager');
const VerificationManager = require('./managers/verification-manager');
const GitManager = require('./managers/git-manager');

class Orchestrator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      agent: options.agent || 'claude-code',
      autoApprove: options.autoApprove !== false, // Default true for orchestrator
      createMR: options.createMR !== false,
      continuous: options.continuous || false,
      maxTasks: options.maxTasks || 1,
      skipVerification: options.skipVerification || false,
      skipGit: options.skipGit || false,
      ...options,
    };

    this.stateMachine = null;
    this.adapter = null;
    this.session = null;
    this.workspace = null;
    this.verification = null;
    this.git = null;

    this.currentTask = null;
    this.application = null;
    this.tasksCompleted = 0;
    this.isRunning = false;
    this.isPaused = false;

    // Status update interval (every 30 seconds)
    this.statusUpdateInterval = null;
  }

  /**
   * Start the orchestrator
   */
  async start() {
    if (this.isRunning) {
      throw new Error('Orchestrator is already running');
    }

    this.isRunning = true;
    this.stateMachine = new StateMachine();

    this.emit('started', { runId: this.stateMachine.runId });
    this.log('Orchestrator started', { runId: this.stateMachine.runId });

    try {
      // Run the main workflow
      await this.runWorkflow();
    } catch (error) {
      this.stateMachine.recordError(error);
      if (this.stateMachine.canTransition(STATES.FAILED)) {
        this.stateMachine.transition(STATES.FAILED, { error: error.message });
      }
      this.emit('failed', { error });
      throw error;
    } finally {
      this.cleanup();
    }
  }

  /**
   * Resume from a previous run
   */
  async resume(runId = null) {
    if (this.isRunning) {
      throw new Error('Orchestrator is already running');
    }

    // Load the run
    if (runId) {
      this.stateMachine = StateMachine.loadRun(runId);
    } else {
      this.stateMachine = StateMachine.getActiveRun();
      if (!this.stateMachine) {
        throw new Error('No active run to resume');
      }
    }

    if (!this.stateMachine.isResumable()) {
      throw new Error(`Run ${this.stateMachine.runId} is not resumable (state: ${this.stateMachine.state})`);
    }

    this.isRunning = true;
    this.isPaused = false;

    this.emit('resumed', { runId: this.stateMachine.runId, state: this.stateMachine.state });
    this.log('Orchestrator resumed', { runId: this.stateMachine.runId, state: this.stateMachine.state });

    try {
      await this.runWorkflow();
    } catch (error) {
      this.stateMachine.recordError(error);
      if (this.stateMachine.canTransition(STATES.FAILED)) {
        this.stateMachine.transition(STATES.FAILED, { error: error.message });
      }
      this.emit('failed', { error });
      throw error;
    } finally {
      this.cleanup();
    }
  }

  /**
   * Stop the orchestrator gracefully
   */
  async stop() {
    this.log('Stopping orchestrator...');
    this.isPaused = true;

    if (this.session) {
      await this.session.stop();
    }

    if (this.stateMachine && this.stateMachine.state !== STATES.COMPLETED) {
      if (this.stateMachine.canTransition(STATES.PAUSED)) {
        this.stateMachine.transition(STATES.PAUSED);
      }
    }

    this.isRunning = false;
    this.emit('stopped', { runId: this.stateMachine?.runId });
  }

  /**
   * Main workflow runner
   */
  async runWorkflow() {
    const state = this.stateMachine.state;

    // Determine where to start/resume
    switch (state) {
      case STATES.IDLE:
        await this.stageAuthConfig();
        // Fall through
      case STATES.AUTH_CONFIG:
        await this.stageWorkspaceReady();
        // Fall through
      case STATES.WORKSPACE_READY:
      case STATES.REPORT_STATUS:
        // Task loop
        while (!this.isPaused && (this.options.continuous || this.tasksCompleted < this.options.maxTasks)) {
          await this.stageFetchTask();

          if (!this.currentTask) {
            // No more tasks
            this.stateMachine.transition(STATES.COMPLETED);
            this.emit('completed', { tasksCompleted: this.tasksCompleted });
            return;
          }

          await this.stageGeneratePrompt();
          await this.stageRunAgent();

          // Conditionally run verification stages
          if (!this.options.skipVerification) {
            await this.stagePostProcess();
            await this.stageRunTests();
          }

          // Conditionally run git stages
          if (!this.options.skipGit) {
            await this.stageCommitPush();
          }

          await this.stageReportStatus();

          this.tasksCompleted++;
        }
        break;

      case STATES.FETCH_TASK:
        await this.stageFetchTask();
        await this.stageGeneratePrompt();
        // Fall through to continue
      case STATES.GENERATE_PROMPT:
        await this.stageRunAgent();
        // Fall through
      case STATES.RUN_AGENT:
      case STATES.PAUSED:
        await this.stageRunAgent();
        if (!this.options.skipVerification) {
          await this.stagePostProcess();
          await this.stageRunTests();
        }
        if (!this.options.skipGit) {
          await this.stageCommitPush();
        }
        await this.stageReportStatus();
        break;

      case STATES.POST_PROCESS:
        await this.stagePostProcess();
        await this.stageRunTests();
        if (!this.options.skipGit) {
          await this.stageCommitPush();
        }
        await this.stageReportStatus();
        break;

      case STATES.RUN_TESTS:
        await this.stageRunTests();
        if (!this.options.skipGit) {
          await this.stageCommitPush();
        }
        await this.stageReportStatus();
        break;

      case STATES.COMMIT_PUSH:
        await this.stageCommitPush();
        await this.stageReportStatus();
        break;

      default:
        throw new Error(`Cannot resume from state: ${state}`);
    }

    // Final state
    if (!this.isPaused && this.stateMachine.state !== STATES.FAILED) {
      this.stateMachine.transition(STATES.COMPLETED);
      this.emit('completed', { tasksCompleted: this.tasksCompleted });
    }
  }

  /**
   * Stage: Auth & Config
   */
  async stageAuthConfig() {
    this.log('Stage: Auth & Config');
    this.emit('stage', { stage: 'auth_config' });

    // Check authentication
    if (!config.isAuthenticated()) {
      throw new Error('Not authenticated. Run "gbos auth" first.');
    }

    // Check connection
    const connection = config.getConnection();
    if (!connection) {
      throw new Error('Not connected. Run "gbos connect" first.');
    }

    // Get application info
    try {
      const response = await api.getConnectionStatus();
      this.application = response.data?.application || connection.application;
    } catch (e) {
      this.application = connection.application;
    }

    // Check agent availability
    const adapters = await checkInstalledAdapters();
    const agentInfo = adapters[this.options.agent];

    if (!agentInfo?.available) {
      throw new Error(`Agent "${this.options.agent}" is not installed`);
    }

    this.adapter = getAdapter(this.options.agent);
    this.log(`Using agent: ${this.adapter.name} (${agentInfo.version})`);

    this.stateMachine.transition(STATES.AUTH_CONFIG, {
      appId: this.application?.id,
      nodeId: connection.node?.id,
      agentVendor: this.options.agent,
    });

    // Start status update interval
    this.startStatusUpdates();
  }

  /**
   * Stage: Workspace Ready
   */
  async stageWorkspaceReady() {
    this.log('Stage: Workspace Ready');
    this.emit('stage', { stage: 'workspace_ready' });

    if (!this.application) {
      throw new Error('Application not loaded');
    }

    this.workspace = new WorkspaceManager({
      workingDir: this.options.workingDir,
    });

    // Initialize with a placeholder task for branch creation
    const placeholderTask = { id: 'setup', title: 'setup', task_key: 'SETUP' };
    await this.workspace.initialize(this.application, placeholderTask);

    // Get cloud run URL from workspace manager (fetched from API)
    const cloudRunUrl = this.workspace.getCloudRunUrl();

    this.stateMachine.transition(STATES.WORKSPACE_READY, {
      workingDir: this.workspace.workingDir,
      repoUrl: this.workspace.repoUrl,
      cloudRunUrl: cloudRunUrl,
    });

    // Save cloud run URL for later use
    this.stateMachine.context.cloudRunUrl = cloudRunUrl;

    this.log(`Working dir: ${this.workspace.workingDir}`);
    if (this.workspace.repoUrl) {
      this.log(`Repo URL: ${this.workspace.repoUrl}`);
    }
    if (cloudRunUrl) {
      this.log(`Cloud Run URL: ${cloudRunUrl}`);
    }
  }

  /**
   * Stage: Fetch Task
   */
  async stageFetchTask() {
    this.log('Stage: Fetch Task');
    this.emit('stage', { stage: 'fetch_task' });

    try {
      let response;
      if (this.options.taskId) {
        // Fetch a specific task by ID
        response = await api.request(`/development-tasks/${this.options.taskId}`, { method: 'GET' });
        this.currentTask = response.data;
        this.options.taskId = null; // Only use once, then fall back to getNextTask
      } else {
        response = await api.getNextTask(true);
        this.currentTask = response.data?.task || response.data;
      }

      if (!this.currentTask) {
        this.log('No tasks available');
        return;
      }

      this.log(`Fetched task: ${this.currentTask.task_key || this.currentTask.id} - ${this.currentTask.title}`);

      // Update workspace for this task
      await this.workspace.initialize(this.application, this.currentTask);
      await this.workspace.prepare();

      // Start task
      await api.startTask(this.currentTask.id);

      this.stateMachine.transition(STATES.FETCH_TASK, {
        taskId: this.currentTask.id,
        taskKey: this.currentTask.task_key,
        branch: this.workspace.branch,
      });

    } catch (error) {
      if (error.status === 404) {
        this.currentTask = null;
        return;
      }
      throw error;
    }
  }

  /**
   * Stage: Generate Prompt
   */
  async stageGeneratePrompt() {
    this.log('Stage: Generate Prompt');
    this.emit('stage', { stage: 'generate_prompt' });

    if (!this.currentTask) {
      throw new Error('No current task');
    }

    const context = {
      repoUrl: this.workspace.repoUrl,
      branch: this.workspace.branch,
      cloudRunUrl: this.stateMachine.context.cloudRunUrl,
      workingDir: this.workspace.workingDir,
    };

    const prompt = this.adapter.formatPrompt(this.currentTask, context);

    this.stateMachine.recordOutput('prompt', prompt);
    this.stateMachine.transition(STATES.GENERATE_PROMPT, { prompt });

    this.emit('prompt', { prompt });
  }

  /**
   * Stage: Run Agent
   */
  async stageRunAgent() {
    this.log('Stage: Run Agent');
    this.emit('stage', { stage: 'run_agent' });
    this.emit('agent_start', { agent: this.adapter.name });

    const prompt = this.stateMachine.context.outputs?.prompt?.output ||
                   this.stateMachine.context.prompt;

    if (!prompt) {
      throw new Error('No prompt generated');
    }

    // Get command to run
    const cmdConfig = this.adapter.getCommand({
      nonInteractive: this.adapter.supportsNonInteractive,
      autoApprove: this.options.autoApprove,
    });

    // Create session runner - agent works at repo root
    this.session = new SessionRunner({
      cwd: this.workspace.workingDir,
      env: this.workspace.getEnvironment(cmdConfig.env),
      timeout: 30 * 60 * 1000, // 30 minutes
      closeStdinOnWrite: cmdConfig.closeStdinOnWrite || false,
    });

    // Set up event handlers
    this.session.on('data', (data) => {
      this.emit('agent_output', { data });
      process.stdout.write(data);
    });

    this.session.on('error', (error) => {
      this.log(`Session error: ${error.message}`);
    });

    // Run the agent
    this.log(`Running ${this.adapter.name}...`);

    try {
      const result = await this.session.start(cmdConfig.command, cmdConfig.args, prompt);

      this.stateMachine.recordOutput('agent', {
        exitCode: result.exitCode,
        outputLength: result.output.length,
      });

      if (result.exitCode !== 0) {
        this.log(`Agent exited with code ${result.exitCode}`);
      }

      this.stateMachine.transition(STATES.RUN_AGENT);
      this.emit('agent_done', { exitCode: result.exitCode });

    } catch (error) {
      this.stateMachine.recordError(error, 'run_agent');
      throw error;
    }
  }

  /**
   * Stage: Post Process
   */
  async stagePostProcess() {
    this.log('Stage: Post Process');
    this.emit('stage', { stage: 'post_process' });

    this.verification = new VerificationManager(this.workspace.workingDir, {
      cloudRunUrl: this.stateMachine.context.cloudRunUrl,
    });

    const project = await this.verification.detectProjectType();
    const postProcessResults = await this.verification.runPostProcessing(project);

    this.stateMachine.recordOutput('post_process', postProcessResults);
    this.stateMachine.transition(STATES.POST_PROCESS);
  }

  /**
   * Stage: Run Tests
   */
  async stageRunTests() {
    this.log('Stage: Run Tests');
    this.emit('stage', { stage: 'run_tests' });

    if (!this.verification) {
      this.verification = new VerificationManager(this.workspace.workingDir, {
        cloudRunUrl: this.stateMachine.context.cloudRunUrl,
      });
    }

    const results = await this.verification.runAll();

    this.stateMachine.recordOutput('tests', results);

    if (!results.overall.passed) {
      this.log('Tests failed, but continuing...');
      // In future: could retry agent or fail
    }

    this.stateMachine.transition(STATES.RUN_TESTS, {
      testsPassed: results.overall.passed,
    });
  }

  /**
   * Stage: Commit & Push
   */
  async stageCommitPush() {
    this.log('Stage: Commit & Push');
    this.emit('stage', { stage: 'commit_push' });

    this.git = new GitManager(this.workspace.workingDir);

    const message = `Complete task: ${this.currentTask.title || this.currentTask.task_key || this.currentTask.id}`;

    let result;
    if (this.workspace.hasRepo && this.options.createMR) {
      result = await this.git.commitPushAndMR(message, this.currentTask);
    } else if (this.workspace.hasRepo) {
      result = await this.git.commitAndPush(message, this.currentTask);
    } else {
      // Local-only: just commit, no push
      result = await this.git.commitOnly(message);
    }

    this.stateMachine.recordOutput('git', result);
    this.stateMachine.transition(STATES.COMMIT_PUSH, {
      commit: result.commit?.shortHash,
      mergeRequest: result.mergeRequest?.url,
    });

    this.log(result.message);
    this.emit('committed', result);
  }

  /**
   * Stage: Report Status
   */
  async stageReportStatus() {
    this.log('Stage: Report Status');
    this.emit('stage', { stage: 'report_status' });

    if (!this.currentTask) {
      this.stateMachine.transition(STATES.REPORT_STATUS);
      return;
    }

    try {
      const gitResult = this.stateMachine.context.outputs?.git?.output;
      const testResult = this.stateMachine.context.outputs?.tests?.output;

      await api.completeTask(this.currentTask.id, {
        completion_notes: `Task completed by GBOS orchestrator using ${this.adapter.name}`,
        commit_hash: gitResult?.commit?.hash,
        merge_request_url: gitResult?.mergeRequest?.url,
        tests_passed: testResult?.overall?.passed,
      });

      this.log(`Task ${this.currentTask.task_key || this.currentTask.id} marked as complete`);

    } catch (error) {
      this.log(`Failed to report status: ${error.message}`);
      // Don't throw - task is done locally
    }

    this.stateMachine.transition(STATES.REPORT_STATUS);
    this.currentTask = null;
  }

  /**
   * Start periodic status updates
   */
  startStatusUpdates() {
    if (this.statusUpdateInterval) return;

    this.statusUpdateInterval = setInterval(async () => {
      if (!this.isRunning || !this.currentTask) return;

      try {
        await api.sendHeartbeat(this.currentTask.id, {
          state: this.stateMachine.state,
          stage: this.stateMachine.context.stages.length,
        });
      } catch (e) {
        // Ignore heartbeat failures
      }
    }, 30000);
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval);
      this.statusUpdateInterval = null;
    }

    if (this.session) {
      this.session.removeAllListeners();
    }

    this.isRunning = false;
  }

  /**
   * Log a message
   */
  log(message, data = {}) {
    const timestamp = new Date().toISOString();
    this.emit('log', { timestamp, message, data });
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      runId: this.stateMachine?.runId,
      state: this.stateMachine?.state,
      tasksCompleted: this.tasksCompleted,
      currentTask: this.currentTask ? {
        id: this.currentTask.id,
        key: this.currentTask.task_key,
        title: this.currentTask.title,
      } : null,
      agent: this.options.agent,
    };
  }
}

module.exports = Orchestrator;
