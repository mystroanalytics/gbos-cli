/**
 * Claude Code Agent Adapter
 * Adapter for Anthropic's Claude Code CLI
 */

const BaseAdapter = require('./base-adapter');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class ClaudeAdapter extends BaseAdapter {
  constructor(config = {}) {
    super(config);
    this.name = 'claude-code';
    this.supportsNonInteractive = true;
    this.supportsInteractive = true;
  }

  async isAvailable() {
    try {
      await execAsync('which claude');
      return true;
    } catch (e) {
      return false;
    }
  }

  async getVersion() {
    try {
      const { stdout } = await execAsync('claude --version');
      return stdout.trim();
    } catch (e) {
      return 'unknown';
    }
  }

  getCommand(options = {}) {
    const args = [];

    // Use print mode for non-interactive (single prompt)
    if (options.nonInteractive && options.prompt) {
      args.push('--print');
      args.push('--dangerously-skip-permissions');
    }

    // Add model if specified
    if (options.model) {
      args.push('--model', options.model);
    }

    // Add max turns if specified
    if (options.maxTurns) {
      args.push('--max-turns', options.maxTurns.toString());
    }

    return {
      command: 'claude',
      args,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: options.apiKey || process.env.ANTHROPIC_API_KEY,
      },
    };
  }

  formatPrompt(task, context = {}) {
    const lines = [];

    // Task header
    lines.push(`# GBOS Task: ${task.title || task.name || 'Task'}`);
    lines.push('');

    // Task metadata
    lines.push('## Task Information');
    lines.push(`- **Task ID:** ${task.id}`);
    if (task.task_key) lines.push(`- **Task Key:** ${task.task_key}`);
    if (task.priority) lines.push(`- **Priority:** ${task.priority}`);
    if (task.task_type) lines.push(`- **Type:** ${task.task_type}`);
    lines.push('');

    // Main instructions
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

    // Acceptance criteria
    if (task.acceptance_criteria && task.acceptance_criteria.length > 0) {
      lines.push('## Acceptance Criteria');
      task.acceptance_criteria.forEach((c, i) => {
        lines.push(`${i + 1}. ${c}`);
      });
      lines.push('');
    }

    // Target files
    if (task.target_files && task.target_files.length > 0) {
      lines.push('## Target Files');
      task.target_files.forEach(f => lines.push(`- ${f}`));
      lines.push('');
    }

    // Testing instructions
    lines.push('## Testing Requirements');
    lines.push('');
    lines.push('After implementing the changes, you MUST test your work:');
    lines.push('');

    if (context.cloudRunUrl) {
      lines.push(`1. The application is deployed at: ${context.cloudRunUrl}`);
      lines.push('2. Write and run Playwright tests to verify the changes');
      lines.push('3. Use the following test approach:');
      lines.push('');
      lines.push('```bash');
      lines.push('# Install Playwright if not present');
      lines.push('npm install -D @playwright/test');
      lines.push('npx playwright install');
      lines.push('');
      lines.push('# Run tests against the deployed app');
      lines.push(`npx playwright test --project=chromium`);
      lines.push('```');
      lines.push('');
      lines.push('Example Playwright test:');
      lines.push('```typescript');
      lines.push("import { test, expect } from '@playwright/test';");
      lines.push('');
      lines.push("test('verify changes', async ({ page }) => {");
      lines.push(`  await page.goto('${context.cloudRunUrl}');`);
      lines.push('  // Add your test assertions here');
      lines.push('});');
      lines.push('```');
    } else {
      lines.push('1. Run the existing test suite to ensure no regressions');
      lines.push('2. Add new tests for the implemented functionality');
      lines.push('3. Verify all tests pass before completing');
    }
    lines.push('');

    // Completion instructions
    lines.push('## Completion');
    lines.push('');
    lines.push('When you have completed the task:');
    lines.push('1. Ensure all tests pass');
    lines.push('2. Review your changes for quality');
    lines.push('3. The system will automatically commit and push your changes');
    lines.push('');
    lines.push('**Important:** Do not run `git commit` or `git push` yourself - the GBOS orchestrator will handle this.');
    lines.push('');

    // Context
    if (context.repoUrl) {
      lines.push('## Repository');
      lines.push(`- **URL:** ${context.repoUrl}`);
      lines.push(`- **Branch:** ${context.branch || 'main'}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  detectCompletion(output) {
    // Claude Code specific completion patterns
    const patterns = [
      /I've completed/i,
      /changes have been made/i,
      /implementation is complete/i,
      /task is done/i,
      /all tests pass/i,
      /ready for review/i,
      /I've finished/i,
      /I have completed/i,
    ];
    return patterns.some(p => p.test(output)) || super.detectCompletion(output);
  }

  detectWaitingForInput(output) {
    // Claude Code specific wait patterns
    const patterns = [
      /Do you want me to/i,
      /Should I/i,
      /Would you like me to/i,
      /Shall I/i,
      /May I/i,
      /Can I proceed/i,
    ];
    return patterns.some(p => p.test(output)) || super.detectWaitingForInput(output);
  }
}

module.exports = ClaudeAdapter;
