const api = require('../lib/api');
const config = require('../lib/config');
const { checkForUpdates } = require('../lib/version');
const { displayAuthSuccess, displayMessageBox } = require('../lib/display');

// Sleep helper
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Spinner frames
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

async function authCommand(options) {
  // Check for updates first
  await checkForUpdates();

  // Check if already authenticated
  if (config.isAuthenticated() && !options.force) {
    const session = config.loadSession();
    const userName = session.user_first_name && session.user_last_name
      ? `${session.user_first_name} ${session.user_last_name}`
      : session.user_name || `User ${session.user_id}`;
    const accountName = session.account_name || `Account ${session.account_id}`;
    displayMessageBox(
      'Already Authenticated',
      `${userName} · ${accountName}. Use --force to re-authenticate or "gbos logout" first.`,
      'info'
    );
    return;
  }

  try {
    console.log('\nInitializing authentication...');

    // Initialize device auth flow
    const initResponse = await api.initAuth({});
    const { device_code, verification_code, verification_url_complete, interval, expires_in } =
      initResponse.data;

    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│                    GBOS Authentication                       │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log(`│  Device Code: ${device_code}                              │`);
    console.log('│                                                             │');
    console.log('│  Please visit the following URL to authorize:              │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log(`\n${verification_url_complete}\n`);
    console.log(`Code expires in ${Math.floor(expires_in / 60)} minutes.\n`);

    // Try to open the URL in the default browser
    const openCommand =
      process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';

    try {
      const { exec } = require('child_process');
      exec(`${openCommand} "${verification_url_complete}"`);
      console.log('Opening browser...\n');
    } catch (e) {
      console.log('Please open the URL above in your browser.\n');
    }

    // Poll for authorization
    const pollInterval = (interval || 5) * 1000;
    const maxAttempts = Math.ceil((expires_in || 900) / (interval || 5));
    let attempts = 0;
    let frameIndex = 0;

    process.stdout.write('Waiting for authorization... ');

    while (attempts < maxAttempts) {
      attempts++;

      // Show spinner
      process.stdout.write(`\rWaiting for authorization... ${spinnerFrames[frameIndex]} `);
      frameIndex = (frameIndex + 1) % spinnerFrames.length;

      await sleep(pollInterval);

      try {
        const statusResponse = await api.checkAuthStatus(verification_code);

        if (statusResponse.status === 'approved' && statusResponse.data) {
          // Clear spinner line
          process.stdout.write('\r' + ' '.repeat(50) + '\r');

          const {
            access_token,
            refresh_token,
            expires_in: tokenExpires,
            user_id,
            user_name,
            user_email,
            user_first_name,
            user_last_name,
            account_id,
            account_name,
            session_id,
          } = statusResponse.data;

          // Calculate token expiration - default to 24 hours if not provided or too short
          const expiresInSeconds = tokenExpires && tokenExpires > 60 ? tokenExpires : 86400;
          const tokenExpiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

          // Build display name from first_name + last_name
          const displayUserName = user_first_name && user_last_name
            ? `${user_first_name} ${user_last_name}`
            : user_name || `User ${user_id}`;

          // Save session with names
          config.saveSession({
            access_token,
            refresh_token,
            token_expires_at: tokenExpiresAt,
            user_id,
            user_name: displayUserName,
            user_first_name,
            user_last_name,
            user_email,
            account_id,
            account_name: account_name || `Account ${account_id}`,
            session_id,
            authenticated_at: new Date().toISOString(),
          });

          // Display success with logo - use names
          displayAuthSuccess({
            userName: displayUserName,
            accountName: account_name || `Account ${account_id}`,
            sessionId: session_id,
          });

          return;
        }

        if (statusResponse.status === 'denied') {
          process.stdout.write('\r' + ' '.repeat(50) + '\r');
          displayMessageBox('Authorization Denied', 'The authorization request was denied.', 'error');
          process.exit(1);
        }

        if (statusResponse.status === 'expired') {
          process.stdout.write('\r' + ' '.repeat(50) + '\r');
          displayMessageBox(
            'Authorization Expired',
            'The authorization request expired. Please try again.',
            'error'
          );
          process.exit(1);
        }

        // Status is pending, continue polling
      } catch (error) {
        if (error.status === 410) {
          process.stdout.write('\r' + ' '.repeat(50) + '\r');
          displayMessageBox(
            'Authorization Expired',
            'The authorization request expired. Please try again.',
            'error'
          );
          process.exit(1);
        }
        if (error.status === 403) {
          process.stdout.write('\r' + ' '.repeat(50) + '\r');
          displayMessageBox('Authorization Denied', 'The authorization request was denied.', 'error');
          process.exit(1);
        }
        // For other errors, continue polling
      }
    }

    process.stdout.write('\r' + ' '.repeat(50) + '\r');
    displayMessageBox('Authorization Timeout', 'The authorization request timed out. Please try again.', 'error');
    process.exit(1);
  } catch (error) {
    displayMessageBox('Authentication Failed', error.message, 'error');
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exit(1);
  }
}

module.exports = authCommand;
