const path = require('path');
const { displayImage, getTerminalWidth } = require('../lib/display');

async function logoCommand() {
  const logoPath = path.join(__dirname, '../../images/logo-2.png');
  const terminalWidth = getTerminalWidth();
  const targetWidth = Math.min(120, Math.max(40, terminalWidth - 4));

  await displayImage(logoPath, {
    width: targetWidth,
    fallbackWidth: targetWidth,
    fallbackHeight: null,
    sharp: true,
    crop: true,
    alphaThreshold: 220,
    cropAlphaThreshold: 220,
  });
}

module.exports = logoCommand;
