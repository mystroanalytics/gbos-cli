/**
 * Agent Adapters Index
 * Factory for creating agent adapters
 */

const ClaudeAdapter = require('./claude-adapter');
const CodexAdapter = require('./codex-adapter');
const GeminiAdapter = require('./gemini-adapter');

const ADAPTERS = {
  'claude-code': ClaudeAdapter,
  'claude': ClaudeAdapter,
  'codex': CodexAdapter,
  'openai': CodexAdapter,
  'gemini': GeminiAdapter,
  'google': GeminiAdapter,
};

/**
 * Get an adapter by name
 * @param {string} name - Adapter name
 * @param {Object} config - Adapter configuration
 * @returns {BaseAdapter}
 */
function getAdapter(name, config = {}) {
  const AdapterClass = ADAPTERS[name.toLowerCase()];
  if (!AdapterClass) {
    throw new Error(`Unknown agent adapter: ${name}. Available: ${Object.keys(ADAPTERS).join(', ')}`);
  }
  return new AdapterClass(config);
}

/**
 * Get all available adapters
 * @returns {string[]}
 */
function getAvailableAdapters() {
  return Object.keys(ADAPTERS);
}

/**
 * Check which adapters are installed
 * @returns {Promise<Object>}
 */
async function checkInstalledAdapters() {
  const results = {};
  const checked = new Set();

  for (const [name, AdapterClass] of Object.entries(ADAPTERS)) {
    if (checked.has(AdapterClass)) continue;
    checked.add(AdapterClass);

    const adapter = new AdapterClass();
    results[adapter.name] = {
      available: await adapter.isAvailable(),
      version: await adapter.getVersion(),
    };
  }

  return results;
}

module.exports = {
  getAdapter,
  getAvailableAdapters,
  checkInstalledAdapters,
  ClaudeAdapter,
  CodexAdapter,
  GeminiAdapter,
};
