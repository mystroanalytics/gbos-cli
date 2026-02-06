/**
 * Claude Code Agent Adapter
 * Uses `claude -p` (print mode) which reads prompt from stdin,
 * runs autonomously, streams output, and exits when done.
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
    try { await execAsync('which claude'); return true; } catch (e) { return false; }
  }

  async getVersion() {
    try { const { stdout } = await execAsync('claude --version'); return stdout.trim(); } catch (e) { return 'unknown'; }
  }

  getCommand(options = {}) {
    const args = ['-p']; // Print mode: reads from stdin, outputs result, exits
    if (options.autoApprove) args.push('--dangerously-skip-permissions');
    if (options.model) args.push('--model', options.model);
    if (options.maxTurns) args.push('--max-turns', options.maxTurns.toString());
    if (options.verbose) args.push('--verbose');

    return {
      command: 'claude',
      args,
      env: { ...process.env, ANTHROPIC_API_KEY: options.apiKey || process.env.ANTHROPIC_API_KEY },
      closeStdinOnWrite: true,
    };
  }

  formatPrompt(task, context = {}) {
    const lines = [];
    lines.push(`# GBOS Task: ${task.title || task.name || 'Task'}`, '');
    lines.push('## Task Information');
    lines.push(`- **Task ID:** ${task.id}`);
    if (task.task_key) lines.push(`- **Task Key:** ${task.task_key}`);
    if (task.priority) lines.push(`- **Priority:** ${task.priority}`);
    if (task.task_type) lines.push(`- **Type:** ${task.task_type}`);
    lines.push('');
    lines.push('## Instructions', '');
    if (task.agent_prompt) lines.push(task.agent_prompt);
    else if (task.prompt) lines.push(task.prompt);
    else if (task.description) lines.push(task.description);
    lines.push('');

    if (task.acceptance_criteria?.length > 0) {
      lines.push('## Acceptance Criteria');
      task.acceptance_criteria.forEach((c, i) => lines.push(`${i + 1}. ${c}`));
      lines.push('');
    }
    if (task.target_files?.length > 0) {
      lines.push('## Target Files');
      task.target_files.forEach(f => lines.push(`- ${f}`));
      lines.push('');
    }

    lines.push('## Testing Requirements', '', 'After implementing the changes, you MUST test your work:', '');
    if (context.cloudRunUrl) {
      lines.push(`1. The application is deployed at: ${context.cloudRunUrl}`);
      lines.push('2. Write and run Playwright tests to verify the changes');
      lines.push('3. Use the following test approach:', '');
      lines.push('```bash', '# Install Playwright if not present', 'npm install -D @playwright/test', 'npx playwright install', '', 'npx playwright test --project=chromium', '```', '');
      lines.push('Example Playwright test:', '```typescript', "import { test, expect } from '@playwright/test';", '', "test('verify changes', async ({ page }) => {", `  await page.goto('${context.cloudRunUrl}');`, '  // Add your test assertions here', '});', '```');
    } else {
      lines.push('1. Run the existing test suite to ensure no regressions');
      lines.push('2. Add new tests for the implemented functionality');
      lines.push('3. Verify all tests pass before completing');
    }
    lines.push('');
    lines.push('## Completion', '', 'When you have completed the task:', '1. Ensure all tests pass', '2. Review your changes for quality', '3. The system will automatically commit and push your changes', '', '**Important:** Do not run `git commit` or `git push` yourself - the GBOS orchestrator will handle this.', '');

    if (context.repoUrl) {
      lines.push('## Repository', `- **URL:** ${context.repoUrl}`, `- **Branch:** ${context.branch || 'main'}`, '');
    }
    return lines.join('\n');
  }

  detectCompletion(output) {
    const patterns = [/I've completed/i, /changes have been made/i, /implementation is complete/i, /task is done/i, /all tests pass/i, /ready for review/i, /I've finished/i, /I have completed/i];
    return patterns.some(p => p.test(output)) || super.detectCompletion(output);
  }

  detectWaitingForInput(output) {
    const patterns = [/Do you want me to/i, /Should I/i, /Would you like me to/i, /Shall I/i, /May I/i, /Can I proceed/i];
    return patterns.some(p => p.test(output)) || super.detectWaitingForInput(output);
  }
}

module.exports = ClaudeAdapter;
