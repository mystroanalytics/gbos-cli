/**
 * GBOS Orchestrator State Machine
 * Manages the lifecycle of task execution
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

// Run states
const STATES = {
  IDLE: 'idle',
  AUTH_CONFIG: 'auth_config',
  WORKSPACE_READY: 'workspace_ready',
  FETCH_TASK: 'fetch_task',
  GENERATE_PROMPT: 'generate_prompt',
  RUN_AGENT: 'run_agent',
  POST_PROCESS: 'post_process',
  RUN_TESTS: 'run_tests',
  COMMIT_PUSH: 'commit_push',
  REPORT_STATUS: 'report_status',
  COMPLETED: 'completed',
  FAILED: 'failed',
  PAUSED: 'paused',
};

// State transitions - flexible to allow skipping stages
const TRANSITIONS = {
  [STATES.IDLE]: [STATES.AUTH_CONFIG],
  [STATES.AUTH_CONFIG]: [STATES.WORKSPACE_READY, STATES.FAILED],
  [STATES.WORKSPACE_READY]: [STATES.FETCH_TASK, STATES.FAILED],
  [STATES.FETCH_TASK]: [STATES.GENERATE_PROMPT, STATES.COMPLETED, STATES.FAILED],
  [STATES.GENERATE_PROMPT]: [STATES.RUN_AGENT, STATES.FAILED],
  [STATES.RUN_AGENT]: [STATES.POST_PROCESS, STATES.RUN_TESTS, STATES.COMMIT_PUSH, STATES.REPORT_STATUS, STATES.COMPLETED, STATES.FAILED, STATES.PAUSED],
  [STATES.POST_PROCESS]: [STATES.RUN_TESTS, STATES.COMMIT_PUSH, STATES.REPORT_STATUS, STATES.FAILED],
  [STATES.RUN_TESTS]: [STATES.COMMIT_PUSH, STATES.REPORT_STATUS, STATES.RUN_AGENT, STATES.FAILED],
  [STATES.COMMIT_PUSH]: [STATES.REPORT_STATUS, STATES.FAILED],
  [STATES.REPORT_STATUS]: [STATES.FETCH_TASK, STATES.COMPLETED, STATES.FAILED],
  [STATES.PAUSED]: [STATES.RUN_AGENT, STATES.FETCH_TASK, STATES.FAILED],
  [STATES.COMPLETED]: [],
  [STATES.FAILED]: [],
};

// Runs directory
const RUNS_DIR = path.join(os.homedir(), '.gbos', 'runs');

class StateMachine extends EventEmitter {
  constructor(runId = null) {
    super();
    this.runId = runId || this.generateRunId();
    this.state = STATES.IDLE;
    this.context = {
      runId: this.runId,
      appId: null,
      nodeId: null,
      taskId: null,
      taskKey: null,
      branch: null,
      agentVendor: 'claude-code',
      startTime: null,
      endTime: null,
      stages: [],
      errors: [],
      outputs: {},
      artifacts: [],
      repoUrl: null,
      cloudRunUrl: null,
      workingDir: null,
    };
    this.runFile = path.join(RUNS_DIR, `${this.runId}.json`);
  }

  generateRunId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `run_${timestamp}_${random}`;
  }

  // Initialize runs directory
  static ensureRunsDir() {
    if (!fs.existsSync(RUNS_DIR)) {
      fs.mkdirSync(RUNS_DIR, { recursive: true });
    }
  }

  // Load existing run
  static loadRun(runId) {
    const runFile = path.join(RUNS_DIR, `${runId}.json`);
    if (!fs.existsSync(runFile)) {
      throw new Error(`Run ${runId} not found`);
    }
    const data = JSON.parse(fs.readFileSync(runFile, 'utf8'));
    const machine = new StateMachine(runId);
    machine.state = data.state;
    machine.context = data.context;
    return machine;
  }

  // Get latest run
  static getLatestRun() {
    StateMachine.ensureRunsDir();
    const files = fs.readdirSync(RUNS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length === 0) {
      return null;
    }

    const runId = files[0].replace('.json', '');
    return StateMachine.loadRun(runId);
  }

  // Get active run (not completed or failed)
  static getActiveRun() {
    StateMachine.ensureRunsDir();
    const files = fs.readdirSync(RUNS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();

    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(RUNS_DIR, file), 'utf8'));
        if (data.state !== STATES.COMPLETED && data.state !== STATES.FAILED) {
          const runId = file.replace('.json', '');
          return StateMachine.loadRun(runId);
        }
      } catch (e) {
        // Skip invalid files
      }
    }
    return null;
  }

  // Save run state
  save() {
    StateMachine.ensureRunsDir();
    const data = {
      runId: this.runId,
      state: this.state,
      context: this.context,
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(this.runFile, JSON.stringify(data, null, 2), 'utf8');
    return this;
  }

  // Transition to new state
  transition(newState, data = {}) {
    const allowedTransitions = TRANSITIONS[this.state] || [];

    if (!allowedTransitions.includes(newState)) {
      throw new Error(`Invalid transition from ${this.state} to ${newState}`);
    }

    const previousState = this.state;
    this.state = newState;

    // Record stage completion
    this.context.stages.push({
      from: previousState,
      to: newState,
      timestamp: new Date().toISOString(),
      data,
    });

    // Update context with any provided data
    Object.assign(this.context, data);

    // Set timestamps
    if (newState === STATES.AUTH_CONFIG && !this.context.startTime) {
      this.context.startTime = new Date().toISOString();
    }
    if (newState === STATES.COMPLETED || newState === STATES.FAILED) {
      this.context.endTime = new Date().toISOString();
    }

    // Save and emit
    this.save();
    this.emit('transition', { from: previousState, to: newState, data });
    this.emit(newState, data);

    return this;
  }

  // Record error
  recordError(error, stage = null) {
    this.context.errors.push({
      stage: stage || this.state,
      message: error.message || error,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    this.save();
    this.emit('error', { error, stage });
  }

  // Record output from a stage
  recordOutput(stage, output) {
    this.context.outputs[stage] = {
      output,
      timestamp: new Date().toISOString(),
    };
    this.save();
  }

  // Add artifact
  addArtifact(type, path, metadata = {}) {
    this.context.artifacts.push({
      type,
      path,
      metadata,
      timestamp: new Date().toISOString(),
    });
    this.save();
  }

  // Check if can transition
  canTransition(newState) {
    const allowedTransitions = TRANSITIONS[this.state] || [];
    return allowedTransitions.includes(newState);
  }

  // Get resumable state
  isResumable() {
    return this.state !== STATES.COMPLETED &&
           this.state !== STATES.FAILED &&
           this.state !== STATES.IDLE;
  }

  // Get run summary
  getSummary() {
    return {
      runId: this.runId,
      state: this.state,
      taskId: this.context.taskId,
      taskKey: this.context.taskKey,
      branch: this.context.branch,
      agent: this.context.agentVendor,
      startTime: this.context.startTime,
      endTime: this.context.endTime,
      stageCount: this.context.stages.length,
      errorCount: this.context.errors.length,
      isResumable: this.isResumable(),
    };
  }
}

module.exports = {
  StateMachine,
  STATES,
  TRANSITIONS,
  RUNS_DIR,
};
