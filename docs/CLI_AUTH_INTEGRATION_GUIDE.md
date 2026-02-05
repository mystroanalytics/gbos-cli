# CLI Authentication & Node Connection Integration Guide

This document provides instructions for the **Frontend Team** and **MCP Server Team** to integrate with the CLI authentication and node connection system.

## Overview

The CLI authentication system allows developers to:
1. Authenticate their local CLI tools with GBOS using a device authorization flow (similar to Claude Code)
2. Connect their CLI session to a specific development node
3. Fetch and work on tasks assigned to that node
4. Report task progress and completion

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   GBOS CLI      │     │   GBOS API      │     │  GBOS Web UI    │
│   (Terminal)    │     │   (Backend)     │     │  (Frontend)     │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │  1. POST /cli/auth/init                       │
         │──────────────────────>│                       │
         │  {device_code, verification_url}              │
         │<──────────────────────│                       │
         │                       │                       │
         │  2. User visits URL   │                       │
         │  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─>│
         │                       │                       │
         │                       │  3. POST /cli/auth/approve
         │                       │<──────────────────────│
         │                       │                       │
         │  4. Poll GET /cli/auth/status/:code           │
         │──────────────────────>│                       │
         │  {access_token, refresh_token}                │
         │<──────────────────────│                       │
         │                       │                       │
         │  5. GET /cli/nodes    │                       │
         │──────────────────────>│                       │
         │  [list of nodes]      │                       │
         │<──────────────────────│                       │
         │                       │                       │
         │  6. POST /cli/connect/:nodeId                 │
         │──────────────────────>│                       │
         │  {connection_id, node details}                │
         │<──────────────────────│                       │
         │                       │                       │
         │  7. GET /cli/tasks/next                       │
         │──────────────────────>│                       │
         │  {task details, system_prompt}                │
         │<──────────────────────│                       │
```

---

## API Endpoints Reference

Base URL: `https://api.gbos.io/api/v1`

### Authentication Endpoints

#### 1. Initialize Device Authorization
```
POST /cli/auth/init
```

**Request Body:**
```json
{
  "client_name": "gbos-cli",
  "client_version": "1.0.0",
  "machine_id": "unique-machine-identifier",
  "machine_name": "MacBook-Pro",
  "os_type": "darwin"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "device_code": "GBOS-A1B2-C3D4",
    "verification_code": "abc123...long-hex-string...",
    "verification_url": "https://gbos-io-application-builder-579767694933.us-south1.run.app/cli/authorize",
    "verification_url_complete": "https://gbos-io-application-builder-579767694933.us-south1.run.app/cli/authorize?code=GBOS-A1B2-C3D4",
    "expires_in": 900,
    "interval": 5,
    "message": "Please visit the URL and enter code: GBOS-A1B2-C3D4"
  }
}
```

#### 2. Check Authorization Status (Poll)
```
GET /cli/auth/status/:verification_code
```

**Response (202 - Pending):**
```json
{
  "success": true,
  "status": "pending",
  "message": "Authorization pending. Please complete authorization in the browser."
}
```

**Response (200 - Approved):**
```json
{
  "success": true,
  "status": "approved",
  "data": {
    "access_token": "gbos_xxxxxxxxxxxxxxxx",
    "refresh_token": "gbos_refresh_xxxxxxxx",
    "token_type": "Bearer",
    "expires_in": 2592000,
    "user_id": 1,
    "account_id": 1,
    "session_id": "uuid-string"
  }
}
```

**Response (403 - Denied):**
```json
{
  "success": false,
  "status": "denied",
  "error": "Authorization denied by user",
  "code": "DENIED"
}
```

**Response (410 - Expired):**
```json
{
  "success": false,
  "status": "expired",
  "error": "Authorization request expired",
  "code": "EXPIRED"
}
```

#### 3. Approve Authorization (Frontend)
```
POST /cli/auth/approve
```

**Request Body:**
```json
{
  "device_code": "GBOS-A1B2-C3D4",
  "user_id": 1,
  "account_id": 1
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Authorization approved. You can close this window and return to the terminal.",
  "data": {
    "session_id": "uuid-string",
    "machine_name": "MacBook-Pro",
    "client_name": "gbos-cli"
  }
}
```

#### 4. Deny Authorization (Frontend)
```
POST /cli/auth/deny
```

**Request Body:**
```json
{
  "device_code": "GBOS-A1B2-C3D4"
}
```

#### 5. Refresh Token
```
POST /cli/auth/refresh
```

**Request Body:**
```json
{
  "refresh_token": "gbos_refresh_xxxxxxxx"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "access_token": "gbos_new_token_xxxxx",
    "refresh_token": "gbos_refresh_new_xxxxx",
    "token_type": "Bearer",
    "expires_in": 2592000
  }
}
```

#### 6. Logout
```
POST /cli/auth/logout
Authorization: Bearer gbos_xxxxx
```

#### 7. Get Session Info
```
GET /cli/auth/session
Authorization: Bearer gbos_xxxxx
```

**Response:**
```json
{
  "success": true,
  "data": {
    "session_id": "uuid-string",
    "user": {
      "id": 1,
      "uuid": "user-uuid",
      "email": "user@example.com",
      "first_name": "John",
      "last_name": "Doe"
    },
    "account": {
      "id": 1,
      "uuid": "account-uuid",
      "name": "My Company",
      "slug": "my-company"
    },
    "machine_name": "MacBook-Pro",
    "client_name": "gbos-cli",
    "authenticated_at": "2025-01-15T10:00:00Z",
    "expires_at": "2025-02-14T10:00:00Z"
  }
}
```

---

### Node Connection Endpoints

#### 8. List Available Nodes
```
GET /cli/nodes
Authorization: Bearer gbos_xxxxx
```

**Query Parameters:**
- `application_id` (optional): Filter by application
- `status` (optional): Filter by node status (idle, busy, offline)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "uuid": "node-uuid",
      "name": "Backend Development Node",
      "node_type": "development",
      "status": "idle",
      "system_prompt": "You are a backend developer working on...",
      "application_id": 1,
      "is_connected": false,
      "active_connection": null
    },
    {
      "id": 2,
      "uuid": "node-uuid-2",
      "name": "Frontend Development Node",
      "node_type": "development",
      "status": "busy",
      "is_connected": true,
      "active_connection": {
        "uuid": "connection-uuid",
        "user_id": 2,
        "connected_at": "2025-01-15T09:00:00Z"
      }
    }
  ]
}
```

#### 9. Connect to Node
```
POST /cli/connect/:nodeId
Authorization: Bearer gbos_xxxxx
```

**Request Body:**
```json
{
  "working_directory": "/Users/dev/projects/my-app",
  "git_repo_url": "https://github.com/org/my-app",
  "git_branch": "main",
  "agent_cli": "claude-code",
  "agent_model": "claude-opus-4-5-20251101"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Connected to node: Backend Development Node",
  "data": {
    "connection_id": "connection-uuid",
    "node": {
      "id": 1,
      "uuid": "node-uuid",
      "name": "Backend Development Node",
      "node_type": "development",
      "system_prompt": "You are a backend developer working on..."
    }
  }
}
```

**Error (409 - Node Busy):**
```json
{
  "success": false,
  "error": "Node is already connected to another CLI session",
  "code": "NODE_BUSY",
  "connected_by": 2
}
```

#### 10. Disconnect
```
POST /cli/disconnect
Authorization: Bearer gbos_xxxxx
```

**Response:**
```json
{
  "success": true,
  "message": "Disconnected successfully",
  "data": {
    "tasks_completed": 5,
    "tasks_failed": 1,
    "total_time_minutes": 120
  }
}
```

#### 11. Send Heartbeat
```
POST /cli/heartbeat
Authorization: Bearer gbos_xxxxx
```

**Request Body:**
```json
{
  "current_task_id": 123,
  "progress": { "percent": 50, "message": "Implementing feature..." }
}
```

#### 12. Get Connection Status
```
GET /cli/connection
Authorization: Bearer gbos_xxxxx
```

**Response:**
```json
{
  "success": true,
  "data": {
    "connection_id": "connection-uuid",
    "status": "active",
    "connected_at": "2025-01-15T09:00:00Z",
    "node": {
      "id": 1,
      "uuid": "node-uuid",
      "name": "Backend Development Node",
      "node_type": "development",
      "system_prompt": "You are a backend developer..."
    },
    "current_task": {
      "id": 123,
      "uuid": "task-uuid",
      "title": "Implement user authentication",
      "status": "in_progress"
    },
    "stats": {
      "tasks_completed": 5,
      "tasks_failed": 1,
      "total_time_minutes": 120
    }
  }
}
```

---

### Task Endpoints

#### 13. Get Next Task
```
GET /cli/tasks/next
Authorization: Bearer gbos_xxxxx
```

**Response (200 - Task Found):**
```json
{
  "success": true,
  "data": {
    "task": {
      "id": 123,
      "uuid": "task-uuid",
      "task_key": "TASK-001",
      "title": "Implement user authentication",
      "description": "Create login and registration endpoints...",
      "task_type": "feature",
      "layer": "backend",
      "complexity": "medium",
      "priority": 1,
      "status": "assigned",
      "estimated_minutes": 120,
      "target_files": ["src/auth/controller.js", "src/auth/routes.js"],
      "acceptance_criteria": ["Users can register", "Users can login"],
      "agent_prompt": "Implement the authentication system using JWT...",
      "agent_context": { "related_files": ["src/config/auth.js"] },
      "dependencies": [122],
      "plan": {
        "id": 1,
        "uuid": "plan-uuid",
        "name": "Sprint 1"
      }
    },
    "node": {
      "id": 1,
      "name": "Backend Development Node",
      "system_prompt": "You are a backend developer working on..."
    }
  }
}
```

**Response (200 - No Task):**
```json
{
  "success": true,
  "data": null,
  "message": "No tasks available"
}
```

#### 14. Start Task
```
POST /cli/tasks/:taskId/start
Authorization: Bearer gbos_xxxxx
```

**Response:**
```json
{
  "success": true,
  "message": "Task started",
  "data": {
    "task_id": 123,
    "task_key": "TASK-001"
  }
}
```

#### 15. Complete Task
```
POST /cli/tasks/:taskId/complete
Authorization: Bearer gbos_xxxxx
```

**Request Body:**
```json
{
  "notes": "Implemented login and registration with JWT",
  "files_modified": ["src/auth/controller.js", "src/auth/routes.js", "src/models/User.js"],
  "commit_sha": "abc123def456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Task completed",
  "data": {
    "task_id": 123,
    "task_key": "TASK-001",
    "duration_seconds": 3600
  }
}
```

#### 16. Fail Task
```
POST /cli/tasks/:taskId/fail
Authorization: Bearer gbos_xxxxx
```

**Request Body:**
```json
{
  "error_message": "Could not connect to database",
  "blocker_type": "technical",
  "blocker_description": "Database connection timeout"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Task marked as failed",
  "data": {
    "task_id": 123,
    "retry_count": 1,
    "can_retry": true
  }
}
```

---

### Activity Logging

#### 17. Log Activity
```
POST /cli/activity
Authorization: Bearer gbos_xxxxx
```

**Request Body:**
```json
{
  "activity_type": "file_modified",
  "title": "Modified auth controller",
  "description": "Added password hashing",
  "task_id": 123,
  "resource_type": "file",
  "resource_path": "src/auth/controller.js",
  "data": { "lines_changed": 45 }
}
```

**Activity Types:**
- `connected`, `disconnected`, `heartbeat`
- `task_fetched`, `task_started`, `task_progress`, `task_completed`, `task_failed`, `task_skipped`
- `file_created`, `file_modified`, `file_deleted`
- `commit_created`, `branch_created`, `pr_created`
- `blocker_reported`, `question_asked`
- `agent_started`, `agent_stopped`
- `error`, `warning`, `info`

---

## Frontend Implementation Guide

### 1. CLI Authorization Page

Create a page at `/cli/authorize` that:

1. **Displays pending authorization requests** for the logged-in user
2. **Shows device details** (machine name, OS, client)
3. **Allows approve/deny** actions

**UI Components Needed:**

```jsx
// Example React component structure
function CliAuthorizePage() {
  const [deviceCode, setDeviceCode] = useState(null);
  const [authDetails, setAuthDetails] = useState(null);

  // Get device_code from URL query param
  useEffect(() => {
    const code = new URLSearchParams(location.search).get('code');
    setDeviceCode(code);
    if (code) {
      // Fetch pending auth details
      fetchAuthDetails(code);
    }
  }, []);

  async function handleApprove() {
    await fetch('/api/v1/cli/auth/approve', {
      method: 'POST',
      body: JSON.stringify({
        device_code: deviceCode,
        user_id: currentUser.id,
        account_id: currentAccount.id
      })
    });
    // Show success message
  }

  async function handleDeny() {
    await fetch('/api/v1/cli/auth/deny', {
      method: 'POST',
      body: JSON.stringify({ device_code: deviceCode })
    });
    // Show denied message
  }

  return (
    <Card>
      <h1>CLI Authorization Request</h1>
      <p>A CLI client is requesting access to your GBOS account.</p>

      <InfoBox>
        <p><strong>Device Code:</strong> {deviceCode}</p>
        <p><strong>Machine:</strong> {authDetails?.machine_name}</p>
        <p><strong>OS:</strong> {authDetails?.os_type}</p>
        <p><strong>Client:</strong> {authDetails?.client_name}</p>
      </InfoBox>

      <ButtonGroup>
        <Button variant="primary" onClick={handleApprove}>
          Approve
        </Button>
        <Button variant="danger" onClick={handleDeny}>
          Deny
        </Button>
      </ButtonGroup>
    </Card>
  );
}
```

### 2. Active CLI Sessions Management

Create a settings page to show active CLI sessions:

```jsx
function CliSessionsPage() {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    // Fetch active sessions for user
    // GET /cli/auth/sessions (needs to be added to API)
  }, []);

  return (
    <Table>
      <thead>
        <tr>
          <th>Machine</th>
          <th>Client</th>
          <th>Connected Node</th>
          <th>Last Active</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {sessions.map(session => (
          <tr key={session.id}>
            <td>{session.machine_name}</td>
            <td>{session.client_name}</td>
            <td>{session.connected_node?.name || '-'}</td>
            <td>{formatRelativeTime(session.last_used_at)}</td>
            <td>
              <Button onClick={() => revokeSession(session.id)}>
                Revoke
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
```

### 3. Node Connection Status Indicator

Show which nodes have active CLI connections:

```jsx
function NodeCard({ node }) {
  return (
    <Card>
      <h3>{node.name}</h3>
      <Badge color={node.status === 'busy' ? 'yellow' : 'green'}>
        {node.status}
      </Badge>

      {node.is_connected && (
        <ConnectionInfo>
          <Icon name="terminal" />
          <span>CLI Connected</span>
          <small>by {node.active_connection.user_name}</small>
        </ConnectionInfo>
      )}
    </Card>
  );
}
```

---

## MCP Server Implementation Guide

### Overview

The MCP server should expose tools that allow coding agents (Claude Code, Codex, etc.) to interact with GBOS tasks.

### Required Tools

#### 1. `gbos_get_next_task`

Fetch the next task assigned to the connected node.

```typescript
{
  name: "gbos_get_next_task",
  description: "Get the next development task assigned to this node",
  inputSchema: {
    type: "object",
    properties: {},
    required: []
  }
}
```

**Implementation:**
```typescript
async function gbos_get_next_task(): Promise<Task | null> {
  const response = await fetch(`${GBOS_API}/cli/tasks/next`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const data = await response.json();
  return data.data;
}
```

#### 2. `gbos_start_task`

Mark a task as started.

```typescript
{
  name: "gbos_start_task",
  description: "Mark a task as started (in progress)",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string", description: "Task ID or UUID" }
    },
    required: ["task_id"]
  }
}
```

#### 3. `gbos_complete_task`

Mark a task as completed with results.

```typescript
{
  name: "gbos_complete_task",
  description: "Mark a task as completed",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      notes: { type: "string", description: "Summary of what was done" },
      files_modified: {
        type: "array",
        items: { type: "string" },
        description: "List of files that were modified"
      },
      commit_sha: { type: "string", description: "Git commit SHA if applicable" }
    },
    required: ["task_id"]
  }
}
```

#### 4. `gbos_fail_task`

Mark a task as failed with error details.

```typescript
{
  name: "gbos_fail_task",
  description: "Mark a task as failed",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      error_message: { type: "string" },
      blocker_type: {
        type: "string",
        enum: ["technical", "dependency", "clarification", "resource"]
      },
      blocker_description: { type: "string" }
    },
    required: ["task_id", "error_message"]
  }
}
```

#### 5. `gbos_log_activity`

Log an activity (file change, commit, etc.).

```typescript
{
  name: "gbos_log_activity",
  description: "Log an activity to GBOS",
  inputSchema: {
    type: "object",
    properties: {
      activity_type: {
        type: "string",
        enum: ["file_created", "file_modified", "file_deleted",
               "commit_created", "branch_created", "pr_created",
               "blocker_reported", "question_asked", "info"]
      },
      title: { type: "string" },
      description: { type: "string" },
      task_id: { type: "string" },
      resource_path: { type: "string" }
    },
    required: ["activity_type", "title"]
  }
}
```

#### 6. `gbos_get_connection_status`

Get current connection and task status.

```typescript
{
  name: "gbos_get_connection_status",
  description: "Get current CLI connection status and active task",
  inputSchema: {
    type: "object",
    properties: {},
    required: []
  }
}
```

#### 7. `gbos_get_node_system_prompt`

Get the system prompt configured for the connected node.

```typescript
{
  name: "gbos_get_node_system_prompt",
  description: "Get the system prompt/instructions for this development node",
  inputSchema: {
    type: "object",
    properties: {},
    required: []
  }
}
```

### MCP Server Configuration

The MCP server should be configured with:

```json
{
  "gbos_api_url": "https://api.gbos.io/api/v1",
  "access_token": "gbos_xxxxx",
  "refresh_token": "gbos_refresh_xxxxx"
}
```

### Token Refresh Flow

Implement automatic token refresh when receiving 401 responses:

```typescript
async function refreshTokenIfNeeded(): Promise<void> {
  if (isTokenExpired()) {
    const response = await fetch(`${GBOS_API}/cli/auth/refresh`, {
      method: 'POST',
      body: JSON.stringify({ refresh_token: config.refresh_token })
    });
    const data = await response.json();
    config.access_token = data.data.access_token;
    config.refresh_token = data.data.refresh_token;
    await saveConfig(config);
  }
}
```

---

## Database Schema

### cli_auth_sessions

| Column | Type | Description |
|--------|------|-------------|
| id | BIGINT UNSIGNED | Primary key |
| uuid | CHAR(36) | Public identifier |
| device_code | VARCHAR(20) | User-friendly code (GBOS-XXXX-XXXX) |
| verification_code | VARCHAR(64) | Internal polling code |
| user_id | BIGINT UNSIGNED | Approved user (nullable until approved) |
| account_id | BIGINT UNSIGNED | Account context |
| client_name | VARCHAR(100) | CLI client name |
| machine_name | VARCHAR(255) | Machine hostname |
| status | ENUM | pending, approved, denied, expired, used |
| access_token | VARCHAR(255) | API access token |
| refresh_token | VARCHAR(255) | Refresh token |
| token_expires_at | DATETIME | Token expiration |
| expires_at | DATETIME | Device code expiration |

### cli_connections

| Column | Type | Description |
|--------|------|-------------|
| id | BIGINT UNSIGNED | Primary key |
| uuid | CHAR(36) | Public identifier |
| auth_session_id | BIGINT UNSIGNED | Link to auth session |
| node_id | BIGINT UNSIGNED | Connected development node |
| user_id | BIGINT UNSIGNED | User who connected |
| account_id | BIGINT UNSIGNED | Account context |
| status | ENUM | active, disconnected, expired, terminated |
| current_task_id | BIGINT UNSIGNED | Currently active task |
| agent_cli | VARCHAR(50) | CLI tool (claude-code, codex, etc.) |
| tasks_completed | INT | Session statistics |
| last_heartbeat | DATETIME | Last heartbeat timestamp |

### cli_activity_logs

| Column | Type | Description |
|--------|------|-------------|
| id | BIGINT UNSIGNED | Primary key |
| uuid | CHAR(36) | Public identifier |
| connection_id | BIGINT UNSIGNED | Link to connection |
| node_id | BIGINT UNSIGNED | Node reference |
| user_id | BIGINT UNSIGNED | User reference |
| task_id | BIGINT UNSIGNED | Related task (nullable) |
| activity_type | ENUM | Type of activity |
| title | VARCHAR(255) | Short description |
| description | TEXT | Detailed description |
| resource_path | VARCHAR(500) | File/resource path |
| data | JSON | Additional data |
| duration_seconds | INT | Activity duration |
| logged_at | DATETIME | Timestamp |

---

## Security Considerations

1. **Token Storage**: CLI clients should store tokens securely (e.g., in OS keychain)
2. **Token Expiration**: Access tokens expire after 30 days; use refresh tokens
3. **Session Revocation**: Users can revoke sessions from the web UI
4. **Rate Limiting**: Polling endpoint has rate limits; respect the `interval` value
5. **HTTPS Only**: All API calls must use HTTPS

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| MISSING_AUTH_HEADER | 401 | Authorization header not provided |
| INVALID_TOKEN_FORMAT | 401 | Token doesn't start with "gbos_" |
| INVALID_TOKEN | 401 | Token not found or invalid |
| TOKEN_EXPIRED | 401 | Access token has expired |
| SESSION_INVALID | 401 | Session is no longer valid |
| INVALID_CODE | 404 | Device/verification code not found |
| EXPIRED | 410 | Authorization request expired |
| DENIED | 403 | User denied the authorization |
| NODE_BUSY | 409 | Node already has an active connection |
