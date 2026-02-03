const config = require('../lib/config');
const { displayMessageBox, fg, LOGO_PURPLE, LOGO_LIGHT, RESET, BOLD, DIM, getTerminalWidth } = require('../lib/display');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Colors
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

// Get GitLab URL from session or config
function getGitLabUrl() {
  const session = config.loadSession();
  return session?.gitlab_url || process.env.GITLAB_URL || 'https://gitlab.com';
}

// Get GitLab token
function getGitLabToken() {
  const session = config.loadSession();
  return session?.gitlab_token || process.env.GITLAB_TOKEN || null;
}

// Get registry URL from GitLab URL
function getRegistryUrl() {
  const gitlabUrl = getGitLabUrl();
  try {
    const url = new URL(gitlabUrl);
    return `registry.${url.hostname}`;
  } catch (e) {
    return 'registry.gitlab.com';
  }
}

// Execute shell command
function execCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    exec(command, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      }
    });
  });
}

// ==================== REGISTRY COMMANDS ====================

// Login to GitLab Container Registry
async function registryLoginCommand(options) {
  const token = getGitLabToken();
  const registryUrl = options.registry || getRegistryUrl();

  if (!token) {
    displayMessageBox('Not Configured', 'GitLab token not configured. Set GITLAB_TOKEN environment variable or run "gbos auth" first.', 'error');
    process.exit(1);
  }

  console.log(`\n${DIM}Logging into GitLab Container Registry...${RESET}\n`);
  console.log(`  ${DIM}Registry:${RESET} ${registryUrl}`);

  try {
    // Use docker login with token
    const loginProcess = spawn('docker', ['login', registryUrl, '-u', 'oauth2', '--password-stdin'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    loginProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    loginProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Write token to stdin
    loginProcess.stdin.write(token);
    loginProcess.stdin.end();

    await new Promise((resolve, reject) => {
      loginProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(stderr || `Docker login failed with code ${code}`));
        }
      });
    });

    console.log(`\n${GREEN}✓${RESET} ${BOLD}Login successful${RESET}`);
    console.log(`  ${DIM}You can now push and pull images from ${registryUrl}${RESET}\n`);

  } catch (error) {
    // Check if docker is installed
    try {
      await execCommand('docker --version');
    } catch (e) {
      displayMessageBox('Docker Not Found', 'Docker is not installed or not in PATH. Please install Docker first.', 'error');
      process.exit(1);
    }

    displayMessageBox('Login Failed', error.message, 'error');
    process.exit(1);
  }
}

// List container images in a project
async function registryImagesCommand(project, options) {
  const token = getGitLabToken();
  const gitlabUrl = getGitLabUrl();

  if (!token) {
    displayMessageBox('Not Configured', 'GitLab token not configured. Set GITLAB_TOKEN environment variable.', 'error');
    process.exit(1);
  }

  // URL encode the project path
  const encodedProject = encodeURIComponent(project);

  console.log(`\n${DIM}Fetching container images for "${project}"...${RESET}\n`);

  try {
    // First get the project to verify it exists
    const projectResponse = await fetch(`${gitlabUrl}/api/v4/projects/${encodedProject}`, {
      headers: {
        'PRIVATE-TOKEN': token,
      },
    });

    if (!projectResponse.ok) {
      if (projectResponse.status === 404) {
        throw new Error(`Project "${project}" not found. Use the full path like "group/project".`);
      }
      throw new Error(`Failed to fetch project: ${projectResponse.status}`);
    }

    const projectData = await projectResponse.json();

    // Get container repositories
    const reposResponse = await fetch(`${gitlabUrl}/api/v4/projects/${projectData.id}/registry/repositories`, {
      headers: {
        'PRIVATE-TOKEN': token,
      },
    });

    if (!reposResponse.ok) {
      throw new Error(`Failed to fetch repositories: ${reposResponse.status}`);
    }

    const repos = await reposResponse.json();

    const termWidth = getTerminalWidth();
    const tableWidth = Math.min(100, termWidth - 4);

    console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}`);
    console.log(`${BOLD}  Container Images - ${projectData.path_with_namespace}${RESET}`);
    console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}\n`);

    if (repos.length === 0) {
      console.log(`  ${DIM}No container images found.${RESET}`);
      console.log(`  ${DIM}Push an image with: docker push ${getRegistryUrl()}/${projectData.path_with_namespace}/<image>:<tag>${RESET}\n`);
    } else {
      for (const repo of repos) {
        console.log(`  ${CYAN}●${RESET} ${BOLD}${repo.path}${RESET}`);
        console.log(`    ${DIM}ID: ${repo.id} | Location: ${repo.location}${RESET}`);

        // Get tags for this repository
        if (options.tags) {
          try {
            const tagsResponse = await fetch(`${gitlabUrl}/api/v4/projects/${projectData.id}/registry/repositories/${repo.id}/tags`, {
              headers: {
                'PRIVATE-TOKEN': token,
              },
            });

            if (tagsResponse.ok) {
              const tags = await tagsResponse.json();
              if (tags.length > 0) {
                const tagList = tags.slice(0, 10).map(t => t.name).join(', ');
                console.log(`    ${DIM}Tags: ${tagList}${tags.length > 10 ? ` (+${tags.length - 10} more)` : ''}${RESET}`);
              }
            }
          } catch (e) {
            // Ignore tag fetch errors
          }
        }

        console.log('');
      }
    }

    console.log(`${fg(...LOGO_PURPLE)}${'─'.repeat(tableWidth)}${RESET}`);
    console.log(`${DIM}  Total: ${repos.length} image(s)${RESET}\n`);

  } catch (error) {
    displayMessageBox('Failed', error.message, 'error');
    process.exit(1);
  }
}

// Push an image to GitLab Container Registry
async function registryPushCommand(image, options) {
  const registryUrl = options.registry || getRegistryUrl();

  console.log(`\n${DIM}Pushing image to GitLab Container Registry...${RESET}\n`);

  // Check if the image name already includes the registry
  let fullImage = image;
  if (!image.includes('/') || !image.includes('.')) {
    // User provided just an image name, need project path
    if (!options.project) {
      displayMessageBox('Project Required', 'Please specify the project with --project or use full image path.\n\nExample: gbos registry push myimage:latest --project group/project\nOr: gbos registry push registry.gitlab.com/group/project/image:tag', 'error');
      process.exit(1);
    }
    fullImage = `${registryUrl}/${options.project}/${image}`;
  }

  console.log(`  ${DIM}Image:${RESET}    ${image}`);
  console.log(`  ${DIM}Target:${RESET}   ${fullImage}\n`);

  try {
    // Tag the image if needed
    if (fullImage !== image) {
      console.log(`  ${DIM}Tagging image...${RESET}`);
      await execCommand(`docker tag ${image} ${fullImage}`);
    }

    // Push the image
    console.log(`  ${DIM}Pushing to registry...${RESET}\n`);

    const pushProcess = spawn('docker', ['push', fullImage], {
      stdio: 'inherit',
    });

    await new Promise((resolve, reject) => {
      pushProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Push failed with exit code ${code}`));
        }
      });
    });

    console.log(`\n${GREEN}✓${RESET} ${BOLD}Image pushed successfully${RESET}`);
    console.log(`  ${DIM}Location:${RESET} ${fullImage}\n`);

  } catch (error) {
    // Check if docker is installed
    try {
      await execCommand('docker --version');
    } catch (e) {
      displayMessageBox('Docker Not Found', 'Docker is not installed or not in PATH. Please install Docker first.', 'error');
      process.exit(1);
    }

    displayMessageBox('Push Failed', error.message, 'error');
    process.exit(1);
  }
}

// Pull an image from GitLab Container Registry
async function registryPullCommand(image, options) {
  const registryUrl = options.registry || getRegistryUrl();

  console.log(`\n${DIM}Pulling image from GitLab Container Registry...${RESET}\n`);

  // Check if the image name already includes the registry
  let fullImage = image;
  if (!image.includes('/') || !image.includes('.')) {
    if (!options.project) {
      displayMessageBox('Project Required', 'Please specify the project with --project or use full image path.', 'error');
      process.exit(1);
    }
    fullImage = `${registryUrl}/${options.project}/${image}`;
  }

  console.log(`  ${DIM}Pulling:${RESET} ${fullImage}\n`);

  try {
    const pullProcess = spawn('docker', ['pull', fullImage], {
      stdio: 'inherit',
    });

    await new Promise((resolve, reject) => {
      pullProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Pull failed with exit code ${code}`));
        }
      });
    });

    console.log(`\n${GREEN}✓${RESET} ${BOLD}Image pulled successfully${RESET}\n`);

  } catch (error) {
    displayMessageBox('Pull Failed', error.message, 'error');
    process.exit(1);
  }
}

module.exports = {
  registryLoginCommand,
  registryImagesCommand,
  registryPushCommand,
  registryPullCommand,
};
