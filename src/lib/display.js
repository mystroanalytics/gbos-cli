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

// GBOS brand colors from logo
const LOGO_NAVY = [36, 31, 102];     // Primary Deep Indigo
const LOGO_LIGHT = [85, 110, 255];   // Lighter blue for gradient

// Purple theme RGB values (legacy)
const PURPLE = {
  dark: [75, 0, 130],      // Deep purple
  medium: [128, 0, 128],   // Purple
  light: [147, 112, 219],  // Medium purple
  bright: [186, 85, 211],  // Medium orchid
  pale: [216, 191, 216],   // Thistle
};

// GBOS.IO ASCII Banner
const GBOS_BANNER = [
  " ██████╗ ██████╗  ██████╗ ███████╗   ██╗ ██████╗ ",
  "██╔════╝ ██╔══██╗██╔═══██╗██╔════╝   ██║██╔═══██╗",
  "██║  ███╗██████╔╝██║   ██║███████╗██╗██║██║   ██║",
  "██║   ██║██╔══██╗██║   ██║╚════██║╚═╝██║██║   ██║",
  "╚██████╔╝██████╔╝╚██████╔╝███████║   ██║╚██████╔╝",
  " ╚═════╝ ╚═════╝  ╚═════╝ ╚══════╝   ╚═╝ ╚═════╝ "
];

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
function isBackground(pixel, options = {}) {
  const alphaThreshold = options.alphaThreshold ?? 50;
  const backgroundLuminance = options.backgroundLuminance ?? 240;
  return pixel.a < alphaThreshold ||
    (pixel.r > backgroundLuminance && pixel.g > backgroundLuminance && pixel.b > backgroundLuminance);
}

// Shading characters for smooth edges (from light to full)
const SHADE_CHARS = [' ', '░', '▒', '▓', '█'];

// Get average alpha/coverage for a region (for anti-aliasing)
function getRegionCoverage(png, startX, startY, width, height, backgroundOptions = {}) {
  let totalAlpha = 0;
  let totalR = 0, totalG = 0, totalB = 0;
  let samples = 0;

  for (let y = startY; y < startY + height; y++) {
    for (let x = startX; x < startX + width; x++) {
      const pixel = samplePixel(png, x, y);
      if (!isBackground(pixel, backgroundOptions)) {
        totalAlpha += pixel.a;
        totalR += pixel.r;
        totalG += pixel.g;
        totalB += pixel.b;
        samples++;
      }
    }
  }

  if (samples === 0) return { coverage: 0, r: 0, g: 0, b: 0 };

  const totalPossible = width * height;
  return {
    coverage: samples / totalPossible,
    r: Math.round(totalR / samples),
    g: Math.round(totalG / samples),
    b: Math.round(totalB / samples),
  };
}

function cropPng(png, alphaThreshold = 1) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const idx = (png.width * y + x) << 2;
      if (png.data[idx + 3] >= alphaThreshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) return png;

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const cropped = new PNG({ width, height });

  for (let y = 0; y < height; y++) {
    const srcStart = ((minY + y) * png.width + minX) << 2;
    const srcEnd = srcStart + (width << 2);
    const destStart = (width * y) << 2;
    png.data.copy(cropped.data, destStart, srcStart, srcEnd);
  }

  return cropped;
}

// Convert PNG to true-color pixel art
// Uses shading characters for anti-aliasing on edges when sampling coverage
function imageToPixels(imagePath, targetWidth = 24, targetHeight = 5, options = {}) {
  const {
    alphaThreshold = 50,
    backgroundLuminance = 240,
    sampleMode = 'coverage',
    crop = false,
    cropAlphaThreshold = 1,
  } = options;

  try {
    const data = fs.readFileSync(imagePath);
    let png = PNG.sync.read(data);
    if (crop) {
      png = cropPng(png, cropAlphaThreshold);
    }

    const resolvedWidth = Math.max(1, Math.round(targetWidth));
    const resolvedHeight = targetHeight == null
      ? Math.max(1, Math.round((resolvedWidth * png.height) / (png.width * 2)))
      : Math.max(1, Math.round(targetHeight));

    // Each row of output = 2 rows of pixels (using half-blocks)
    const pixelRows = resolvedHeight * 2;
    const cellWidth = png.width / resolvedWidth;
    const cellHeight = png.height / pixelRows;
    const backgroundOptions = { alphaThreshold, backgroundLuminance };

    const lines = [];

    for (let row = 0; row < resolvedHeight; row++) {
      let line = '';
      for (let col = 0; col < resolvedWidth; col++) {
        if (sampleMode === 'nearest') {
          const topStartY = row * 2 * cellHeight;
          const bottomStartY = (row * 2 + 1) * cellHeight;
          const startX = col * cellWidth;

          const topPixel = samplePixel(png, startX + cellWidth * 0.5, topStartY + cellHeight * 0.5);
          const bottomPixel = samplePixel(png, startX + cellWidth * 0.5, bottomStartY + cellHeight * 0.5);
          const topBg = isBackground(topPixel, backgroundOptions);
          const bottomBg = isBackground(bottomPixel, backgroundOptions);

          if (topBg && bottomBg) {
            line += ' ';
            continue;
          }

          if (!topBg && !bottomBg) {
            line += fg(topPixel.r, topPixel.g, topPixel.b) +
              bg(bottomPixel.r, bottomPixel.g, bottomPixel.b) +
              UPPER_HALF + RESET;
            continue;
          }

          if (!topBg) {
            line += fg(topPixel.r, topPixel.g, topPixel.b) + UPPER_HALF + RESET;
          } else {
            line += fg(bottomPixel.r, bottomPixel.g, bottomPixel.b) + LOWER_HALF + RESET;
          }
          continue;
        }

        // Get coverage for top and bottom halves of this cell
        const topStartY = row * 2 * cellHeight;
        const bottomStartY = (row * 2 + 1) * cellHeight;
        const startX = col * cellWidth;

        const topRegion = getRegionCoverage(png, startX, topStartY, cellWidth, cellHeight, backgroundOptions);
        const bottomRegion = getRegionCoverage(png, startX, bottomStartY, cellWidth, cellHeight, backgroundOptions);

        const topCov = topRegion.coverage;
        const bottomCov = bottomRegion.coverage;

        // Both empty
        if (topCov < 0.05 && bottomCov < 0.05) {
          line += ' ';
          continue;
        }

        // Very light coverage on both - use dots for smooth curves
        if (topCov < 0.2 && bottomCov < 0.2) {
          const avgCov = (topCov + bottomCov) / 2;
          const r = topCov > bottomCov ? topRegion.r : bottomRegion.r;
          const g = topCov > bottomCov ? topRegion.g : bottomRegion.g;
          const b = topCov > bottomCov ? topRegion.b : bottomRegion.b;
          if (avgCov < 0.08) {
            line += fg(r, g, b) + '·' + RESET;
          } else if (avgCov < 0.15) {
            line += fg(r, g, b) + '░' + RESET;
          } else {
            line += fg(r, g, b) + '▒' + RESET;
          }
          continue;
        }

        // Light top (edge), more solid bottom
        if (topCov < 0.4 && bottomCov >= 0.2) {
          if (topCov < 0.1) {
            line += fg(bottomRegion.r, bottomRegion.g, bottomRegion.b) + LOWER_HALF + RESET;
          } else if (topCov < 0.2) {
            // Light edge on top - use lower block (curve effect)
            line += fg(bottomRegion.r, bottomRegion.g, bottomRegion.b) + '▄' + RESET;
          } else {
            // Partial coverage - blend
            line += fg(topRegion.r, topRegion.g, topRegion.b) +
                    bg(bottomRegion.r, bottomRegion.g, bottomRegion.b) +
                    UPPER_HALF + RESET;
          }
          continue;
        }

        // More solid top, light bottom (edge)
        if (topCov >= 0.2 && bottomCov < 0.4) {
          if (bottomCov < 0.1) {
            line += fg(topRegion.r, topRegion.g, topRegion.b) + UPPER_HALF + RESET;
          } else if (bottomCov < 0.2) {
            // Light edge on bottom - use upper block (curve effect)
            line += fg(topRegion.r, topRegion.g, topRegion.b) + '▀' + RESET;
          } else {
            // Partial coverage - blend
            line += fg(topRegion.r, topRegion.g, topRegion.b) +
                    bg(bottomRegion.r, bottomRegion.g, bottomRegion.b) +
                    UPPER_HALF + RESET;
          }
          continue;
        }

        // Both have significant coverage - use half block with colors
        line += fg(topRegion.r, topRegion.g, topRegion.b) +
                bg(bottomRegion.r, bottomRegion.g, bottomRegion.b) +
                UPPER_HALF + RESET;
      }
      lines.push(line);
    }

    return lines;
  } catch (e) {
    return null;
  }
}

async function displayImage(imagePath, options = {}) {
  const width = options.fallbackWidth ?? options.width ?? 40;
  const height = options.fallbackHeight ?? options.height ?? 12;
  const sharp = options.sharp ?? false;
  const alphaThreshold = options.alphaThreshold ?? 50;
  const crop = options.crop ?? false;
  const cropAlphaThreshold = options.cropAlphaThreshold;
  const backgroundLuminance = options.backgroundLuminance ?? 240;

  const lines = imageToPixels(imagePath, width, height, {
    sampleMode: sharp ? 'nearest' : 'coverage',
    alphaThreshold,
    backgroundLuminance,
    crop,
    cropAlphaThreshold: cropAlphaThreshold ?? alphaThreshold,
  });
  if (!lines) {
    throw new Error('Unable to render image.');
  }
  console.log('');
  lines.forEach((line) => console.log(line));
  console.log('');
}


// Fallback compact logo
const COMPACT_LOGO = [
  `${fg(...PURPLE.medium)}  ▄▀▀▄${RESET}`,
  `${fg(...PURPLE.medium)}▄▀${fg(...PURPLE.bright)}·${fg(...PURPLE.medium)} ▀▄${RESET}`,
  `${fg(...PURPLE.light)} ▀▄▄▀${RESET}`,
];

// Display logo with connection details (Claude Code style - clean, minimal)
function displayLogoWithDetails(details = null) {
  const logoPath = path.join(__dirname, '../../images/logo.png');
  const version = require('../../package.json').version;

  // Render logo at ~22 chars wide, 9 rows tall with smooth curved edges
  let logoLines = imageToPixels(logoPath, 22, 9, {
    alphaThreshold: 100,
    crop: true,
    cropAlphaThreshold: 100,
    sampleMode: 'coverage',
  });
  if (!logoLines) logoLines = COMPACT_LOGO;

  const logoWidth = 28; // Account for escape codes

  // Build right side - Claude Code style (clean lines, no boxes)
  const rightLines = [];

  if (details) {
    rightLines.push(`${BOLD}${colors.purple5}gbos.io${RESET} ${DIM}v${version}${RESET}`);
    rightLines.push(`${colors.white}${details.accountName || 'N/A'}${RESET} ${DIM}·${RESET} ${colors.purple5}${details.applicationName || 'N/A'}${RESET}`);
    rightLines.push(`${DIM}${details.nodeName || 'N/A'}${RESET}`);
  }

  // Print side by side
  console.log('');
  const maxLines = Math.max(logoLines.length, rightLines.length);
  const logoStart = Math.floor((maxLines - logoLines.length) / 2);
  const rightStart = Math.floor((maxLines - rightLines.length) / 2);

  for (let i = 0; i < maxLines; i++) {
    const left = logoLines[i - logoStart] || '';
    const right = rightLines[i - rightStart] || '';
    const visibleLen = left.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = ' '.repeat(Math.max(0, logoWidth - visibleLen));
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

  let logoLines = imageToPixels(logoPath, 22, 9, {
    alphaThreshold: 100,
    crop: true,
    cropAlphaThreshold: 100,
    sampleMode: 'coverage',
  });
  if (!logoLines) logoLines = COMPACT_LOGO;

  const logoWidth = 28;

  const rightLines = [];
  rightLines.push(`${BOLD}${colors.purple5}gbos.io${RESET} ${DIM}v${version}${RESET}`);
  rightLines.push(`${colors.purple5}✓${RESET} ${colors.white}Authenticated${RESET}`);
  rightLines.push(`${colors.white}${data.userName || 'N/A'}${RESET} ${DIM}·${RESET} ${colors.purple5}${data.accountName || 'N/A'}${RESET}`);
  rightLines.push('');
  rightLines.push(`${DIM}Run "gbos connect" to connect${RESET}`);

  console.log('');
  const maxLines = Math.max(logoLines.length, rightLines.length);
  const logoStart = Math.floor((maxLines - logoLines.length) / 2);
  const rightStart = Math.floor((maxLines - rightLines.length) / 2);

  for (let i = 0; i < maxLines; i++) {
    const left = logoLines[i - logoStart] || '';
    const right = rightLines[i - rightStart] || '';
    const visibleLen = left.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = ' '.repeat(Math.max(0, logoWidth - visibleLen));
    console.log(`  ${left}${padding}${right}`);
  }
  console.log('');
}

function displayConnectSuccess(data) {
  displayLogoWithDetails(data);
  console.log(`  ${colors.purple5}✓${RESET} ${BOLD}${colors.purple6}Connected!${RESET}`);
  console.log(`  ${DIM}${colors.purple7}Run your favorite coding agent in this CLI to start working.${RESET}\n`);
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

// Print GBOS banner with gradient
function printBanner() {
  const termWidth = getTerminalWidth();
  const bannerWidth = GBOS_BANNER[0].length;
  const padding = Math.max(0, Math.floor((termWidth - bannerWidth) / 2));
  const padStr = ' '.repeat(padding);

  console.log('');
  GBOS_BANNER.forEach((line) => {
    let coloredLine = '';
    for (let i = 0; i < line.length; i++) {
      const ratio = i / line.length;
      const r = Math.floor(LOGO_NAVY[0] + (LOGO_LIGHT[0] - LOGO_NAVY[0]) * ratio);
      const g = Math.floor(LOGO_NAVY[1] + (LOGO_LIGHT[1] - LOGO_NAVY[1]) * ratio);
      const b = Math.floor(LOGO_NAVY[2] + (LOGO_LIGHT[2] - LOGO_NAVY[2]) * ratio);

      if (line[i] === ' ') {
        coloredLine += ' ';
      } else {
        coloredLine += `${fg(r, g, b)}${line[i]}`;
      }
    }
    console.log(`${padStr}${coloredLine}${RESET}`);
  });
  console.log(`${DIM}${' '.repeat(padding)}   Generative Business Operating System${RESET}\n`);
}

// Color definitions for status table
const TABLE_COLORS = {
  white: '\x1b[37m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
  magenta: '\x1b[35m',
};

// Print status table with two columns
function printStatusTable(leftColumn, rightColumn) {
  const termWidth = getTerminalWidth();
  const tableWidth = Math.min(80, termWidth - 4);
  const colWidth = Math.floor((tableWidth - 3) / 2); // -3 for borders and divider
  const borderColor = fg(...LOGO_NAVY);
  const labelColor = DIM;

  // Helper to get value color based on field and value
  const getValueColor = (label, value) => {
    const lowerLabel = (label || '').toLowerCase();
    const hasValue = value && value !== 'N/A' && value !== 'Unknown';

    if (lowerLabel.includes('status')) {
      if (value && value.includes('Connected')) return TABLE_COLORS.green;
      if (value && value.includes('Authenticated')) return TABLE_COLORS.blue;
      return TABLE_COLORS.red;
    }
    if (lowerLabel.includes('application') || lowerLabel.includes('node')) {
      return hasValue ? TABLE_COLORS.white : TABLE_COLORS.red;
    }
    return TABLE_COLORS.white;
  };

  // Helper to format a row
  const formatCell = (label, value, width) => {
    const displayValue = value || 'N/A';
    const valueColor = getValueColor(label, displayValue);
    const content = `${labelColor}${label}:${RESET} ${valueColor}${displayValue}${RESET}`;
    const visibleLen = `${label}: ${displayValue}`.length;
    const padding = Math.max(0, width - visibleLen);
    return content + ' '.repeat(padding);
  };

  console.log(`${borderColor}┌${'─'.repeat(colWidth)}┬${'─'.repeat(colWidth)}┐${RESET}`);

  const maxRows = Math.max(leftColumn.length, rightColumn.length);
  for (let i = 0; i < maxRows; i++) {
    const left = leftColumn[i] || { label: '', value: '' };
    const right = rightColumn[i] || { label: '', value: '' };

    const leftCell = left.label ? formatCell(left.label, left.value, colWidth - 2) : ' '.repeat(colWidth - 2);
    const rightCell = right.label ? formatCell(right.label, right.value, colWidth - 2) : ' '.repeat(colWidth - 2);

    console.log(`${borderColor}│${RESET} ${leftCell}${borderColor}│${RESET} ${rightCell}${borderColor}│${RESET}`);
  }

  console.log(`${borderColor}└${'─'.repeat(colWidth)}┴${'─'.repeat(colWidth)}┘${RESET}`);
}

// Display full status screen with banner and table
function displayStatus(data) {
  printBanner();

  const leftColumn = [
    { label: 'Account', value: data.accountName || 'N/A' },
    { label: 'User', value: data.userName || 'Not authenticated' },
    { label: 'Session', value: data.connectionId ? data.connectionId.substring(0, 12) + '...' : 'N/A' },
  ];

  const rightColumn = [
    { label: 'Status', value: data.isConnected ? '● Connected' : (data.userName ? '● Authenticated' : '○ Not authenticated') },
    { label: 'Application', value: data.applicationName || 'N/A' },
    { label: 'Node', value: data.nodeName || 'N/A' },
  ];

  printStatusTable(leftColumn, rightColumn);
  console.log('');
}

// Display connect success with banner
function displayConnectBanner(data) {
  printBanner();

  const leftColumn = [
    { label: 'Account', value: data.accountName || 'N/A' },
    { label: 'User', value: data.userName || 'N/A' },
    { label: 'Session', value: data.sessionId ? data.sessionId.substring(0, 12) + '...' : 'N/A' },
  ];

  const rightColumn = [
    { label: 'Status', value: '● Connected' },
    { label: 'Application', value: data.applicationName || 'N/A' },
    { label: 'Node', value: data.nodeName || 'N/A' },
  ];

  printStatusTable(leftColumn, rightColumn);

  // Instructions with highlighted keywords
  const cmd = TABLE_COLORS.cyan;
  const highlight = TABLE_COLORS.yellow;
  const dim = DIM;

  console.log(`\n  ${fg(...LOGO_LIGHT)}✓${RESET} ${BOLD}Connected!${RESET}\n`);
  console.log(`  Run your favorite ${highlight}coding agent${RESET} in this CLI to start working.`);
  console.log(`  Use ${cmd}/gbos${RESET} to list commands or simply ask your agent to run these commands.\n`);

  console.log(`  ${dim}Available commands:${RESET}`);
  console.log(`    ${cmd}auth${RESET} ${dim}[options]${RESET}      Authenticate with GBOS services`);
  console.log(`    ${cmd}connect${RESET} ${dim}[options]${RESET}   Connect to a GBOS development node`);
  console.log(`    ${cmd}disconnect${RESET}          Disconnect from the current GBOS node`);
  console.log(`    ${cmd}status${RESET}              Show current authentication and connection status`);
  console.log(`    ${cmd}tasks${RESET}               Show tasks assigned to this development node`);
  console.log(`    ${cmd}next${RESET}                Get the next task in the queue`);
  console.log(`    ${cmd}continue${RESET}            Continue working on current/next task`);
  console.log(`    ${cmd}fallback${RESET}            Cancel current task and revert to last completed state`);
  console.log(`    ${cmd}auto${RESET}                Automatically work through all tasks and poll for new ones`);
  console.log(`    ${cmd}add_task${RESET}            Create a new task interactively`);
  console.log(`    ${cmd}logout${RESET} ${dim}[options]${RESET}    Log out from GBOS services and clear credentials`);
  console.log(`    ${cmd}help${RESET} ${dim}[command]${RESET}      Display help for a specific command\n`);

  console.log(`  ${dim}Supported Agents:${RESET} ${highlight}Claude${RESET}, ${highlight}Codex${RESET}, ${highlight}Gemini${RESET}, ${highlight}Cursor IDE${RESET}, ${highlight}AntiGravity IDE${RESET}, ${highlight}VS Code IDE${RESET}\n`);
}

// Display auth success with banner
function displayAuthBanner(data) {
  printBanner();

  const leftColumn = [
    { label: 'Account', value: data.accountName || 'N/A' },
    { label: 'User', value: data.userName || 'N/A' },
    { label: 'Session', value: data.sessionId ? data.sessionId.substring(0, 12) + '...' : 'N/A' },
  ];

  const rightColumn = [
    { label: 'Status', value: '● Authenticated' },
    { label: 'Application', value: 'N/A' },
    { label: 'Node', value: 'N/A' },
  ];

  printStatusTable(leftColumn, rightColumn);

  const cmd = TABLE_COLORS.cyan;
  console.log(`\n  ${fg(...LOGO_LIGHT)}✓${RESET} ${BOLD}Authenticated!${RESET}`);
  console.log(`  ${DIM}Run${RESET} ${cmd}gbos connect${RESET} ${DIM}to connect to a development node.${RESET}\n`);
}

module.exports = {
  colors,
  displayLogo,
  displayLogoWithDetails,
  displaySessionSummary,
  displayAuthSuccess,
  displayConnectSuccess,
  displayMessageBox,
  displayImage,
  imageToPixels,
  getTerminalWidth,
  printBanner,
  printStatusTable,
  displayStatus,
  displayConnectBanner,
  displayAuthBanner,
  fg,
  bg,
  LOGO_NAVY,
  LOGO_LIGHT,
  RESET,
  BOLD,
  DIM,
};
