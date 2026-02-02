const path = require('path');
const fs = require('fs');
const { PNG } = require('pngjs');

// ANSI color codes - Dark Purple Theme
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  purple1: '\x1b[38;5;54m',
  purple2: '\x1b[38;5;55m',
  purple3: '\x1b[38;5;56m',
  purple4: '\x1b[38;5;93m',
  purple5: '\x1b[38;5;99m',
  purple6: '\x1b[38;5;141m',
  purple7: '\x1b[38;5;183m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

// ASCII characters for density mapping
const ASCII_CHARS = ' .,:;i1tfLCG08@#';

// Get terminal width
function getTerminalWidth() {
  return process.stdout.columns || 80;
}

// Convert PNG to ASCII art
function imageToAscii(imagePath, width = 20) {
  try {
    const data = fs.readFileSync(imagePath);
    const png = PNG.sync.read(data);

    const aspectRatio = 0.5;
    const height = Math.floor((png.height / png.width) * width * aspectRatio);

    const cellWidth = png.width / width;
    const cellHeight = png.height / height;

    const lines = [];

    for (let y = 0; y < height; y++) {
      let row = '';
      for (let x = 0; x < width; x++) {
        const sampleX = Math.floor(x * cellWidth + cellWidth / 2);
        const sampleY = Math.floor(y * cellHeight + cellHeight / 2);
        const idx = (png.width * sampleY + sampleX) << 2;

        const r = png.data[idx];
        const g = png.data[idx + 1];
        const b = png.data[idx + 2];
        const a = png.data[idx + 3];

        if (a < 50 || (r > 240 && g > 240 && b > 240)) {
          row += ' ';
          continue;
        }

        const brightness = (r + g + b) / 3;
        const charIndex = Math.floor((1 - brightness / 255) * (ASCII_CHARS.length - 1));
        row += ASCII_CHARS[Math.max(0, Math.min(charIndex, ASCII_CHARS.length - 1))];
      }
      lines.push(row);
    }

    return lines;
  } catch (e) {
    return null;
  }
}

// Compact text-based logo with horse
const COMPACT_LOGO = [
  `${colors.purple3}    ▄▀▀▀▄▄`,
  `${colors.purple3}  ▄▀${colors.purple4}●${colors.purple3}    ▀▄`,
  `${colors.purple4} █        █   ${colors.purple5}${colors.bold}gbos.io${colors.reset}`,
  `${colors.purple4}  ▀▄    ▄▀`,
  `${colors.purple5}    ▀▀▀▀`,
];

// Display logo with connection details
function displayLogoWithDetails(details = null) {
  const logoPath = path.join(__dirname, '../../images/logo.png'); // Use horse-only logo
  const termWidth = getTerminalWidth();
  const logoWidth = 20;
  const rightWidth = termWidth - logoWidth - 8;

  let asciiLines = imageToAscii(logoPath, logoWidth);

  // Color all ASCII lines purple and add "gbos.io" text
  if (asciiLines && asciiLines.length > 0) {
    asciiLines = asciiLines.map((line, idx) => {
      const coloredLine = colors.purple3 + line + colors.reset;
      const midPoint = Math.floor(asciiLines.length / 2);
      if (idx === midPoint) {
        return coloredLine + `  ${colors.purple5}${colors.bold}gbos.io${colors.reset}`;
      }
      return coloredLine;
    });
  }

  if (!asciiLines) {
    asciiLines = COMPACT_LOGO;
  }

  // Build right side (details box)
  const rightLines = [];

  if (details) {
    rightLines.push(`${colors.purple4}┌${'─'.repeat(rightWidth - 2)}┐${colors.reset}`);
    rightLines.push(`${colors.purple4}│${colors.reset} ${colors.bold}${colors.purple5}Connected${colors.reset}${' '.repeat(rightWidth - 12)}${colors.purple4}│${colors.reset}`);
    rightLines.push(`${colors.purple4}├${'─'.repeat(rightWidth - 2)}┤${colors.reset}`);

    const addField = (label, value, valueColor = colors.white) => {
      const val = (value || 'N/A').toString().substring(0, rightWidth - label.length - 6);
      const padding = ' '.repeat(Math.max(0, rightWidth - label.length - val.length - 5));
      rightLines.push(`${colors.purple4}│${colors.reset} ${colors.purple7}${label}${colors.reset} ${valueColor}${val}${colors.reset}${padding}${colors.purple4}│${colors.reset}`);
    };

    addField('Account:', details.accountName, colors.white);
    addField('App:', details.applicationName, colors.purple5);
    addField('Node:', details.nodeName, colors.purple4);
    addField('ID:', details.nodeId, colors.dim);
    if (details.connectionId) {
      addField('Conn:', details.connectionId.substring(0, 18) + '...', colors.dim);
    }

    rightLines.push(`${colors.purple4}└${'─'.repeat(rightWidth - 2)}┘${colors.reset}`);
  }

  // Print side by side
  console.log('');
  const maxLines = Math.max(asciiLines.length, rightLines.length);
  const logoStart = Math.floor((maxLines - asciiLines.length) / 2);
  const detailStart = Math.floor((maxLines - rightLines.length) / 2);

  for (let i = 0; i < maxLines; i++) {
    const left = asciiLines[i - logoStart] || '';
    const right = rightLines[i - detailStart] || '';
    const paddedLeft = left.padEnd(logoWidth + 30); // Account for color codes
    console.log(`  ${paddedLeft}  ${right}`);
  }
  console.log('');
}

function displayLogo() {
  displayLogoWithDetails(null);
}

function displayAuthSuccess(data) {
  const termWidth = getTerminalWidth();
  const logoWidth = 20;
  const rightWidth = termWidth - logoWidth - 8;

  const logoPath = path.join(__dirname, '../../images/logo.png');
  let asciiLines = imageToAscii(logoPath, logoWidth);

  // Color all ASCII lines purple and add "gbos.io" text
  if (asciiLines && asciiLines.length > 0) {
    const midPoint = Math.floor(asciiLines.length / 2);
    asciiLines = asciiLines.map((line, idx) => {
      const coloredLine = colors.purple3 + line + colors.reset;
      if (idx === midPoint) {
        return coloredLine + `  ${colors.purple5}${colors.bold}gbos.io${colors.reset}`;
      }
      return coloredLine;
    });
  }

  if (!asciiLines) asciiLines = COMPACT_LOGO;

  const rightLines = [];
  rightLines.push(`${colors.purple4}┌${'─'.repeat(rightWidth - 2)}┐${colors.reset}`);
  rightLines.push(`${colors.purple4}│${colors.reset} ${colors.bold}${colors.purple5}✓ Authenticated${colors.reset}${' '.repeat(rightWidth - 18)}${colors.purple4}│${colors.reset}`);
  rightLines.push(`${colors.purple4}├${'─'.repeat(rightWidth - 2)}┤${colors.reset}`);

  const addField = (label, value) => {
    const val = (value || 'N/A').toString().substring(0, rightWidth - label.length - 6);
    const padding = ' '.repeat(Math.max(0, rightWidth - label.length - val.length - 5));
    rightLines.push(`${colors.purple4}│${colors.reset} ${colors.purple7}${label}${colors.reset} ${colors.white}${val}${colors.reset}${padding}${colors.purple4}│${colors.reset}`);
  };

  addField('User:', data.userId);
  addField('Account:', data.accountId);
  addField('Session:', (data.sessionId || '').substring(0, 24) + '...');

  rightLines.push(`${colors.purple4}└${'─'.repeat(rightWidth - 2)}┘${colors.reset}`);
  rightLines.push('');
  rightLines.push(`${colors.purple7}${colors.dim}Run "gbos connect" to connect${colors.reset}`);

  console.log('');
  const maxLines = Math.max(asciiLines.length, rightLines.length);
  const logoStart = Math.floor((maxLines - asciiLines.length) / 2);
  const detailStart = Math.floor((maxLines - rightLines.length) / 2);

  for (let i = 0; i < maxLines; i++) {
    const left = asciiLines[i - logoStart] || '';
    const right = rightLines[i - detailStart] || '';
    console.log(`  ${left.padEnd(logoWidth + 30)}  ${right}`);
  }
  console.log('');
}

function displayConnectSuccess(data) {
  displayLogoWithDetails(data);
  console.log(`  ${colors.purple5}✓${colors.reset} ${colors.bold}${colors.purple6}Ready to work!${colors.reset}`);
  console.log(`  ${colors.dim}${colors.purple7}Session: ~/.gbos/session.json${colors.reset}\n`);
}

function displaySessionSummary(data) {
  displayLogoWithDetails(data);
}

function displayMessageBox(title, message, type = 'info') {
  const colorMap = { info: colors.purple4, success: colors.purple5, warning: colors.yellow, error: colors.red };
  const color = colorMap[type] || colors.purple4;
  const icon = type === 'success' ? '✓' : type === 'warning' ? '⚠' : type === 'error' ? '✗' : 'ℹ';
  const width = Math.min(55, getTerminalWidth() - 4);

  console.log(`\n${color}┌${'─'.repeat(width)}┐${colors.reset}`);
  console.log(`${color}│${colors.reset} ${icon} ${colors.bold}${colors.purple6}${title.substring(0, width - 5).padEnd(width - 4)}${colors.reset}${color}│${colors.reset}`);
  console.log(`${color}├${'─'.repeat(width)}┤${colors.reset}`);

  const words = message.split(' ');
  let currentLine = '';
  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length > width - 4) {
      console.log(`${color}│${colors.reset} ${colors.purple7}${currentLine.trim().padEnd(width - 2)}${colors.reset}${color}│${colors.reset}`);
      currentLine = word;
    } else {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    }
  }
  if (currentLine) {
    console.log(`${color}│${colors.reset} ${colors.purple7}${currentLine.trim().padEnd(width - 2)}${colors.reset}${color}│${colors.reset}`);
  }
  console.log(`${color}└${'─'.repeat(width)}┘${colors.reset}\n`);
}

module.exports = {
  colors,
  displayLogo,
  displayLogoWithDetails,
  displaySessionSummary,
  displayAuthSuccess,
  displayConnectSuccess,
  displayMessageBox,
  imageToAscii,
  getTerminalWidth,
};
