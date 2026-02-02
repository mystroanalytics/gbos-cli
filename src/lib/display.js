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

// Shading characters for smooth edges (from light to full)
const SHADE_CHARS = [' ', '░', '▒', '▓', '█'];

// Get average alpha/coverage for a region (for anti-aliasing)
function getRegionCoverage(png, startX, startY, width, height) {
  let totalAlpha = 0;
  let totalR = 0, totalG = 0, totalB = 0;
  let samples = 0;

  for (let y = startY; y < startY + height; y++) {
    for (let x = startX; x < startX + width; x++) {
      const pixel = samplePixel(png, x, y);
      if (!isBackground(pixel)) {
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

// Convert PNG to true-color pixel art with smooth edges
// Uses shading characters for anti-aliasing on edges
function imageToPixels(imagePath, targetWidth = 24, targetHeight = 5) {
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
        // Get coverage for top and bottom halves of this cell
        const topStartY = row * 2 * cellHeight;
        const bottomStartY = (row * 2 + 1) * cellHeight;
        const startX = col * cellWidth;

        const topRegion = getRegionCoverage(png, startX, topStartY, cellWidth, cellHeight);
        const bottomRegion = getRegionCoverage(png, startX, bottomStartY, cellWidth, cellHeight);

        const topCov = topRegion.coverage;
        const bottomCov = bottomRegion.coverage;

        // Both empty
        if (topCov < 0.1 && bottomCov < 0.1) {
          line += ' ';
          continue;
        }

        // Use dots for very light coverage (edges)
        if (topCov < 0.3 && bottomCov < 0.3) {
          const avgCov = (topCov + bottomCov) / 2;
          const r = topCov > bottomCov ? topRegion.r : bottomRegion.r;
          const g = topCov > bottomCov ? topRegion.g : bottomRegion.g;
          const b = topCov > bottomCov ? topRegion.b : bottomRegion.b;
          if (avgCov < 0.15) {
            line += fg(r, g, b) + '·' + RESET;
          } else {
            line += fg(r, g, b) + '░' + RESET;
          }
          continue;
        }

        // Light top, solid bottom - use lower block with possible shading
        if (topCov < 0.3 && bottomCov >= 0.3) {
          if (topCov > 0.1) {
            // Add dot above
            line += fg(bottomRegion.r, bottomRegion.g, bottomRegion.b) + '▄' + RESET;
          } else {
            line += fg(bottomRegion.r, bottomRegion.g, bottomRegion.b) + LOWER_HALF + RESET;
          }
          continue;
        }

        // Solid top, light bottom
        if (topCov >= 0.3 && bottomCov < 0.3) {
          if (bottomCov > 0.1) {
            line += fg(topRegion.r, topRegion.g, topRegion.b) + '▀' + RESET;
          } else {
            line += fg(topRegion.r, topRegion.g, topRegion.b) + UPPER_HALF + RESET;
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
  const fallbackWidth = options.fallbackWidth || 40;
  const fallbackHeight = options.fallbackHeight || 12;
  const renderOptions = { ...options };
  delete renderOptions.fallbackWidth;
  delete renderOptions.fallbackHeight;

  try {
    const terminalImage = await import('terminal-image');
    const renderer = terminalImage.default || terminalImage;
    const output = await renderer.file(imagePath, renderOptions);
    process.stdout.write(output);
    if (!output.endsWith('\n')) process.stdout.write('\n');
    return true;
  } catch (error) {
    const fallbackLines = imageToPixels(imagePath, fallbackWidth, fallbackHeight);
    if (!fallbackLines) {
      throw error;
    }
    console.log('');
    fallbackLines.forEach((line) => console.log(line));
    console.log('');
    return false;
  }
}


// Fallback compact logo
const COMPACT_LOGO = [
  `${fg(...PURPLE.medium)}  ▄▀▀▄${RESET}`,
  `${fg(...PURPLE.medium)}▄▀${fg(...PURPLE.bright)}·${fg(...PURPLE.medium)} ▀▄${RESET}`,
  `${fg(...PURPLE.light)} ▀▄▄▀${RESET}`,
];

// Display logo with connection details (Claude Code style - clean, minimal)
function displayLogoWithDetails(details = null) {
  const logoPath = path.join(__dirname, '../../images/logo-2.png');
  const version = require('../../package.json').version;

  // Render logo at ~20 chars wide, 5 rows tall (smooth edges)
  let logoLines = imageToPixels(logoPath, 20, 5);
  if (!logoLines) logoLines = COMPACT_LOGO;

  const logoWidth = 28; // Account for escape codes

  // Build right side - Claude Code style (clean lines, no boxes)
  const rightLines = [];

  if (details) {
    rightLines.push(`${BOLD}${colors.purple5}GBOS${RESET} ${DIM}v${version}${RESET}`);
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
  const logoPath = path.join(__dirname, '../../images/logo-2.png');
  const version = require('../../package.json').version;

  let logoLines = imageToPixels(logoPath, 20, 5);
  if (!logoLines) logoLines = COMPACT_LOGO;

  const logoWidth = 28;

  const rightLines = [];
  rightLines.push(`${BOLD}${colors.purple5}GBOS${RESET} ${DIM}v${version}${RESET}`);
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
  displayImage,
  imageToPixels,
  getTerminalWidth,
};
