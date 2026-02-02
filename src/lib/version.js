const https = require('https');
const packageJson = require('../../package.json');

const CURRENT_VERSION = packageJson.version;

// Fetch latest version from npm registry
async function getLatestVersion() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'registry.npmjs.org',
      path: '/gbos/latest',
      method: 'GET',
      timeout: 3000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.version || null);
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });

    req.end();
  });
}

// Compare semantic versions
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const a = parts1[i] || 0;
    const b = parts2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

// Check if update is available and warn user
async function checkForUpdates() {
  try {
    const latestVersion = await getLatestVersion();

    if (!latestVersion) return;

    if (compareVersions(latestVersion, CURRENT_VERSION) > 0) {
      console.log('\n┌─────────────────────────────────────────────────────────────┐');
      console.log('│  ⚠️  Update available!                                       │');
      console.log(`│  Current: ${CURRENT_VERSION.padEnd(12)} Latest: ${latestVersion.padEnd(23)}│`);
      console.log('│                                                             │');
      console.log('│  Run: npm install -g gbos@latest                            │');
      console.log('└─────────────────────────────────────────────────────────────┘\n');
    }
  } catch (e) {
    // Silently ignore version check errors
  }
}

module.exports = {
  CURRENT_VERSION,
  getLatestVersion,
  compareVersions,
  checkForUpdates,
};
