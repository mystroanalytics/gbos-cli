const path = require('path');
const { displayImage, getTerminalWidth } = require('../lib/display');

async function logoCommand() {
  const logoPath = path.join(__dirname, '../../images/logo.png');
  const terminalWidth = getTerminalWidth();
  const targetWidth = Math.max(16, Math.floor(terminalWidth * 0.2));

  await displayImage(logoPath, {
    width: targetWidth,
    fallbackWidth: targetWidth,
    fallbackHeight: 7,
    sharp: false,
    crop: true,
    alphaThreshold: 200,
    cropAlphaThreshold: 200,
  });
}

module.exports = logoCommand;
