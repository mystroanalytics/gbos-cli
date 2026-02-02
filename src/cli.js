#!/usr/bin/env node

const { Command } = require('commander');
const program = new Command();

const authCommand = require('./commands/auth');
const connectCommand = require('./commands/connect');
const logoutCommand = require('./commands/logout');
const { tasksCommand, nextTaskCommand, continueCommand, fallbackCommand, autoCommand } = require('./commands/tasks');
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
  .command('auto')
  .description('Automatically work through all tasks and poll for new ones')
  .action(autoCommand);

program
  .command('logout')
  .description('Log out from GBOS services and clear credentials')
  .option('-a, --all', 'Clear all stored data including machine ID')
  .action(logoutCommand);

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
        console.log('Available commands: auth, connect, disconnect, status, tasks, next, continue, fallback, auto, logout, help');
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
