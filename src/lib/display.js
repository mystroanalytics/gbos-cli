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

function applyAlphaThreshold(png, alphaThreshold) {
  if (!alphaThreshold) return png;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] < alphaThreshold) {
      png.data[i + 3] = 0;
    }
  }
  return png;
}

function preparePngForRender(imagePath, options = {}) {
  const { alphaThreshold, crop, cropAlphaThreshold } = options;
  const data = fs.readFileSync(imagePath);
  let png = PNG.sync.read(data);
  if (alphaThreshold) {
    png = applyAlphaThreshold(png, alphaThreshold);
  }
  if (crop) {
    png = cropPng(png, cropAlphaThreshold ?? alphaThreshold ?? 1);
  }
  return PNG.sync.write(png);
}

async function displayImage(imagePath, options = {}) {
  const fallbackWidth = options.fallbackWidth === undefined ? 40 : options.fallbackWidth;
  const fallbackHeight = options.fallbackHeight === undefined ? 12 : options.fallbackHeight;
  const sharp = options.sharp ?? false;
  const alphaThreshold = options.alphaThreshold ?? 50;
  const crop = options.crop ?? false;
  const cropAlphaThreshold = options.cropAlphaThreshold;
  const backgroundLuminance = options.backgroundLuminance ?? 240;
  const useProcessedBuffer = crop || sharp;
  const renderOptions = { ...options };
  delete renderOptions.fallbackWidth;
  delete renderOptions.fallbackHeight;
  delete renderOptions.sharp;
  delete renderOptions.alphaThreshold;
  delete renderOptions.crop;
  delete renderOptions.cropAlphaThreshold;
  delete renderOptions.backgroundLuminance;

  try {
    let supportsGraphics = false;
    try {
      const supportsTerminalGraphics = await import('supports-terminal-graphics');
      const graphics = supportsTerminalGraphics.default || supportsTerminalGraphics;
      supportsGraphics = Boolean(
        graphics?.stdout?.kitty || graphics?.stdout?.iterm2 || graphics?.stdout?.sixel,
      );
    } catch {
      supportsGraphics = false;
    }

    if (supportsGraphics) {
      const terminalImage = await import('terminal-image');
      const renderer = terminalImage.default || terminalImage;
      const buffer = useProcessedBuffer
        ? preparePngForRender(imagePath, { alphaThreshold, crop, cropAlphaThreshold })
        : null;
      const output = buffer
        ? await renderer.buffer(buffer, renderOptions)
        : await renderer.file(imagePath, renderOptions);
      process.stdout.write(output);
      if (!output.endsWith('\n')) process.stdout.write('\n');
      return true;
    }
  } catch (error) {
    // Fall through to ANSI fallback
  }

  const fallbackLines = imageToPixels(imagePath, fallbackWidth, fallbackHeight, {
    sampleMode: sharp ? 'nearest' : 'coverage',
    alphaThreshold,
    backgroundLuminance,
    crop,
    cropAlphaThreshold: cropAlphaThreshold ?? alphaThreshold,
  });
  if (!fallbackLines) {
    throw new Error('Unable to render image.');
  }
  console.log('');
  fallbackLines.forEach((line) => console.log(line));
  console.log('');
  return false;
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
