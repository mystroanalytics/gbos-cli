/**
 * Codex Agent Adapter
 * Adapter for OpenAI's Codex CLI
 */

const BaseAdapter = require('./base-adapter');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class CodexAdapter extends BaseAdapter {
  constructor(config = {}) {
    super(config);
    this.name = 'codex';
    this.supportsNonInteractive = true;
    this.supportsInteractive = true;
  }

  async isAvailable() {
    try {
      await execAsync('which codex');
      return true;
    } catch (e) {
      return false;
    }
  }

  async getVersion() {
    try {
      const { stdout } = await execAsync('codex --version');
      return stdout.trim();
    } catch (e) {
      return 'unknown';
    }
  }

  getCommand(options = {}) {
    const args = [];

    // Quiet mode for less verbose output
    if (options.quiet) {
      args.push('--quiet');
    }

    // Full auto mode (no confirmations)
    if (options.autoApprove) {
      args.push('--full-auto');
    }

    return {
      command: 'codex',
      args,
      env: {
        ...process.env,
        OPENAI_API_KEY: options.apiKey || process.env.OPENAI_API_KEY,
      },
    };
  }

  formatPrompt(task, context = {}) {
    const lines = [];

    // Task header
    lines.push(`# Task: ${task.title || task.name || 'Task'}`);
    lines.push('');

    // Task info
    lines.push(`Task ID: ${task.id}`);
    if (task.task_key) lines.push(`Task Key: ${task.task_key}`);
    if (task.priority) lines.push(`Priority: ${task.priority}`);
    lines.push('');

    // Main instructions
    lines.push('## What to do:');
    lines.push('');
    if (task.agent_prompt) {
      lines.push(task.agent_prompt);
    } else if (task.prompt) {
      lines.push(task.prompt);
    } else if (task.description) {
      lines.push(task.description);
    }
    lines.push('');

    // Acceptance criteria
    if (task.acceptance_criteria && task.acceptance_criteria.length > 0) {
      lines.push('## Success criteria:');
      task.acceptance_criteria.forEach((c, i) => {
        lines.push(`- ${c}`);
      });
      lines.push('');
    }

    // Testing
    lines.push('## Testing:');
    lines.push('');
    if (context.cloudRunUrl) {
      lines.push(`The app is deployed at ${context.cloudRunUrl}`);
      lines.push('');
      lines.push('Test your changes using Playwright:');
      lines.push('```');
      lines.push('npm install -D @playwright/test');
      lines.push('npx playwright install chromium');
      lines.push('npx playwright test');
      lines.push('```');
      lines.push('');
      lines.push(`Base URL for tests: ${context.cloudRunUrl}`);
    } else {
      lines.push('Run the existing tests to verify your changes work.');
    }
    lines.push('');

    // Completion note
    lines.push('## When done:');
    lines.push('Make sure all tests pass. Do NOT commit or push - the system handles that.');
    lines.push('');

    return lines.join('\n');
  }

  detectCompletion(output) {
    const patterns = [
      /completed successfully/i,
      /all done/i,
      /finished/i,
      /task complete/i,
    ];
    return patterns.some(p => p.test(output)) || super.detectCompletion(output);
  }
}

module.exports = CodexAdapter;
