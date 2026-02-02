const path = require('path');
const { displayImage, getTerminalWidth } = require('../lib/display');

async function logoCommand() {
  const logoPath = path.join(__dirname, '../../images/logo.png');
  const terminalWidth = getTerminalWidth();
  const targetWidth = Math.max(10, Math.floor(terminalWidth * 0.2));

  await displayImage(logoPath, {
    width: targetWidth,
    fallbackWidth: targetWidth,
    fallbackHeight: 5,
    sharp: true,
    crop: true,
    alphaThreshold: 220,
    cropAlphaThreshold: 220,
  });
}

module.exports = logoCommand;
