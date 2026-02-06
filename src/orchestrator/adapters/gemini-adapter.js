/**
 * Gemini Agent Adapter
 * Uses `gemini -p` (print mode) which reads prompt from stdin,
 * runs autonomously, streams output, and exits when done.
 */

const BaseAdapter = require('./base-adapter');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class GeminiAdapter extends BaseAdapter {
  constructor(config = {}) {
    super(config);
    this.name = 'gemini';
    this.supportsNonInteractive = true;
    this.supportsInteractive = true;
  }

  async isAvailable() {
    try {
      await execAsync('which gemini');
      return true;
    } catch (e) {
      return false;
    }
  }

  async getVersion() {
    try {
      const { stdout } = await execAsync('gemini --version');
      return stdout.trim();
    } catch (e) {
      return 'unknown';
    }
  }

  getCommand(options = {}) {
    // Gemini CLI reads prompt from stdin when piped.
    // Use --output-format text for clean non-interactive output.
    const args = ['--output-format', 'text'];

    if (options.autoApprove) args.push('--yolo');

    // Default to Gemini 3 Pro
    const model = options.model || 'gemini-3-pro-preview';
    args.push('--model', model);

    return {
      command: 'gemini',
      args,
      env: {
        ...process.env,
        GEMINI_API_KEY: options.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
      },
      closeStdinOnWrite: true,
    };
  }

  formatPrompt(task, context = {}) {
    const lines = [];

    lines.push(`# ${task.title || task.name || 'Task'}`);
    lines.push('');

    lines.push(`> Task: ${task.task_key || task.id}`);
    if (task.priority) lines.push(`> Priority: ${task.priority}`);
    lines.push('');

    lines.push('## Instructions');
    lines.push('');
    if (task.agent_prompt) {
      lines.push(task.agent_prompt);
    } else if (task.prompt) {
      lines.push(task.prompt);
    } else if (task.description) {
      lines.push(task.description);
    }
    lines.push('');

    if (task.acceptance_criteria && task.acceptance_criteria.length > 0) {
      lines.push('## Requirements');
      task.acceptance_criteria.forEach((c, i) => {
        lines.push(`${i + 1}. ${c}`);
      });
      lines.push('');
    }

    if (task.target_files && task.target_files.length > 0) {
      lines.push('## Files');
      task.target_files.forEach(f => lines.push(`- \`${f}\``));
      lines.push('');
    }

    lines.push('## Testing');
    lines.push('');
    if (context.cloudRunUrl) {
      lines.push(`App URL: ${context.cloudRunUrl}`);
      lines.push('');
      lines.push('Write Playwright tests to verify your changes:');
      lines.push('');
      lines.push('```bash');
      lines.push('npm install -D @playwright/test');
      lines.push('npx playwright install');
      lines.push('npx playwright test');
      lines.push('```');
      lines.push('');
      lines.push('Configure tests to use the deployed URL.');
    } else {
      lines.push('Run tests to verify changes work correctly.');
    }
    lines.push('');

    lines.push('## Important');
    lines.push('- Do NOT commit or push changes');
    lines.push('- Ensure all tests pass');
    lines.push('- The orchestrator handles git operations');
    lines.push('');

    if (context.repoUrl) {
      lines.push('## Repository');
      lines.push(`- **URL:** ${context.repoUrl}`);
      lines.push(`- **Branch:** ${context.branch || 'main'}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  detectCompletion(output) {
    const patterns = [
      /I've made the changes/i,
      /changes are complete/i,
      /done implementing/i,
      /finished the task/i,
      /implementation complete/i,
      /I've completed/i,
      /all tests pass/i,
      /ready for review/i,
      /I have completed/i,
    ];
    return patterns.some(p => p.test(output)) || super.detectCompletion(output);
  }

  detectWaitingForInput(output) {
    const patterns = [
      /Do you want me to/i,
      /Should I/i,
      /Would you like me to/i,
      /Shall I/i,
    ];
    return patterns.some(p => p.test(output)) || super.detectWaitingForInput(output);
  }
}

module.exports = GeminiAdapter;
