const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.gbos');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const SESSION_FILE = path.join(CONFIG_DIR, 'session.json');

// Ensure config directory exists
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

// Get machine info for device auth
function getMachineInfo() {
  return {
    machine_id: getMachineId(),
    machine_name: os.hostname(),
    os_type: os.platform(),
    os_version: os.release(),
  };
}

// Generate a persistent machine ID
function getMachineId() {
  ensureConfigDir();
  const machineIdFile = path.join(CONFIG_DIR, '.machine_id');

  if (fs.existsSync(machineIdFile)) {
    return fs.readFileSync(machineIdFile, 'utf8').trim();
  }

  const machineId = `${os.hostname()}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(machineIdFile, machineId, { mode: 0o600 });
  return machineId;
}

// Save session data
function saveSession(data) {
  ensureConfigDir();
  const session = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), { mode: 0o600 });
  return session;
}

// Load session data
function loadSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      return data;
    }
  } catch (err) {
    // Ignore parse errors
  }
  return null;
}

// Clear session data
function clearSession() {
  if (fs.existsSync(SESSION_FILE)) {
    fs.unlinkSync(SESSION_FILE);
  }
}

// Check if authenticated
function isAuthenticated() {
  const session = loadSession();
  if (!session || !session.access_token) {
    return false;
  }

  // Check if token is expired
  if (session.token_expires_at) {
    const expiresAt = new Date(session.token_expires_at);
    if (expiresAt < new Date()) {
      return false;
    }
  }

  return true;
}

// Get access token
function getAccessToken() {
  const session = loadSession();
  return session?.access_token || null;
}

// Get current connection info
function getConnection() {
  const session = loadSession();
  return session?.connection || null;
}

// Save connection info
function saveConnection(connection) {
  const session = loadSession() || {};
  session.connection = connection;
  saveSession(session);
}

// Clear connection info
function clearConnection() {
  const session = loadSession();
  if (session) {
    delete session.connection;
    saveSession(session);
  }
}

// Export session as environment variables format
function getSessionEnv() {
  const session = loadSession();
  if (!session) return {};

  return {
    GBOS_ACCESS_TOKEN: session.access_token,
    GBOS_ACCOUNT_ID: session.account_id,
    GBOS_USER_ID: session.user_id,
    GBOS_SESSION_ID: session.session_id,
    GBOS_NODE_ID: session.connection?.node?.id,
    GBOS_NODE_UUID: session.connection?.node?.uuid,
    GBOS_CONNECTION_ID: session.connection?.connection_id,
    GBOS_APPLICATION_ID: session.connection?.node?.application_id,
  };
}

// Get config directory path (for other tools to access)
function getConfigDir() {
  return CONFIG_DIR;
}

module.exports = {
  CONFIG_DIR,
  CONFIG_FILE,
  SESSION_FILE,
  ensureConfigDir,
  getMachineInfo,
  getMachineId,
  saveSession,
  loadSession,
  clearSession,
  isAuthenticated,
  getAccessToken,
  getConnection,
  saveConnection,
  clearConnection,
  getSessionEnv,
  getConfigDir,
};
