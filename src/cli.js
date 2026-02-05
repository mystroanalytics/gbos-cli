#!/usr/bin/env node

const { Command } = require('commander');
const program = new Command();

const authCommand = require('./commands/auth');
const connectCommand = require('./commands/connect');
const logoutCommand = require('./commands/logout');
const { tasksCommand, nextTaskCommand, continueCommand, fallbackCommand, addTaskCommand, completedCommand } = require('./commands/tasks');
const { syncStartCommand, syncStopCommand, syncStatusCommand, syncNowCommand, repoCreateCommand, repoListCommand, repoCloneCommand } = require('./commands/gitlab');
const { registryLoginCommand, registryImagesCommand, registryPushCommand, registryPullCommand } = require('./commands/registry');
const { startCommand, resumeCommand, stopCommand, runsCommand } = require('./commands/orchestrator');
const config = require('./lib/config');
const { displayStatus, printBanner } = require('./lib/display');

const VERSION = require('../package.json').version;

program
  .name('gbos')
  .description('GBOS - Command line interface for GBOS services')
  .version(VERSION);

program
  .command('auth')
  .description('Authenticate with GBOS services')
  .option('-e, --email <email>', 'Email address for authentication')
  .option('-f, --force', 'Force re-authentication even if already authenticated')
  .action(authCommand);

program
  .command('connect')
  .description('Connect to a GBOS development node')
  .option('-d, --dir <directory>', 'Working directory (defaults to current directory)')
  .option('-a, --agent <agent>', 'Agent CLI being used (default: claude-code)')
  .option('-f, --force', 'Force reconnect even if already connected')
  .action(connectCommand);

program
  .command('disconnect')
  .description('Disconnect from the current GBOS node')
  .action(async () => {
    if (!config.isAuthenticated()) {
      console.log('\nNot authenticated.\n');
      return;
    }

    const connection = config.getConnection();
    if (!connection) {
      console.log('\nNot connected to any node.\n');
      return;
    }

    try {
      const api = require('./lib/api');
      const result = await api.disconnect();

      config.clearConnection();

      console.log('\n✓ Disconnected from node.\n');

      if (result.data) {
        console.log(`  Tasks completed: ${result.data.tasks_completed || 0}`);
        console.log(`  Tasks failed: ${result.data.tasks_failed || 0}`);
        console.log(`  Total time: ${result.data.total_time_minutes || 0} minutes\n`);
      }
    } catch (error) {
      config.clearConnection();
      console.log('\n✓ Disconnected (local session cleared).\n');
    }
  });

program
  .command('status')
  .description('Show current authentication and connection status')
  .action(async () => {
    const session = config.loadSession();

    if (!session || !session.access_token) {
      printBanner();
      console.log('  Status: Not authenticated');
      console.log('  Run "gbos auth" to authenticate.\n');
      return;
    }

    const userName = session.user_first_name && session.user_last_name
      ? `${session.user_first_name} ${session.user_last_name}`
      : session.user_name || 'Unknown';
    const accountName = session.account_name || 'Unknown';

    const connection = session.connection;

    displayStatus({
      userName,
      accountName,
      isConnected: !!connection,
      applicationName: connection?.application?.name,
      nodeName: connection?.node?.name,
      connectionId: connection?.connection_id,
      connectedAt: connection?.connected_at ? new Date(connection.connected_at).toLocaleString() : null,
    });
  });

program
  .command('tasks')
  .description('Show tasks assigned to this development node')
  .action(tasksCommand);

program
  .command('next_task')
  .alias('next')
  .description('Get the next task in the queue')
  .action(nextTaskCommand);

program
  .command('continue')
  .description('Continue working on the current or next task (outputs prompt for coding agent)')
  .action(continueCommand);

program
  .command('fallback')
  .description('Cancel work from the current task and revert to last completed state')
  .action(fallbackCommand);

program
  .command('completed')
  .alias('done')
  .description('Complete current task: commit, push to GitLab (creates repo if needed), and mark task done')
  .option('-m, --message <message>', 'Custom commit message')
  .action(completedCommand);

program
  .command('add_task')
  .alias('add')
  .description('Create a new task interactively')
  .action(addTaskCommand);

// ==================== Orchestrator Commands ====================

program
  .command('start')
  .description('Start the GBOS orchestrator to automatically process tasks')
  .option('-a, --agent <agent>', 'Agent to use (claude-code, codex, gemini)', 'claude-code')
  .option('-d, --dir <directory>', 'Working directory')
  .option('--auto-approve', 'Auto-approve agent actions')
  .option('--no-mr', 'Skip merge request creation')
  .option('-c, --continuous', 'Continuously process tasks')
  .option('-n, --max-tasks <number>', 'Maximum tasks to process', '1')
  .option('--show-prompt', 'Show the generated prompt')
  .action(startCommand);

program
  .command('resume')
  .description('Resume a paused orchestrator run')
  .option('-r, --run-id <runId>', 'Specific run ID to resume')
  .option('--no-mr', 'Skip merge request creation')
  .action(resumeCommand);

program
  .command('stop')
  .description('Stop an active orchestrator run')
  .option('-r, --run-id <runId>', 'Specific run ID to stop')
  .option('-f, --force', 'Force stop and mark as failed')
  .action(stopCommand);

program
  .command('runs')
  .description('List recent orchestrator runs')
  .option('-l, --limit <number>', 'Number of runs to show', '10')
  .action(runsCommand);

program
  .command('logout')
  .description('Log out from GBOS services and clear credentials')
  .option('-a, --all', 'Clear all stored data including machine ID')
  .action(logoutCommand);

// ==================== GitLab Commands ====================

const gitlabCmd = program
  .command('gitlab')
  .description('GitLab integration commands');

// GitLab Sync subcommands
const gitlabSync = gitlabCmd
  .command('sync')
  .description('Auto-sync repository with GitLab');

gitlabSync
  .command('start')
  .description('Start auto-syncing a repository')
  .option('-p, --path <path>', 'Path to repository (defaults to current directory)')
  .option('-i, --interval <seconds>', 'Sync interval in seconds (default: 60)', parseInt)
  .action(syncStartCommand);

gitlabSync
  .command('stop')
  .description('Stop auto-syncing a repository')
  .option('-p, --path <path>', 'Path to repository (defaults to current directory)')
  .option('-a, --all', 'Stop all active syncs')
  .action(syncStopCommand);

gitlabSync
  .command('status')
  .description('Show status of all active syncs')
  .action(syncStatusCommand);

gitlabSync
  .command('now')
  .description('Force an immediate sync')
  .option('-p, --path <path>', 'Path to repository (defaults to current directory)')
  .action(syncNowCommand);

// GitLab Repo subcommands
const gitlabRepo = gitlabCmd
  .command('repo')
  .description('GitLab repository management');

gitlabRepo
  .command('create <name>')
  .description('Create a new GitLab repository')
  .option('--private', 'Create as private repository (default)')
  .option('--public', 'Create as public repository')
  .option('-d, --description <description>', 'Repository description')
  .option('--readme', 'Initialize with README')
  .action(repoCreateCommand);

gitlabRepo
  .command('list')
  .description('List GitLab repositories')
  .option('-a, --all', 'Show all accessible repositories (not just owned)')
  .action(repoListCommand);

gitlabRepo
  .command('clone <name>')
  .description('Clone a GitLab repository')
  .option('--ssh', 'Use SSH URL instead of HTTPS')
  .option('-d, --dir <directory>', 'Target directory name')
  .action(repoCloneCommand);

// ==================== Registry Commands ====================

const registryCmd = program
  .command('registry')
  .description('GitLab Container Registry commands');

registryCmd
  .command('login')
  .description('Login to GitLab Container Registry')
  .option('-r, --registry <url>', 'Registry URL (defaults to registry.gitlab.com)')
  .action(registryLoginCommand);

registryCmd
  .command('images <project>')
  .description('List container images in a project')
  .option('-t, --tags', 'Show tags for each image')
  .action(registryImagesCommand);

registryCmd
  .command('push <image>')
  .description('Push an image to GitLab Container Registry')
  .option('-p, --project <project>', 'GitLab project path (e.g., group/project)')
  .option('-r, --registry <url>', 'Registry URL (defaults to registry.gitlab.com)')
  .action(registryPushCommand);

registryCmd
  .command('pull <image>')
  .description('Pull an image from GitLab Container Registry')
  .option('-p, --project <project>', 'GitLab project path (e.g., group/project)')
  .option('-r, --registry <url>', 'Registry URL (defaults to registry.gitlab.com)')
  .action(registryPullCommand);

program
  .command('help [command]')
  .description('Display help for a specific command')
  .action((command) => {
    if (command) {
      const cmd = program.commands.find((c) => c.name() === command);
      if (cmd) {
        cmd.outputHelp();
      } else {
        console.log(`Unknown command: ${command}`);
        console.log('Available commands: auth, connect, disconnect, status, tasks, next, continue, completed, fallback, add_task, start, resume, stop, runs, logout, gitlab, registry, help');
      }
    } else {
      program.outputHelp();
    }
  });

// Show help by default if no command is provided
if (process.argv.length <= 2) {
  program.outputHelp();
} else {
  program.parse(process.argv);
}
