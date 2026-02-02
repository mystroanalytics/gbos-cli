const api = require('../lib/api');
const config = require('../lib/config');
const readline = require('readline');

// Simple prompt for email
async function promptEmail() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Enter your email address: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Sleep helper
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Spinner frames
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

async function authCommand(options) {
  // Check if already authenticated
  if (config.isAuthenticated() && !options.force) {
    const session = config.loadSession();
    console.log(`\nAlready authenticated as user ID: ${session.user_id}`);
    console.log(`Account ID: ${session.account_id}`);
    console.log(`\nUse --force to re-authenticate or 'gbos logout' first.\n`);
    return;
  }

  try {
    // Get email from user
    const email = options.email || await promptEmail();

    if (!email || !email.includes('@')) {
      console.error('Invalid email address.');
      process.exit(1);
    }

    console.log(`\nInitializing authentication for: ${email}`);

    // Initialize device auth flow
    const initResponse = await api.initAuth({ email });
    const { device_code, verification_code, verification_url_complete, interval, expires_in } = initResponse.data;

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
    const openCommand = process.platform === 'darwin' ? 'open' :
                        process.platform === 'win32' ? 'start' : 'xdg-open';

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

          const { access_token, refresh_token, expires_in: tokenExpires, user_id, account_id, session_id } = statusResponse.data;

          // Calculate token expiration
          const tokenExpiresAt = new Date(Date.now() + tokenExpires * 1000).toISOString();

          // Save session
          config.saveSession({
            access_token,
            refresh_token,
            token_expires_at: tokenExpiresAt,
            user_id,
            account_id,
            session_id,
            authenticated_at: new Date().toISOString(),
          });

          console.log('\n✓ Authentication successful!\n');
          console.log(`  User ID:    ${user_id}`);
          console.log(`  Account ID: ${account_id}`);
          console.log(`  Session:    ${session_id}\n`);
          console.log('Run "gbos connect" to connect to a development node.\n');
          return;
        }

        if (statusResponse.status === 'denied') {
          process.stdout.write('\r' + ' '.repeat(50) + '\r');
          console.log('\n✗ Authorization denied.\n');
          process.exit(1);
        }

        if (statusResponse.status === 'expired') {
          process.stdout.write('\r' + ' '.repeat(50) + '\r');
          console.log('\n✗ Authorization request expired. Please try again.\n');
          process.exit(1);
        }

        // Status is pending, continue polling
      } catch (error) {
        if (error.status === 410) {
          process.stdout.write('\r' + ' '.repeat(50) + '\r');
          console.log('\n✗ Authorization request expired. Please try again.\n');
          process.exit(1);
        }
        if (error.status === 403) {
          process.stdout.write('\r' + ' '.repeat(50) + '\r');
          console.log('\n✗ Authorization denied.\n');
          process.exit(1);
        }
        // For other errors, continue polling
      }
    }

    process.stdout.write('\r' + ' '.repeat(50) + '\r');
    console.log('\n✗ Authorization timed out. Please try again.\n');
    process.exit(1);

  } catch (error) {
    console.error(`\nAuthentication failed: ${error.message}\n`);
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exit(1);
  }
}

module.exports = authCommand;
