const api = require('../lib/api');
const config = require('../lib/config');

async function logoutCommand(options) {
  // Check if authenticated
  if (!config.isAuthenticated()) {
    console.log('\nNot currently authenticated.\n');
    return;
  }

  try {
    const session = config.loadSession();

    // Disconnect from node if connected
    const connection = config.getConnection();
    if (connection) {
      console.log('Disconnecting from node...');
      try {
        await api.disconnect();
      } catch (e) {
        // Ignore disconnect errors during logout
      }
    }

    // Call logout API
    console.log('Logging out...');
    try {
      await api.logout();
    } catch (e) {
      // Ignore API errors - we'll clear local session anyway
    }

    // Clear local session
    if (options.all) {
      // Clear everything including machine ID
      const fs = require('fs');
      const path = require('path');
      const configDir = config.getConfigDir();

      if (fs.existsSync(configDir)) {
        fs.rmSync(configDir, { recursive: true });
        console.log('Cleared all GBOS data.\n');
      }
    } else {
      config.clearSession();
    }

    console.log('\n✓ Successfully logged out.\n');

  } catch (error) {
    // Clear session anyway on error
    config.clearSession();
    console.log('\n✓ Logged out (session cleared locally).\n');
  }
}

module.exports = logoutCommand;
