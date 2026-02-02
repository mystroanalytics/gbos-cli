const path = require('path');
const { displayImage, getTerminalWidth } = require('../lib/display');

async function logoCommand() {
  const logoPath = path.join(__dirname, '../../images/logo.png');
  const terminalWidth = getTerminalWidth();
  const targetWidth = Math.max(20, Math.floor(terminalWidth * 0.2));

  await displayImage(logoPath, {
    width: targetWidth,
    fallbackWidth: targetWidth,
    fallbackHeight: 8,
    sharp: false,
    crop: true,
    alphaThreshold: 180,
    cropAlphaThreshold: 180,
  });
}

module.exports = logoCommand;
