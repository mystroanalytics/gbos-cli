#!/usr/bin/env node

const { Command } = require('commander');
const program = new Command();

program
  .name('gbos')
  .description('GBOS - Command line interface for GBOS services')
  .version('1.0.0');

program
  .command('auth')
  .description('Authenticate with GBOS services')
  .option('-t, --token <token>', 'Use a specific auth token')
  .action((options) => {
    console.log('Authenticating with GBOS services...');
    if (options.token) {
      console.log('Using provided token');
    } else {
      console.log('Opening browser for authentication...');
    }
    // TODO: Implement authentication logic
  });

program
  .command('connect')
  .description('Connect to a GBOS service or resource')
  .argument('[service]', 'Service name to connect to')
  .option('-e, --env <environment>', 'Environment (dev, staging, prod)', 'dev')
  .action((service, options) => {
    console.log(`Connecting to GBOS...`);
    if (service) {
      console.log(`Service: ${service}`);
    }
    console.log(`Environment: ${options.env}`);
    // TODO: Implement connection logic
  });

program
  .command('help [command]')
  .description('Display help for a specific command')
  .action((command) => {
    if (command) {
      const cmd = program.commands.find(c => c.name() === command);
      if (cmd) {
        cmd.outputHelp();
      } else {
        console.log(`Unknown command: ${command}`);
        console.log('Available commands: auth, connect, help, logout');
      }
    } else {
      program.outputHelp();
    }
  });

program
  .command('logout')
  .description('Log out from GBOS services and clear credentials')
  .option('-a, --all', 'Clear all stored credentials')
  .action((options) => {
    console.log('Logging out from GBOS services...');
    if (options.all) {
      console.log('Clearing all stored credentials...');
    }
    console.log('Successfully logged out.');
    // TODO: Implement logout logic
  });

// Show help by default if no command is provided
if (process.argv.length <= 2) {
  program.outputHelp();
} else {
  program.parse(process.argv);
}
