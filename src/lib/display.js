const path = require('path');
const fs = require('fs');
const { PNG } = require('pngjs');

// ANSI escape codes
const ESC = '\x1b';
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;

// True color ANSI helpers
const fg = (r, g, b) => `${ESC}[38;2;${r};${g};${b}m`;
const bg = (r, g, b) => `${ESC}[48;2;${r};${g};${b}m`;

// Purple theme RGB values
const PURPLE = {
  dark: [75, 0, 130],      // Deep purple
  medium: [128, 0, 128],   // Purple
  light: [147, 112, 219],  // Medium purple
  bright: [186, 85, 211],  // Medium orchid
  pale: [216, 191, 216],   // Thistle
};

// 256-color fallback codes
const colors = {
  reset: RESET,
  bold: BOLD,
  dim: DIM,
  purple4: `${ESC}[38;5;93m`,
  purple5: `${ESC}[38;5;99m`,
  purple6: `${ESC}[38;5;141m`,
  purple7: `${ESC}[38;5;183m`,
  white: `${ESC}[37m`,
};

// Unicode half-block characters
const UPPER_HALF = '▀';
const LOWER_HALF = '▄';
const FULL_BLOCK = '█';

// Get terminal width
function getTerminalWidth() {
  return process.stdout.columns || 80;
}

// Sample pixel from PNG at given coordinates
function samplePixel(png, x, y) {
  const clampedX = Math.max(0, Math.min(Math.floor(x), png.width - 1));
  const clampedY = Math.max(0, Math.min(Math.floor(y), png.height - 1));
  const idx = (png.width * clampedY + clampedX) << 2;
  return {
    r: png.data[idx],
    g: png.data[idx + 1],
    b: png.data[idx + 2],
    a: png.data[idx + 3],
  };
}

// Check if pixel is transparent or white (background)
function isBackground(pixel) {
  return pixel.a < 50 || (pixel.r > 240 && pixel.g > 240 && pixel.b > 240);
}

// Convert PNG to true-color pixel art using half-blocks
// Each character cell represents 2 vertical pixels
function imageToPixels(imagePath, targetWidth = 24, targetHeight = 12) {
  try {
    const data = fs.readFileSync(imagePath);
    const png = PNG.sync.read(data);

    // Each row of output = 2 rows of pixels (using half-blocks)
    const pixelRows = targetHeight * 2;
    const cellWidth = png.width / targetWidth;
    const cellHeight = png.height / pixelRows;

    const lines = [];

    for (let row = 0; row < targetHeight; row++) {
      let line = '';
      for (let col = 0; col < targetWidth; col++) {
        // Sample top and bottom pixels for this cell
        const topY = row * 2 * cellHeight + cellHeight / 2;
        const bottomY = (row * 2 + 1) * cellHeight + cellHeight / 2;
        const x = col * cellWidth + cellWidth / 2;

        const topPixel = samplePixel(png, x, topY);
        const bottomPixel = samplePixel(png, x, bottomY);

        const topBg = isBackground(topPixel);
        const bottomBg = isBackground(bottomPixel);

        if (topBg && bottomBg) {
          // Both transparent - just a space
          line += ' ';
        } else if (topBg && !bottomBg) {
          // Only bottom has color - use lower half block with fg color
          line += fg(bottomPixel.r, bottomPixel.g, bottomPixel.b) + LOWER_HALF + RESET;
        } else if (!topBg && bottomBg) {
          // Only top has color - use upper half block with fg color
          line += fg(topPixel.r, topPixel.g, topPixel.b) + UPPER_HALF + RESET;
        } else {
          // Both have color - use upper half with fg=top, bg=bottom
          line += fg(topPixel.r, topPixel.g, topPixel.b) + bg(bottomPixel.r, bottomPixel.g, bottomPixel.b) + UPPER_HALF + RESET;
        }
      }
      lines.push(line);
    }

    return lines;
  } catch (e) {
    return null;
  }
}

// "gbos.io" pixel art (6 rows tall to match logo height - renders to 3 rows with half-blocks)
function getGbosTextPixels() {
  const p2 = PURPLE.medium;

  // Compact 6-row pixel art for "gbos.io" (renders to 3 output rows)
  const bitmap = [
    ' 222  222  222  222     2  222 ',
    '2    2  2 2  2 2       22 2  2 ',
    '2 22 222  2  2  22   2  2 2  2 ',
    '2  2 2  2 2  2    2  2  2 2  2 ',
    ' 22  222   22  222    22   22  ',
    '                               ',
  ];

  const lines = [];
  const colorMap = { ' ': null, '2': p2 };

  for (let row = 0; row < bitmap.length; row += 2) {
    let line = '';
    const topRow = bitmap[row] || '';
    const bottomRow = bitmap[row + 1] || '';
    const width = Math.max(topRow.length, bottomRow.length);

    for (let col = 0; col < width; col++) {
      const topChar = topRow[col] || ' ';
      const bottomChar = bottomRow[col] || ' ';
      const topColor = colorMap[topChar];
      const bottomColor = colorMap[bottomChar];

      if (!topColor && !bottomColor) {
        line += ' ';
      } else if (!topColor && bottomColor) {
        line += fg(bottomColor[0], bottomColor[1], bottomColor[2]) + LOWER_HALF + RESET;
      } else if (topColor && !bottomColor) {
        line += fg(topColor[0], topColor[1], topColor[2]) + UPPER_HALF + RESET;
      } else {
        line += fg(topColor[0], topColor[1], topColor[2]) + bg(bottomColor[0], bottomColor[1], bottomColor[2]) + UPPER_HALF + RESET;
      }
    }
    lines.push(line);
  }

  return lines;
}

// Fallback compact logo
const COMPACT_LOGO = [
  `${fg(...PURPLE.medium)}  ▄▀▀▀▄▄${RESET}`,
  `${fg(...PURPLE.medium)}▄▀${fg(...PURPLE.bright)}●${fg(...PURPLE.medium)}    ▀▄${RESET}`,
  `${fg(...PURPLE.light)}█        █${RESET}`,
  `${fg(...PURPLE.light)} ▀▄    ▄▀${RESET}`,
  `${fg(...PURPLE.bright)}   ▀▀▀▀${RESET}`,
];

// Combine logo and text side by side
function combineLogoAndText(logoLines, textLines) {
  const combined = [];
  const maxLines = Math.max(logoLines.length, textLines.length);
  const logoStart = Math.floor((maxLines - logoLines.length) / 2);
  const textStart = Math.floor((maxLines - textLines.length) / 2);

  for (let i = 0; i < maxLines; i++) {
    const logo = logoLines[i - logoStart] || '';
    const text = textLines[i - textStart] || '';
    combined.push(logo + '  ' + text);
  }

  return combined;
}

// Display logo with connection details (Claude Code style - clean, minimal)
function displayLogoWithDetails(details = null) {
  const logoPath = path.join(__dirname, '../../images/logo.png');
  const version = require('../../package.json').version;

  // Render logo at ~24 chars wide, 3 rows tall (6 pixel rows with half-blocks)
  let logoLines = imageToPixels(logoPath, 24, 3);
  if (!logoLines) logoLines = COMPACT_LOGO;

  // Get pixel art text
  const textLines = getGbosTextPixels();

  // Combine logo and text
  const leftSide = combineLogoAndText(logoLines, textLines);
  const leftWidth = 70; // Account for escape codes

  // Build right side - Claude Code style (clean lines, no boxes)
  const rightLines = [];

  if (details) {
    // Title line with version
    rightLines.push(`${BOLD}${colors.purple5}GBOS${RESET} ${DIM}v${version}${RESET}`);
    // Account and App on same line
    rightLines.push(`${colors.white}${details.accountName || 'N/A'}${RESET} ${DIM}·${RESET} ${colors.purple5}${details.applicationName || 'N/A'}${RESET}`);
    // Node info
    rightLines.push(`${DIM}${details.nodeName || 'N/A'}${RESET}`);
  }

  // Print side by side
  console.log('');
  const maxLines = Math.max(leftSide.length, rightLines.length);
  const leftStart = Math.floor((maxLines - leftSide.length) / 2);
  const rightStart = Math.floor((maxLines - rightLines.length) / 2);

  for (let i = 0; i < maxLines; i++) {
    const left = leftSide[i - leftStart] || '';
    const right = rightLines[i - rightStart] || '';
    // Pad left side accounting for ANSI codes (rough estimate)
    const visibleLen = left.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = ' '.repeat(Math.max(0, leftWidth - visibleLen));
    console.log(`  ${left}${padding}${right}`);
  }
  console.log('');
}

function displayLogo() {
  displayLogoWithDetails(null);
}

function displayAuthSuccess(data) {
  const logoPath = path.join(__dirname, '../../images/logo.png');
  const version = require('../../package.json').version;

  let logoLines = imageToPixels(logoPath, 24, 6);
  if (!logoLines) logoLines = COMPACT_LOGO;

  const textLines = getGbosTextPixels();
  const leftSide = combineLogoAndText(logoLines, textLines);
  const leftWidth = 70;

  // Claude Code style - clean lines, no boxes
  const rightLines = [];
  rightLines.push(`${BOLD}${colors.purple5}GBOS${RESET} ${DIM}v${version}${RESET}`);
  rightLines.push(`${colors.purple5}✓${RESET} ${colors.white}Authenticated${RESET}`);
  rightLines.push(`${colors.white}${data.userName || 'N/A'}${RESET} ${DIM}·${RESET} ${colors.purple5}${data.accountName || 'N/A'}${RESET}`);
  rightLines.push('');
  rightLines.push(`${DIM}Run "gbos connect" to connect${RESET}`);

  console.log('');
  const maxLines = Math.max(leftSide.length, rightLines.length);
  const leftStart = Math.floor((maxLines - leftSide.length) / 2);
  const rightStart = Math.floor((maxLines - rightLines.length) / 2);

  for (let i = 0; i < maxLines; i++) {
    const left = leftSide[i - leftStart] || '';
    const right = rightLines[i - rightStart] || '';
    const visibleLen = left.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = ' '.repeat(Math.max(0, leftWidth - visibleLen));
    console.log(`  ${left}${padding}${right}`);
  }
  console.log('');
}

function displayConnectSuccess(data) {
  displayLogoWithDetails(data);
  console.log(`  ${colors.purple5}✓${RESET} ${BOLD}${colors.purple6}Ready to work!${RESET}`);
  console.log(`  ${DIM}${colors.purple7}Session: ~/.gbos/session.json${RESET}\n`);
}

function displaySessionSummary(data) {
  displayLogoWithDetails(data);
}

function displayMessageBox(title, message, type = 'info') {
  const colorMap = { info: colors.purple4, success: colors.purple5, warning: `${ESC}[33m`, error: `${ESC}[31m` };
  const color = colorMap[type] || colors.purple4;
  const icon = type === 'success' ? '✓' : type === 'warning' ? '⚠' : type === 'error' ? '✗' : 'ℹ';
  const width = Math.min(55, getTerminalWidth() - 4);

  console.log(`\n${color}┌${'─'.repeat(width)}┐${RESET}`);
  console.log(`${color}│${RESET} ${icon} ${BOLD}${colors.purple6}${title.substring(0, width - 5).padEnd(width - 4)}${RESET}${color}│${RESET}`);
  console.log(`${color}├${'─'.repeat(width)}┤${RESET}`);

  const words = message.split(' ');
  let currentLine = '';
  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length > width - 4) {
      console.log(`${color}│${RESET} ${colors.purple7}${currentLine.trim().padEnd(width - 2)}${RESET}${color}│${RESET}`);
      currentLine = word;
    } else {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    }
  }
  if (currentLine) {
    console.log(`${color}│${RESET} ${colors.purple7}${currentLine.trim().padEnd(width - 2)}${RESET}${color}│${RESET}`);
  }
  console.log(`${color}└${'─'.repeat(width)}┘${RESET}\n`);
}

module.exports = {
  colors,
  displayLogo,
  displayLogoWithDetails,
  displaySessionSummary,
  displayAuthSuccess,
  displayConnectSuccess,
  displayMessageBox,
  imageToPixels,
  getTerminalWidth,
};
