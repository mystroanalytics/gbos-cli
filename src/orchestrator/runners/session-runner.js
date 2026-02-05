/**
 * Session Runner
 * Manages agent process execution with PTY support
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Try to load node-pty for proper terminal emulation
let pty = null;
try {
  pty = require('node-pty');
} catch (e) {
  // node-pty not available, will fall back to spawn
}

const LOGS_DIR = path.join(os.homedir(), '.gbos', 'logs');

class SessionRunner extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      timeout: options.timeout || 30 * 60 * 1000, // 30 minutes default
      retries: options.retries || 0,
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      usePty: options.usePty !== false && pty !== null,
      logToFile: options.logToFile !== false,
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

  /**
   * Ensure logs directory exists
   */
  static ensureLogsDir() {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
  }

  /**
   * Start the session
   * @param {string} command - Command to run
   * @param {string[]} args - Command arguments
   * @param {string} input - Initial input to send (prompt)
   */
  async start(command, args = [], input = null) {
    if (this.isRunning) {
      throw new Error('Session is already running');
    }

    this.isRunning = true;
    this.startTime = new Date();
    this.output = '';
    this.exitCode = null;

    // Set up logging
    if (this.options.logToFile) {
      SessionRunner.ensureLogsDir();
      const timestamp = this.startTime.toISOString().replace(/[:.]/g, '-');
      this.logFile = path.join(LOGS_DIR, `session_${timestamp}.log`);
      this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
      this.log(`Session started: ${command} ${args.join(' ')}`);
      this.log(`Working directory: ${this.options.cwd}`);
      this.log('---');
    }

    // Set up timeout
    if (this.options.timeout > 0) {
      this.timeoutHandle = setTimeout(() => {
        this.emit('timeout');
        this.stop();
      }, this.options.timeout);
    }

    try {
      if (this.options.usePty && pty) {
        await this.startPty(command, args, input);
      } else {
        await this.startSpawn(command, args, input);
      }
    } catch (error) {
      this.isRunning = false;
      this.cleanup();
      throw error;
    }

    return this;
  }

  /**
   * Start with PTY (proper terminal emulation)
   */
  async startPty(command, args, input) {
    return new Promise((resolve, reject) => {
      try {
        this.process = pty.spawn(command, args, {
          name: 'xterm-256color',
          cols: 120,
          rows: 40,
          cwd: this.options.cwd,
          env: this.options.env,
        });

        this.process.onData((data) => {
          this.output += data;
          this.log(data, false);
          this.emit('data', data);
          this.emit('stdout', data);
        });

        this.process.onExit(({ exitCode, signal }) => {
          this.exitCode = exitCode;
          this.endTime = new Date();
          this.isRunning = false;
          this.cleanup();
          this.log(`\n--- Session ended with code ${exitCode} ---`);
          this.emit('exit', { exitCode, signal });

          if (exitCode === 0) {
            resolve({ exitCode, output: this.output });
          } else if (this.retryCount < this.options.retries) {
            this.retryCount++;
            this.emit('retry', this.retryCount);
            this.start(command, args, input).then(resolve).catch(reject);
          } else {
            resolve({ exitCode, output: this.output });
          }
        });

        // Send initial input after a brief delay
        if (input) {
          setTimeout(() => {
            this.write(input + '\n');
          }, 1000);
        }

        this.emit('started', { pid: this.process.pid });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Start with spawn (fallback)
   */
  async startSpawn(command, args, input) {
    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(command, args, {
          cwd: this.options.cwd,
          env: this.options.env,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: true,
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
          this.emit('error', error);
          reject(error);
        });

        this.process.on('exit', (exitCode, signal) => {
          this.exitCode = exitCode;
          this.endTime = new Date();
          this.isRunning = false;
          this.cleanup();
          this.log(`\n--- Session ended with code ${exitCode} ---`);
          this.emit('exit', { exitCode, signal });

          if (exitCode === 0) {
            resolve({ exitCode, output: this.output });
          } else if (this.retryCount < this.options.retries) {
            this.retryCount++;
            this.emit('retry', this.retryCount);
            this.start(command, args, input).then(resolve).catch(reject);
          } else {
            resolve({ exitCode, output: this.output });
          }
        });

        // Send initial input
        if (input) {
          setTimeout(() => {
            this.write(input + '\n');
          }, 500);
        }

        this.emit('started', { pid: this.process.pid });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Write input to the process
   * @param {string} data - Data to write
   */
  write(data) {
    if (!this.isRunning || !this.process) {
      throw new Error('Session is not running');
    }

    if (this.options.usePty && pty) {
      this.process.write(data);
    } else {
      this.process.stdin.write(data);
    }

    this.emit('input', data);
  }

  /**
   * Send a special key
   * @param {string} key - Key name (e.g., 'enter', 'ctrl-c')
   */
  sendKey(key) {
    const keyMap = {
      'enter': '\r',
      'newline': '\n',
      'tab': '\t',
      'ctrl-c': '\x03',
      'ctrl-d': '\x04',
      'ctrl-z': '\x1a',
      'escape': '\x1b',
      'up': '\x1b[A',
      'down': '\x1b[B',
      'right': '\x1b[C',
      'left': '\x1b[D',
    };

    const keyCode = keyMap[key.toLowerCase()];
    if (keyCode) {
      this.write(keyCode);
    } else {
      throw new Error(`Unknown key: ${key}`);
    }
  }

  /**
   * Stop the session gracefully
   */
  async stop() {
    if (!this.isRunning || !this.process) {
      return;
    }

    this.emit('stopping');

    // Try graceful termination first
    if (this.options.usePty && pty) {
      this.process.kill('SIGTERM');
    } else {
      this.process.kill('SIGTERM');
    }

    // Force kill after 5 seconds
    await new Promise((resolve) => {
      const forceKillTimeout = setTimeout(() => {
        if (this.isRunning) {
          this.kill();
        }
        resolve();
      }, 5000);

      this.once('exit', () => {
        clearTimeout(forceKillTimeout);
        resolve();
      });
    });
  }

  /**
   * Force kill the session
   */
  kill() {
    if (!this.process) return;

    if (this.options.usePty && pty) {
      this.process.kill('SIGKILL');
    } else {
      this.process.kill('SIGKILL');
    }

    this.isRunning = false;
    this.cleanup();
    this.emit('killed');
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }

    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }

  /**
   * Log a message
   * @param {string} message
   * @param {boolean} addTimestamp
   */
  log(message, addTimestamp = true) {
    if (this.logStream) {
      const prefix = addTimestamp ? `[${new Date().toISOString()}] ` : '';
      this.logStream.write(prefix + message + (addTimestamp ? '\n' : ''));
    }
  }

  /**
   * Get session status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      exitCode: this.exitCode,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.endTime && this.startTime
        ? this.endTime - this.startTime
        : (this.startTime ? Date.now() - this.startTime : 0),
      retryCount: this.retryCount,
      logFile: this.logFile,
      outputLength: this.output.length,
    };
  }

  /**
   * Get recent output
   * @param {number} lines - Number of lines to return
   */
  getRecentOutput(lines = 50) {
    const allLines = this.output.split('\n');
    return allLines.slice(-lines).join('\n');
  }
}

module.exports = SessionRunner;
