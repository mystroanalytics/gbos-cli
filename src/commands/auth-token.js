/**
 * auth-token command
 * Programmatic authentication for thin clients.
 * Accepts an access token directly (obtained from UI-based login),
 * validates it against the GBOS API, saves the session,
 * and optionally auto-connects to a specific node.
 *
 * Usage:
 *   gbos auth-token --token <access_token>
 *   gbos auth-token --token <access_token> --node-id <id>
 *   gbos auth-token --token <access_token> --node-id <id> --dir /path/to/project
 */

const api = require('../lib/api');
const config = require('../lib/config');
const { registerMCPServer } = require('../lib/skills');
const { setupProjectSkills } = require('../lib/skills');

async function authTokenCommand(options) {
  const token = options.token;

  if (!token) {
    const result = { success: false, error: 'Missing --token flag. Provide an access token.' };
    if (options.json) {
      process.stdout.write(JSON.stringify(result) + '\n');
    } else {
      console.error('\nError: --token is required.\n');
      console.error('Usage: gbos auth-token --token <access_token> [--node-id <id>] [--dir <path>]\n');
    }
    process.exit(1);
  }

  try {
    // Step 1: Temporarily save the token so the API client can use it
    config.saveSession({ access_token: token });

    // Step 2: Validate the token by calling the session endpoint
    let sessionInfo;
    try {
      sessionInfo = await api.getSession();
    } catch (err) {
      // Token is invalid — clear and fail
      config.clearSession();
      const result = { success: false, error: 'Invalid or expired token', details: err.message };
      if (options.json) {
        process.stdout.write(JSON.stringify(result) + '\n');
      } else {
        console.error('\nError: Token validation failed —', err.message, '\n');
      }
      process.exit(1);
    }

    const userData = sessionInfo.data || sessionInfo;
    const user = userData.user || userData;
    const account = userData.account || {};

    // Step 3: Build and save the full session
    const userId = user.id || user.user_id;
    const userName = user.first_name && user.last_name
      ? `${user.first_name} ${user.last_name}`
      : user.name || user.user_name || `User ${userId}`;
    const accountId = account.id || user.account_id;
    const accountName = account.name || `Account ${accountId}`;

    // Calculate token expiration — default 24 hours
    const expiresInSeconds = userData.expires_in && userData.expires_in > 60
      ? userData.expires_in : 86400;
    const tokenExpiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    const session = {
      access_token: token,
      refresh_token: userData.refresh_token || null,
      token_expires_at: tokenExpiresAt,
      user_id: userId,
      user_name: userName,
      user_first_name: user.first_name || null,
      user_last_name: user.last_name || null,
      user_email: user.email || null,
      account_id: accountId,
      account_name: accountName,
      session_id: userData.session_id || null,
      authenticated_at: new Date().toISOString(),
      auth_method: 'token',
    };

    config.saveSession(session);

    // Register MCP server
    try {
      registerMCPServer();
    } catch (e) {
      // Non-fatal
    }

    // Step 4: Optionally auto-connect to a node
    let connectionResult = null;

    if (options.nodeId) {
      try {
        const workingDirectory = options.dir || process.cwd();

        // Get git info
        let gitRepoUrl = null;
        let gitBranch = null;
        try {
          const { execSync } = require('child_process');
          gitRepoUrl = execSync('git config --get remote.origin.url', { encoding: 'utf8' }).trim();
          gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
        } catch (e) {
          // Not a git repo — fine
        }

        const agentCli = options.agent || 'claude-code';

        const connectResponse = await api.connectToNode(options.nodeId, {
          working_directory: workingDirectory,
          git_repo_url: gitRepoUrl,
          git_branch: gitBranch,
          agent_cli: agentCli,
        });

        const { connection_id, node } = connectResponse.data;
        const applicationName = node.application?.name || 'N/A';

        // Save connection to session
        config.saveConnection({
          connection_id,
          node: {
            id: node.id,
            uuid: node.uuid,
            name: node.name,
            node_type: node.node_type,
            system_prompt: node.system_prompt,
            application_id: node.application_id,
          },
          application: {
            id: node.application?.id || node.application_id,
            name: applicationName,
          },
          connected_at: new Date().toISOString(),
          working_directory: workingDirectory,
          git_repo_url: gitRepoUrl,
          git_branch: gitBranch,
        });

        // Setup project skills
        try {
          setupProjectSkills(workingDirectory);
        } catch (e) {
          // Non-fatal
        }

        connectionResult = {
          connection_id,
          node_id: node.id,
          node_name: node.name,
          application_id: node.application?.id || node.application_id,
          application_name: applicationName,
        };
      } catch (err) {
        // Auth succeeded but connect failed
        connectionResult = { error: err.message };
      }
    }

    // Step 5: Output result
    const result = {
      success: true,
      user: {
        id: userId,
        name: userName,
        email: user.email || null,
      },
      account: {
        id: accountId,
        name: accountName,
      },
      authenticated_at: session.authenticated_at,
      token_expires_at: tokenExpiresAt,
    };

    if (connectionResult) {
      result.connection = connectionResult;
    }

    if (options.json) {
      process.stdout.write(JSON.stringify(result) + '\n');
    } else {
      console.log('\n  ✓ Authentication successful!\n');
      console.log(`    User:    ${userName}`);
      console.log(`    Account: ${accountName}`);
      console.log(`    Expires: ${new Date(tokenExpiresAt).toLocaleString()}\n`);

      if (connectionResult && !connectionResult.error) {
        console.log('  ✓ Connected to node!\n');
        console.log(`    Node:        ${connectionResult.node_name}`);
        console.log(`    Application: ${connectionResult.application_name}`);
        console.log(`    Session:     ${connectionResult.connection_id}\n`);
      } else if (connectionResult && connectionResult.error) {
        console.log(`  ✗ Connection failed: ${connectionResult.error}\n`);
      }

      console.log('  You can now run "gbos connect", "gbos tasks", or "gbos auto".\n');
    }
  } catch (error) {
    const result = { success: false, error: error.message };
    if (options.json) {
      process.stdout.write(JSON.stringify(result) + '\n');
    } else {
      console.error(`\nError: ${error.message}\n`);
    }
    process.exit(1);
  }
}

module.exports = authTokenCommand;
