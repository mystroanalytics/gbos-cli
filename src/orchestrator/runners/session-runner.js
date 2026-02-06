/**
 * Session Runner
 * Manages agent process execution - spawns CLI agents, pipes prompts,
 * streams output in real-time, and captures results.
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const os = require('os');

const LOGS_DIR = path.join(os.homedir(), '.gbos', 'logs');

class SessionRunner extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      timeout: options.timeout || 30 * 60 * 1000,
      retries: options.retries || 0,
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      logToFile: options.logToFile !== false,
      closeStdinOnWrite: options.closeStdinOnWrite || false,
      ...options,
    };

    this.process = null;
    this.isRunning = false;
    this.output = '';
    this.exitCode = null;
    this.startTime = null;
    this.endTime = null;
    this.logFile = null;
    this.logStream = null;
    this.timeoutHandle = null;
    this.retryCount = 0;
  }

  static ensureLogsDir() {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
  }

  async start(command, args = [], input = null) {
    if (this.isRunning) throw new Error('Session is already running');

    this.isRunning = true;
    this.startTime = new Date();
    this.output = '';
    this.exitCode = null;

    if (this.options.logToFile) {
      SessionRunner.ensureLogsDir();
      const timestamp = this.startTime.toISOString().replace(/[:.]/g, '-');
      this.logFile = path.join(LOGS_DIR, `session_${timestamp}.log`);
      this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
      this.log(`Session started: ${command} ${args.join(' ')}`);
      this.log(`Working directory: ${this.options.cwd}`);
      this.log('---');
    }

    if (this.options.timeout > 0) {
      this.timeoutHandle = setTimeout(() => {
        this.emit('timeout');
        this.stop();
      }, this.options.timeout);
    }

    try {
      const result = await this.runProcess(command, args, input);
      return result;
    } catch (error) {
      this.isRunning = false;
      this.cleanup();
      throw error;
    }
  }

  runProcess(command, args, input) {
    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(command, args, {
          cwd: this.options.cwd,
          env: { ...this.options.env, FORCE_COLOR: '1' },
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
        });

        this.process.stdout.on('data', (data) => {
          const str = data.toString();
          this.output += str;
          this.log(str, false);
          this.emit('data', str);
          this.emit('stdout', str);
        });

        this.process.stderr.on('data', (data) => {
          const str = data.toString();
          this.output += str;
          this.log(str, false);
          this.emit('data', str);
          this.emit('stderr', str);
        });

        this.process.on('error', (error) => {
          this.isRunning = false;
          this.cleanup();
          this.emit('error', error);
          reject(error);
        });

        this.process.on('exit', (exitCode, signal) => {
          this.exitCode = exitCode;
          this.endTime = new Date();
          this.isRunning = false;
          this.cleanup();
          this.log(`\n--- Session ended with code ${exitCode} (signal: ${signal}) ---`);
          this.emit('exit', { exitCode, signal });

          const result = { exitCode: exitCode || 0, output: this.output };
          if ((exitCode === 0 || exitCode === null) || this.retryCount >= this.options.retries) {
            resolve(result);
          } else {
            this.retryCount++;
            this.emit('retry', this.retryCount);
            this.start(command, args, input).then(resolve).catch(reject);
          }
        });

        if (input) {
          this.process.stdin.write(input, () => {
            if (this.options.closeStdinOnWrite) {
              this.process.stdin.end();
            }
          });
        }

        this.emit('started', { pid: this.process.pid });
      } catch (error) {
        reject(error);
      }
    });
  }

  write(data) {
    if (!this.isRunning || !this.process) throw new Error('Session is not running');
    this.process.stdin.write(data);
    this.emit('input', data);
  }

  closeStdin() {
    if (this.process && this.process.stdin) this.process.stdin.end();
  }

  async stop() {
    if (!this.isRunning || !this.process) return;
    this.emit('stopping');
    this.process.kill('SIGTERM');
    await new Promise((resolve) => {
      const forceKillTimeout = setTimeout(() => {
        if (this.isRunning) this.kill();
        resolve();
      }, 5000);
      this.once('exit', () => { clearTimeout(forceKillTimeout); resolve(); });
    });
  }

  kill() {
    if (!this.process) return;
    this.process.kill('SIGKILL');
    this.isRunning = false;
    this.cleanup();
    this.emit('killed');
  }

  cleanup() {
    if (this.timeoutHandle) { clearTimeout(this.timeoutHandle); this.timeoutHandle = null; }
    if (this.logStream) { this.logStream.end(); this.logStream = null; }
  }

  log(message, addTimestamp = true) {
    if (this.logStream) {
      const prefix = addTimestamp ? `[${new Date().toISOString()}] ` : '';
      this.logStream.write(prefix + message + (addTimestamp ? '\n' : ''));
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning, exitCode: this.exitCode,
      startTime: this.startTime, endTime: this.endTime,
      duration: this.endTime && this.startTime ? this.endTime - this.startTime : (this.startTime ? Date.now() - this.startTime : 0),
      retryCount: this.retryCount, logFile: this.logFile, outputLength: this.output.length,
    };
  }

  getRecentOutput(lines = 50) {
    return this.output.split('\n').slice(-lines).join('\n');
  }
}

module.exports = SessionRunner;
