/**
 * Base Agent Adapter
 * Defines the interface for all agent adapters
 */

const { EventEmitter } = require('events');

class BaseAdapter extends EventEmitter {
  constructor(config = {}) {
    super();
    this.name = 'base';
    this.config = config;
    this.process = null;
    this.isRunning = false;
    this.supportsNonInteractive = false;
    this.supportsInteractive = true;
  }

  /**
   * Check if the agent CLI is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    throw new Error('isAvailable() must be implemented');
  }

  /**
   * Get the agent version
   * @returns {Promise<string>}
   */
  async getVersion() {
    throw new Error('getVersion() must be implemented');
  }

  /**
   * Generate the command to run the agent
   * @param {Object} options - Run options
   * @returns {Object} { command, args, env }
   */
  getCommand(options = {}) {
    throw new Error('getCommand() must be implemented');
  }

  /**
   * Format a prompt for this specific agent
   * @param {Object} task - Task object from GBOS API
   * @param {Object} context - Additional context (repo, cloudRunUrl, etc.)
   * @returns {string} Formatted prompt
   */
  formatPrompt(task, context = {}) {
    throw new Error('formatPrompt() must be implemented');
  }

  /**
   * Detect if the agent has completed its work
   * Used for interactive mode
   * @param {string} output - Recent output from the agent
   * @returns {boolean}
   */
  detectCompletion(output) {
    // Default: look for common completion patterns
    const completionPatterns = [
      /task.*completed?/i,
      /done.*with.*changes/i,
      /all.*changes.*committed/i,
      /finished.*working/i,
      /ready.*for.*review/i,
    ];
    return completionPatterns.some(p => p.test(output));
  }

  /**
   * Detect if the agent is waiting for input
   * @param {string} output - Recent output
   * @returns {boolean}
   */
  detectWaitingForInput(output) {
    const waitPatterns = [
      /\?.*$/m,
      /\(y\/n\)/i,
      /press.*enter/i,
      /continue\?/i,
    ];
    return waitPatterns.some(p => p.test(output));
  }

  /**
   * Detect if the agent encountered an error
   * @param {string} output - Recent output
   * @returns {boolean}
   */
  detectError(output) {
    const errorPatterns = [
      /error:/i,
      /failed:/i,
      /exception:/i,
      /fatal:/i,
    ];
    return errorPatterns.some(p => p.test(output));
  }

  /**
   * Parse the output to extract useful information
   * @param {string} output - Full output from the agent
   * @returns {Object} Parsed information
   */
  parseOutput(output) {
    return {
      raw: output,
      filesModified: this.extractFilesModified(output),
      testsRun: this.extractTestResults(output),
      errors: this.extractErrors(output),
    };
  }

  /**
   * Extract files modified from output
   * @param {string} output
   * @returns {string[]}
   */
  extractFilesModified(output) {
    const files = new Set();
    // Common patterns for file modifications
    const patterns = [
      /(?:created?|modified?|updated?|wrote?|edited?)\s+[`']?([^\s`']+\.[a-z]+)/gi,
      /(?:file|path):\s*[`']?([^\s`']+\.[a-z]+)/gi,
    ];
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        files.add(match[1]);
      }
    });
    return Array.from(files);
  }

  /**
   * Extract test results from output
   * @param {string} output
   * @returns {Object|null}
   */
  extractTestResults(output) {
    // Look for common test output patterns
    const jestMatch = output.match(/Tests:\s*(\d+)\s*passed,?\s*(\d+)?\s*failed?/i);
    if (jestMatch) {
      return {
        framework: 'jest',
        passed: parseInt(jestMatch[1]) || 0,
        failed: parseInt(jestMatch[2]) || 0,
      };
    }

    const pytestMatch = output.match(/(\d+)\s*passed.*?(\d+)?\s*failed?/i);
    if (pytestMatch) {
      return {
        framework: 'pytest',
        passed: parseInt(pytestMatch[1]) || 0,
        failed: parseInt(pytestMatch[2]) || 0,
      };
    }

    return null;
  }

  /**
   * Extract errors from output
   * @param {string} output
   * @returns {string[]}
   */
  extractErrors(output) {
    const errors = [];
    const lines = output.split('\n');
    for (const line of lines) {
      if (/error:|failed:|exception:|fatal:/i.test(line)) {
        errors.push(line.trim());
      }
    }
    return errors;
  }

  /**
   * Stop the running agent
   */
  async stop() {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.isRunning = false;
      this.emit('stopped');
    }
  }

  /**
   * Force kill the agent
   */
  async kill() {
    if (this.process) {
      this.process.kill('SIGKILL');
      this.isRunning = false;
      this.emit('killed');
    }
  }
}

module.exports = BaseAdapter;
