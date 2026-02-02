const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { PNG } = require('pngjs');

// ANSI color codes - Dark Purple Theme
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  // Dark purple shades (256 color mode)
  purple1: '\x1b[38;5;54m',   // Darkest purple
  purple2: '\x1b[38;5;55m',   // Dark purple
  purple3: '\x1b[38;5;56m',   // Medium dark purple
  purple4: '\x1b[38;5;93m',   // Medium purple
  purple5: '\x1b[38;5;99m',   // Light purple
  purple6: '\x1b[38;5;141m',  // Lighter purple
  purple7: '\x1b[38;5;183m',  // Lightest purple
  // Fallback standard colors
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
};

// ASCII characters from dark to light
const ASCII_CHARS = ' .:-=+*#%@';

// Convert image to ASCII art
function imageToAscii(imagePath, width = 30) {
  try {
    const data = fs.readFileSync(imagePath);
    const png = PNG.sync.read(data);

    const aspectRatio = 0.5; // Terminal characters are taller than wide
    const height = Math.floor((png.height / png.width) * width * aspectRatio);

    const cellWidth = png.width / width;
    const cellHeight = png.height / height;

    let ascii = '';

    for (let y = 0; y < height; y++) {
      let row = '';
      for (let x = 0; x < width; x++) {
        // Sample the center of each cell
        const sampleX = Math.floor(x * cellWidth + cellWidth / 2);
        const sampleY = Math.floor(y * cellHeight + cellHeight / 2);
        const idx = (png.width * sampleY + sampleX) << 2;

        const r = png.data[idx];
        const g = png.data[idx + 1];
        const b = png.data[idx + 2];
        const a = png.data[idx + 3];

        // If transparent, use space
        if (a < 128) {
          row += ' ';
          continue;
        }

        // Calculate brightness (0-255)
        const brightness = (r + g + b) / 3;
        // Map to ASCII character (inverted - darker pixels = denser characters)
        const charIndex = Math.floor((1 - brightness / 255) * (ASCII_CHARS.length - 1));
        row += ASCII_CHARS[charIndex];
      }
      ascii += row + '\n';
    }

    return ascii;
  } catch (e) {
    return null;
  }
}

// Color the ASCII art with purple gradient based on position
function colorAsciiArt(ascii, startColor = colors.purple2, endColor = colors.purple6) {
  const lines = ascii.split('\n').filter(line => line.trim());
  const purpleGradient = [colors.purple2, colors.purple3, colors.purple4, colors.purple5, colors.purple6];

  return lines.map((line, i) => {
    const colorIndex = Math.floor((i / lines.length) * purpleGradient.length);
    const color = purpleGradient[Math.min(colorIndex, purpleGradient.length - 1)];
    return color + line + colors.reset;
  }).join('\n');
}

// ASCII art horse head + GBOS logo combined (fallback)
const ASCII_LOGO_SIMPLE = `
${colors.purple3}${colors.bold}        ▄▀▀▀▄▄
${colors.purple3}      ▄▀      ▀▄        ${colors.purple4}██████╗ ██████╗  ██████╗ ███████╗
${colors.purple4}     █   ●     █       ${colors.purple4}██╔════╝ ██╔══██╗██╔═══██╗██╔════╝
${colors.purple4}     █         █       ${colors.purple5}██║  ███╗██████╔╝██║   ██║███████╗
${colors.purple5}      ▀▄     ▄▀        ${colors.purple5}██║   ██║██╔══██╗██║   ██║╚════██║
${colors.purple5}    ▄▀  ▀▀▀▀▀          ${colors.purple6}╚██████╔╝██████╔╝╚██████╔╝███████║
${colors.purple6}   █   █               ${colors.purple6} ╚═════╝ ╚═════╝  ╚═════╝ ╚══════╝
${colors.purple6}   █   █
${colors.reset}`;

// GBOS text only
const GBOS_TEXT = `${colors.purple4}${colors.bold}██████╗ ██████╗  ██████╗ ███████╗
${colors.purple4}██╔════╝ ██╔══██╗██╔═══██╗██╔════╝
${colors.purple5}██║  ███╗██████╔╝██║   ██║███████╗
${colors.purple5}██║   ██║██╔══██╗██║   ██║╚════██║
${colors.purple6}╚██████╔╝██████╔╝╚██████╔╝███████║
${colors.purple6} ╚═════╝ ╚═════╝  ╚═════╝ ╚══════╝${colors.reset}`;

// Check if catimg is available
function hasCatimg() {
  try {
    execSync('which catimg', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

// Display logo using image-to-ascii or ASCII fallback
function displayLogo() {
  const logoPath = path.join(__dirname, '../../images/logo.png');

  // Try to convert image to ASCII
  if (fs.existsSync(logoPath)) {
    const ascii = imageToAscii(logoPath, 25);
    if (ascii) {
      // Color the ASCII art
      const coloredAscii = colorAsciiArt(ascii);
      const asciiLines = coloredAscii.split('\n');
      const gbosLines = GBOS_TEXT.split('\n');

      // Combine horse ASCII and GBOS text side by side
      console.log('');
      const maxLines = Math.max(asciiLines.length, gbosLines.length);
      for (let i = 0; i < maxLines; i++) {
        const asciiLine = asciiLines[i] || '';
        const gbosLine = gbosLines[i - Math.floor((maxLines - gbosLines.length) / 2)] || '';
        // Pad ASCII line to consistent width
        const paddedAscii = asciiLine.padEnd(35);
        console.log(`  ${paddedAscii}  ${gbosLine}`);
      }
      console.log('');
      return;
    }
  }

  // Fallback to manual ASCII horse
  console.log(ASCII_LOGO_SIMPLE);
}

// Display styled session summary (Gemini design + Claude Code layout) - Purple theme
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

  console.log(`\n${colors.purple3}╔${doubleLine}╗${colors.reset}`);
  console.log(`${colors.purple3}║${colors.reset}${colors.bold}${colors.purple5}                        GBOS Connected                        ${colors.reset}${colors.purple3}║${colors.reset}`);
  console.log(`${colors.purple3}╠${doubleLine}╣${colors.reset}`);

  // Account section
  console.log(`${colors.purple3}║${colors.reset}                                                             ${colors.purple3}║${colors.reset}`);
  console.log(`${colors.purple3}║${colors.reset}  ${colors.purple6}Account${colors.reset}                                                   ${colors.purple3}║${colors.reset}`);
  console.log(`${colors.purple3}║${colors.reset}  ${colors.bold}${colors.purple7}${(accountName || 'N/A').substring(0, 50).padEnd(55)}${colors.reset}  ${colors.purple3}║${colors.reset}`);
  console.log(`${colors.purple3}║${colors.reset}  ${colors.dim}${colors.purple6}ID: ${accountId || 'N/A'}${colors.reset}${' '.repeat(Math.max(0, 53 - String(accountId || 'N/A').length))}${colors.purple3}║${colors.reset}`);

  console.log(`${colors.purple3}║${colors.reset}                                                             ${colors.purple3}║${colors.reset}`);
  console.log(`${colors.purple4}╟${line}╢${colors.reset}`);

  // Application section
  console.log(`${colors.purple3}║${colors.reset}                                                             ${colors.purple3}║${colors.reset}`);
  console.log(`${colors.purple3}║${colors.reset}  ${colors.purple6}Application${colors.reset}                                               ${colors.purple3}║${colors.reset}`);
  console.log(`${colors.purple3}║${colors.reset}  ${colors.bold}${colors.purple5}${(applicationName || 'N/A').substring(0, 50).padEnd(55)}${colors.reset}  ${colors.purple3}║${colors.reset}`);

  console.log(`${colors.purple3}║${colors.reset}                                                             ${colors.purple3}║${colors.reset}`);
  console.log(`${colors.purple4}╟${line}╢${colors.reset}`);

  // Node section
  console.log(`${colors.purple3}║${colors.reset}                                                             ${colors.purple3}║${colors.reset}`);
  console.log(`${colors.purple3}║${colors.reset}  ${colors.purple6}Development Node${colors.reset}                                          ${colors.purple3}║${colors.reset}`);
  console.log(`${colors.purple3}║${colors.reset}  ${colors.bold}${colors.purple4}${(nodeName || 'N/A').substring(0, 50).padEnd(55)}${colors.reset}  ${colors.purple3}║${colors.reset}`);
  console.log(`${colors.purple3}║${colors.reset}  ${colors.dim}${colors.purple6}Node ID: ${nodeId || 'N/A'}${colors.reset}${' '.repeat(Math.max(0, 48 - String(nodeId || 'N/A').length))}${colors.purple3}║${colors.reset}`);

  console.log(`${colors.purple3}║${colors.reset}                                                             ${colors.purple3}║${colors.reset}`);
  console.log(`${colors.purple4}╟${line}╢${colors.reset}`);

  // Connection section
  console.log(`${colors.purple3}║${colors.reset}                                                             ${colors.purple3}║${colors.reset}`);
  console.log(`${colors.purple3}║${colors.reset}  ${colors.purple6}Connection${colors.reset}                                                ${colors.purple3}║${colors.reset}`);
  const connIdDisplay = connectionId ? connectionId.substring(0, 36) : 'N/A';
  console.log(`${colors.purple3}║${colors.reset}  ${colors.purple5}${connIdDisplay.padEnd(55)}${colors.reset}  ${colors.purple3}║${colors.reset}`);

  console.log(`${colors.purple3}║${colors.reset}                                                             ${colors.purple3}║${colors.reset}`);
  console.log(`${colors.purple3}╚${doubleLine}╝${colors.reset}`);

  console.log(`\n${colors.purple5}✓${colors.reset} ${colors.bold}${colors.purple6}Ready to work!${colors.reset}`);
  console.log(`${colors.dim}${colors.purple7}  Session stored at ~/.gbos/session.json${colors.reset}\n`);
}

// Display auth success screen - Purple theme
function displayAuthSuccess(data) {
  displayLogo();

  const line = '─'.repeat(61);
  const doubleLine = '═'.repeat(61);

  console.log(`${colors.purple3}╔${doubleLine}╗${colors.reset}`);
  console.log(`${colors.purple3}║${colors.reset}${colors.bold}${colors.purple5}                   Authentication Successful                 ${colors.reset}${colors.purple3}║${colors.reset}`);
  console.log(`${colors.purple3}╠${doubleLine}╣${colors.reset}`);
  console.log(`${colors.purple3}║${colors.reset}                                                             ${colors.purple3}║${colors.reset}`);
  console.log(`${colors.purple3}║${colors.reset}  ${colors.purple6}User ID${colors.reset}       ${colors.purple7}${String(data.userId || 'N/A').padEnd(42)}${colors.reset}${colors.purple3}║${colors.reset}`);
  console.log(`${colors.purple3}║${colors.reset}  ${colors.purple6}Account ID${colors.reset}    ${colors.purple7}${String(data.accountId || 'N/A').padEnd(42)}${colors.reset}${colors.purple3}║${colors.reset}`);
  console.log(`${colors.purple3}║${colors.reset}  ${colors.purple6}Session${colors.reset}       ${colors.dim}${colors.purple5}${(data.sessionId || 'N/A').substring(0, 36).padEnd(42)}${colors.reset}${colors.purple3}║${colors.reset}`);
  console.log(`${colors.purple3}║${colors.reset}                                                             ${colors.purple3}║${colors.reset}`);
  console.log(`${colors.purple3}╚${doubleLine}╝${colors.reset}`);

  console.log(`\n${colors.purple5}✓${colors.reset} ${colors.bold}${colors.purple6}Authenticated!${colors.reset}`);
  console.log(`${colors.dim}${colors.purple7}  Run "gbos connect" to connect to a development node.${colors.reset}\n`);
}

// Display connect success screen
function displayConnectSuccess(data) {
  displayLogo();
  displaySessionSummary(data);
}

// Display simple message box - Purple theme
function displayMessageBox(title, message, type = 'info') {
  const colorMap = {
    info: colors.purple4,
    success: colors.purple5,
    warning: colors.yellow,
    error: '\x1b[31m',
  };
  const color = colorMap[type] || colors.purple4;
  const icon = type === 'success' ? '✓' : type === 'warning' ? '⚠' : type === 'error' ? '✗' : 'ℹ';

  const line = '─'.repeat(61);

  console.log(`\n${color}┌${line}┐${colors.reset}`);
  console.log(`${color}│${colors.reset} ${icon} ${colors.bold}${colors.purple6}${title.padEnd(56)}${colors.reset}${color}│${colors.reset}`);
  console.log(`${color}├${line}┤${colors.reset}`);

  // Word wrap message
  const words = message.split(' ');
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length > 57) {
      console.log(`${color}│${colors.reset}  ${colors.purple7}${currentLine.trim().padEnd(57)}${colors.reset}${color}│${colors.reset}`);
      currentLine = word;
    } else {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    }
  }

  if (currentLine) {
    console.log(`${color}│${colors.reset}  ${colors.purple7}${currentLine.trim().padEnd(57)}${colors.reset}${color}│${colors.reset}`);
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
  imageToAscii,
};
