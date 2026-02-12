const config = require('./config');

// Default API endpoint (new domain)
const DEFAULT_API_URL = 'https://api.gbos.io/api/v1';

// Support GBOS_API_URL env var for backwards compatibility or custom endpoints
const API_BASE_URL = process.env.GBOS_API_URL || DEFAULT_API_URL;

class GbosApiClient {
  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Add auth header if we have a token
    const token = config.getAccessToken();
    if (token && !options.skipAuth) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.error || data.message || 'API request failed');
      error.status = response.status;
      error.code = data.code;
      error.data = data;
      throw error;
    }

    return data;
  }

  // Auth endpoints
  async initAuth(clientInfo) {
    const machineInfo = config.getMachineInfo();
    return this.request('/cli/auth/init', {
      method: 'POST',
      body: {
        client_name: 'gbos-cli',
        client_version: require('../../package.json').version,
        ...machineInfo,
        ...clientInfo,
      },
      skipAuth: true,
    });
  }

  async checkAuthStatus(verificationCode) {
    return this.request(`/cli/auth/status/${verificationCode}`, {
      method: 'GET',
      skipAuth: true,
    });
  }

  async refreshToken(refreshToken) {
    return this.request('/cli/auth/refresh', {
      method: 'POST',
      body: { refresh_token: refreshToken },
      skipAuth: true,
    });
  }

  async logout() {
    return this.request('/cli/auth/logout', {
      method: 'POST',
    });
  }

  async getSession() {
    return this.request('/cli/auth/session', {
      method: 'GET',
    });
  }

  // Application endpoints
  async listApplications() {
    return this.request('/cli/applications', { method: 'GET' });
  }

  async getApplication(applicationId) {
    return this.request(`/cli/applications/${applicationId}`, { method: 'GET' });
  }

  // Node endpoints
  async listNodes(applicationId = null) {
    let endpoint = '/cli/nodes';
    if (applicationId) {
      endpoint += `?application_id=${applicationId}`;
    }
    return this.request(endpoint, { method: 'GET' });
  }

  async connectToNode(nodeId, connectionInfo = {}) {
    return this.request(`/cli/connect/${nodeId}`, {
      method: 'POST',
      body: connectionInfo,
    });
  }

  async disconnect() {
    return this.request('/cli/disconnect', {
      method: 'POST',
    });
  }

  async getConnectionStatus() {
    return this.request('/cli/connection', {
      method: 'GET',
    });
  }

  async sendHeartbeat(taskId = null, progress = null) {
    return this.request('/cli/heartbeat', {
      method: 'POST',
      body: {
        current_task_id: taskId,
        progress,
      },
    });
  }

  // Task endpoints
  async getTasks() {
    return this.request('/cli/tasks', {
      method: 'GET',
    });
  }

  async getNextTask(autoAssign = true) {
    const query = autoAssign ? '?auto_assign=true' : '';
    return this.request(`/cli/tasks/next${query}`, {
      method: 'GET',
    });
  }

  async getTask(taskId) {
    return this.request(`/cli/tasks/${taskId}`, {
      method: 'GET',
    });
  }

  async startTask(taskId) {
    return this.request(`/cli/tasks/${taskId}/start`, {
      method: 'POST',
    });
  }

  async completeTask(taskId, data = {}) {
    return this.request(`/cli/tasks/${taskId}/complete`, {
      method: 'POST',
      body: data,
    });
  }

  async failTask(taskId, data = {}) {
    return this.request(`/cli/tasks/${taskId}/fail`, {
      method: 'POST',
      body: data,
    });
  }

  async cancelTask(taskId, data = {}) {
    return this.request(`/cli/tasks/${taskId}/cancel`, {
      method: 'POST',
      body: data,
    });
  }

  async getCurrentTask() {
    return this.request('/cli/tasks/current', {
      method: 'GET',
    });
  }

  async createTask(taskData) {
    return this.request('/cli/tasks', {
      method: 'POST',
      body: taskData,
    });
  }

  // Agent config - fetch API keys from application settings
  async getAgentConfig(applicationId) {
    const app = await this.getApplication(applicationId);
    const appData = app.data || app;
    return appData?.settings?.agent_keys || {};
  }

  // Activity logging
  async logActivity(activity) {
    return this.request('/cli/activity', {
      method: 'POST',
      body: activity,
    });
  }
}

module.exports = new GbosApiClient();
