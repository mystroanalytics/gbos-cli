# GitLab CLI Integration

GBOS CLI includes GitLab integration for repository management, auto-sync, and container registry operations.

## Configuration

GitLab commands use tokens from:
1. Session (`~/.gbos/session.json`) - Set during `gbos auth` if GitLab is configured
2. Environment variable `GITLAB_TOKEN`
3. Environment variable `GITLAB_URL` (defaults to `https://gitlab.com`)

## Commands

### Auto-Sync Commands

Auto-sync automatically commits and pushes changes to GitLab at regular intervals.

#### `gbos gitlab sync start [options]`

Start auto-syncing a repository.

```bash
# Start syncing current directory
gbos gitlab sync start

# Start syncing a specific path with custom interval
gbos gitlab sync start --path /path/to/repo --interval 120
```

**Options:**
- `-p, --path <path>` - Path to repository (defaults to current directory)
- `-i, --interval <seconds>` - Sync interval in seconds (default: 60)

**Behavior:**
- Runs `git fetch`, `git add -A`, `git commit`, and `git push` in a loop
- Commits are tagged with timestamp: "Auto-sync: YYYY-MM-DD HH:MM:SS"
- Process runs in background and survives terminal close

---

#### `gbos gitlab sync stop [options]`

Stop auto-syncing a repository.

```bash
# Stop syncing current directory
gbos gitlab sync stop

# Stop syncing a specific path
gbos gitlab sync stop --path /path/to/repo

# Stop all active syncs
gbos gitlab sync stop --all
```

**Options:**
- `-p, --path <path>` - Path to repository (defaults to current directory)
- `-a, --all` - Stop all active syncs

---

#### `gbos gitlab sync status`

Show status of all active syncs.

```bash
gbos gitlab sync status
```

**Output includes:**
- Path to repository
- Remote URL
- Sync interval
- Process ID (PID)
- Start time
- Running status (checks if process is still alive)

---

#### `gbos gitlab sync now [options]`

Force an immediate sync (useful for manual sync without auto-sync running).

```bash
# Sync current directory now
gbos gitlab sync now

# Sync a specific path
gbos gitlab sync now --path /path/to/repo
```

**Options:**
- `-p, --path <path>` - Path to repository (defaults to current directory)

**Behavior:**
1. Fetches from origin
2. Stages all changes
3. Commits with timestamp
4. Pushes to origin
5. Pulls remote changes with rebase

---

### Repository Commands

Manage GitLab repositories directly from the command line.

#### `gbos gitlab repo create <name> [options]`

Create a new GitLab repository.

```bash
# Create a private repository (default)
gbos gitlab repo create my-project

# Create a public repository with description
gbos gitlab repo create my-project --public --description "My awesome project"

# Create with README
gbos gitlab repo create my-project --readme
```

**Options:**
- `--private` - Create as private repository (default)
- `--public` - Create as public repository
- `-d, --description <description>` - Repository description
- `--readme` - Initialize with README

**Output includes:**
- Repository name and URL
- SSH and HTTPS clone URLs
- Visibility setting

---

#### `gbos gitlab repo list [options]`

List GitLab repositories.

```bash
# List your repositories
gbos gitlab repo list

# List all accessible repositories
gbos gitlab repo list --all
```

**Options:**
- `-a, --all` - Show all accessible repositories (not just owned)

---

#### `gbos gitlab repo clone <name> [options]`

Clone a GitLab repository.

```bash
# Clone using HTTPS (default)
gbos gitlab repo clone my-project

# Clone using SSH
gbos gitlab repo clone group/my-project --ssh

# Clone to a specific directory
gbos gitlab repo clone my-project --dir my-local-folder
```

**Options:**
- `--ssh` - Use SSH URL instead of HTTPS
- `-d, --dir <directory>` - Target directory name

---

### Container Registry Commands

Manage Docker images in GitLab Container Registry.

#### `gbos registry login [options]`

Login to GitLab Container Registry.

```bash
# Login to default registry
gbos registry login

# Login to custom registry
gbos registry login --registry registry.my-gitlab.com
```

**Options:**
- `-r, --registry <url>` - Registry URL (defaults to registry.gitlab.com)

**Requirements:**
- Docker must be installed and running
- GitLab token must be configured

---

#### `gbos registry images <project> [options]`

List container images in a project.

```bash
# List images in a project
gbos registry images mygroup/myproject

# List images with tags
gbos registry images mygroup/myproject --tags
```

**Options:**
- `-t, --tags` - Show tags for each image

**Note:** Use full project path (e.g., `group/project` or `group/subgroup/project`)

---

#### `gbos registry push <image> [options]`

Push an image to GitLab Container Registry.

```bash
# Push with full image path
gbos registry push registry.gitlab.com/mygroup/myproject/myimage:latest

# Push with project option
gbos registry push myimage:latest --project mygroup/myproject

# Push to custom registry
gbos registry push myimage:v1.0 --project mygroup/myproject --registry registry.my-gitlab.com
```

**Options:**
- `-p, --project <project>` - GitLab project path (e.g., group/project)
- `-r, --registry <url>` - Registry URL (defaults to registry.gitlab.com)

**Requirements:**
- Docker must be installed and running
- Must be logged in to registry (`gbos registry login`)
- Image must exist locally

---

#### `gbos registry pull <image> [options]`

Pull an image from GitLab Container Registry.

```bash
# Pull with full image path
gbos registry pull registry.gitlab.com/mygroup/myproject/myimage:latest

# Pull with project option
gbos registry pull myimage:latest --project mygroup/myproject
```

**Options:**
- `-p, --project <project>` - GitLab project path (e.g., group/project)
- `-r, --registry <url>` - Registry URL (defaults to registry.gitlab.com)

---

## Configuration Files

### GitLab Config (`~/.gbos/gitlab.json`)

Stores sync configurations and tracked repositories:

```json
{
  "syncs": {
    "/path/to/repo": {
      "syncId": "1234567890",
      "pid": 12345,
      "pidFile": "~/.gbos/sync/1234567890.pid",
      "remote": "git@gitlab.com:user/repo.git",
      "interval": 60,
      "startedAt": "2024-01-15T10:30:00.000Z"
    }
  },
  "repos": []
}
```

### Sync PID Directory (`~/.gbos/sync/`)

Stores PID files for running sync processes.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GITLAB_TOKEN` | GitLab personal access token |
| `GITLAB_URL` | GitLab instance URL (default: https://gitlab.com) |

---

## Examples

### Complete Workflow: Create, Clone, and Sync

```bash
# 1. Create a new repository
gbos gitlab repo create my-new-project --description "My awesome project"

# 2. Clone it
gbos gitlab repo clone my-new-project

# 3. Navigate to it
cd my-new-project

# 4. Start auto-sync
gbos gitlab sync start

# 5. Work on your code... changes will auto-commit every 60 seconds

# 6. Check sync status
gbos gitlab sync status

# 7. Stop sync when done
gbos gitlab sync stop
```

### Docker Image Workflow

```bash
# 1. Login to registry
gbos registry login

# 2. Build your image
docker build -t myimage:v1.0 .

# 3. Push to GitLab
gbos registry push myimage:v1.0 --project mygroup/myproject

# 4. List images
gbos registry images mygroup/myproject --tags

# 5. Pull on another machine
gbos registry pull myimage:v1.0 --project mygroup/myproject
```

---

## Troubleshooting

### "GitLab token not configured"

Set your GitLab token:
```bash
export GITLAB_TOKEN=your_token_here
```

Or configure during `gbos auth` if your GBOS account is connected to GitLab.

### "Docker is not installed"

Install Docker from https://docs.docker.com/get-docker/

### "Login failed"

1. Ensure your GitLab token has `read_registry` and `write_registry` scopes
2. Check that Docker daemon is running
3. Verify the registry URL is correct

### "Repository not found"

Use the full project path: `group/project` or `group/subgroup/project`

### Sync process stops unexpectedly

1. Check `gbos gitlab sync status` to see if process is still running
2. Check system logs for any errors
3. Restart with `gbos gitlab sync start`
