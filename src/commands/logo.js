const path = require('path');
const { displayImage, getTerminalWidth } = require('../lib/display');

async function logoCommand() {
  const logoPath = path.join(__dirname, '../../images/logo-2.png');
  const terminalWidth = getTerminalWidth();
  const targetWidth = Math.min(60, Math.max(30, terminalWidth - 10));

  await displayImage(logoPath, {
    width: targetWidth,
    fallbackWidth: 40,
    fallbackHeight: 12,
  });
}

module.exports = logoCommand;
