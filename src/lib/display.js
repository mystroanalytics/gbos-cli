const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgBlue: '\x1b[44m',
  bgCyan: '\x1b[46m',
};

// ASCII art fallback for GBOS logo
const ASCII_LOGO = `
${colors.cyan}${colors.bold}
   ██████╗ ██████╗  ██████╗ ███████╗
  ██╔════╝ ██╔══██╗██╔═══██╗██╔════╝
  ██║  ███╗██████╔╝██║   ██║███████╗
  ██║   ██║██╔══██╗██║   ██║╚════██║
  ╚██████╔╝██████╔╝╚██████╔╝███████║
   ╚═════╝ ╚═════╝  ╚═════╝ ╚══════╝
${colors.reset}`;

// Check if catimg is available
function hasCatimg() {
  try {
    execSync('which catimg', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

// Display logo using catimg or ASCII fallback
function displayLogo() {
  const logoPath = path.join(__dirname, '../../images/logo.png');

  if (hasCatimg() && fs.existsSync(logoPath)) {
    try {
      // Use catimg with width constraint for terminal
      const result = spawnSync('catimg', ['-w', '40', logoPath], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      if (result.stdout) {
        console.log(result.stdout);
        return;
      }
    } catch (e) {
      // Fall through to ASCII
    }
  }

  // ASCII fallback
  console.log(ASCII_LOGO);
}

// Display styled session summary (Gemini design + Claude Code layout)
function displaySessionSummary(data) {
  const {
    accountName,
    applicationName,
    nodeName,
    nodeId,
    connectionId,
    userId,
    accountId,
  } = data;

  const line = '─'.repeat(61);
  const doubleLine = '═'.repeat(61);

  console.log(`\n${colors.cyan}╔${doubleLine}╗${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}${colors.bold}                        GBOS Connected                        ${colors.reset}${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}╠${doubleLine}╣${colors.reset}`);

  // Account section
  console.log(`${colors.cyan}║${colors.reset}                                                             ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}  ${colors.gray}Account${colors.reset}                                                   ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}  ${colors.bold}${colors.white}${(accountName || 'N/A').substring(0, 50).padEnd(55)}${colors.reset}  ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}  ${colors.dim}ID: ${accountId || 'N/A'}${colors.reset}${' '.repeat(Math.max(0, 53 - String(accountId || 'N/A').length))}${colors.cyan}║${colors.reset}`);

  console.log(`${colors.cyan}║${colors.reset}                                                             ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}╟${line}╢${colors.reset}`);

  // Application section
  console.log(`${colors.cyan}║${colors.reset}                                                             ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}  ${colors.gray}Application${colors.reset}                                               ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}  ${colors.bold}${colors.green}${(applicationName || 'N/A').substring(0, 50).padEnd(55)}${colors.reset}  ${colors.cyan}║${colors.reset}`);

  console.log(`${colors.cyan}║${colors.reset}                                                             ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}╟${line}╢${colors.reset}`);

  // Node section
  console.log(`${colors.cyan}║${colors.reset}                                                             ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}  ${colors.gray}Development Node${colors.reset}                                          ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}  ${colors.bold}${colors.yellow}${(nodeName || 'N/A').substring(0, 50).padEnd(55)}${colors.reset}  ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}  ${colors.dim}Node ID: ${nodeId || 'N/A'}${colors.reset}${' '.repeat(Math.max(0, 48 - String(nodeId || 'N/A').length))}${colors.cyan}║${colors.reset}`);

  console.log(`${colors.cyan}║${colors.reset}                                                             ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}╟${line}╢${colors.reset}`);

  // Connection section
  console.log(`${colors.cyan}║${colors.reset}                                                             ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}  ${colors.gray}Connection${colors.reset}                                                ${colors.cyan}║${colors.reset}`);
  const connIdDisplay = connectionId ? connectionId.substring(0, 36) : 'N/A';
  console.log(`${colors.cyan}║${colors.reset}  ${colors.magenta}${connIdDisplay.padEnd(55)}${colors.reset}  ${colors.cyan}║${colors.reset}`);

  console.log(`${colors.cyan}║${colors.reset}                                                             ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}╚${doubleLine}╝${colors.reset}`);

  console.log(`\n${colors.green}✓${colors.reset} ${colors.bold}Ready to work!${colors.reset}`);
  console.log(`${colors.dim}  Session stored at ~/.gbos/session.json${colors.reset}\n`);
}

// Display auth success screen
function displayAuthSuccess(data) {
  displayLogo();

  const line = '─'.repeat(61);
  const doubleLine = '═'.repeat(61);

  console.log(`${colors.cyan}╔${doubleLine}╗${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}${colors.bold}                   Authentication Successful                 ${colors.reset}${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}╠${doubleLine}╣${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}                                                             ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}  ${colors.gray}User ID${colors.reset}       ${colors.white}${String(data.userId || 'N/A').padEnd(42)}${colors.reset}${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}  ${colors.gray}Account ID${colors.reset}    ${colors.white}${String(data.accountId || 'N/A').padEnd(42)}${colors.reset}${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}  ${colors.gray}Session${colors.reset}       ${colors.dim}${(data.sessionId || 'N/A').substring(0, 36).padEnd(42)}${colors.reset}${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}                                                             ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}╚${doubleLine}╝${colors.reset}`);

  console.log(`\n${colors.green}✓${colors.reset} ${colors.bold}Authenticated!${colors.reset}`);
  console.log(`${colors.dim}  Run "gbos connect" to connect to a development node.${colors.reset}\n`);
}

// Display connect success screen
function displayConnectSuccess(data) {
  displayLogo();
  displaySessionSummary(data);
}

// Display simple message box
function displayMessageBox(title, message, type = 'info') {
  const colorMap = {
    info: colors.cyan,
    success: colors.green,
    warning: colors.yellow,
    error: '\x1b[31m',
  };
  const color = colorMap[type] || colors.cyan;
  const icon = type === 'success' ? '✓' : type === 'warning' ? '⚠' : type === 'error' ? '✗' : 'ℹ';

  const line = '─'.repeat(61);

  console.log(`\n${color}┌${line}┐${colors.reset}`);
  console.log(`${color}│${colors.reset} ${icon} ${colors.bold}${title.padEnd(56)}${colors.reset}${color}│${colors.reset}`);
  console.log(`${color}├${line}┤${colors.reset}`);

  // Word wrap message
  const words = message.split(' ');
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length > 57) {
      console.log(`${color}│${colors.reset}  ${currentLine.trim().padEnd(57)}${color}│${colors.reset}`);
      currentLine = word;
    } else {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    }
  }

  if (currentLine) {
    console.log(`${color}│${colors.reset}  ${currentLine.trim().padEnd(57)}${color}│${colors.reset}`);
  }

  console.log(`${color}└${line}┘${colors.reset}\n`);
}

module.exports = {
  colors,
  displayLogo,
  displaySessionSummary,
  displayAuthSuccess,
  displayConnectSuccess,
  displayMessageBox,
  hasCatimg,
};
