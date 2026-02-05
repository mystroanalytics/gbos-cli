/**
 * Verification Manager
 * Runs tests and collects results for verification pipeline
 */

const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

class VerificationManager {
  constructor(workingDir, options = {}) {
    this.workingDir = workingDir;
    this.options = {
      timeout: options.timeout || 10 * 60 * 1000, // 10 minutes
      cloudRunUrl: options.cloudRunUrl || null,
      ...options,
    };
    this.results = {
      linting: null,
      formatting: null,
      typeCheck: null,
      unitTests: null,
      integrationTests: null,
      e2eTests: null,
      overall: null,
    };
  }

  /**
   * Detect project type and available test commands
   */
  async detectProjectType() {
    const packageJson = path.join(this.workingDir, 'package.json');
    const pyprojectToml = path.join(this.workingDir, 'pyproject.toml');
    const requirementsTxt = path.join(this.workingDir, 'requirements.txt');

    if (fs.existsSync(packageJson)) {
      const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
      return {
        type: 'node',
        scripts: pkg.scripts || {},
        dependencies: { ...pkg.dependencies, ...pkg.devDependencies },
      };
    }

    if (fs.existsSync(pyprojectToml) || fs.existsSync(requirementsTxt)) {
      return { type: 'python' };
    }

    return { type: 'unknown' };
  }

  /**
   * Run all verification steps
   */
  async runAll() {
    const project = await this.detectProjectType();

    // Run linting
    this.results.linting = await this.runLinting(project);

    // Run formatting check
    this.results.formatting = await this.runFormatting(project);

    // Run type checking
    this.results.typeCheck = await this.runTypeCheck(project);

    // Run unit tests
    this.results.unitTests = await this.runUnitTests(project);

    // Run E2E tests if cloud URL available
    if (this.options.cloudRunUrl) {
      this.results.e2eTests = await this.runE2ETests(project);
    }

    // Calculate overall result
    this.results.overall = this.calculateOverall();

    return this.results;
  }

  /**
   * Run linting
   */
  async runLinting(project) {
    const result = { passed: false, output: '', command: null };

    try {
      if (project.type === 'node') {
        // Try ESLint
        if (project.scripts?.lint) {
          result.command = 'npm run lint';
        } else if (project.dependencies?.eslint) {
          result.command = 'npx eslint . --ext .js,.jsx,.ts,.tsx';
        }
      } else if (project.type === 'python') {
        result.command = 'python -m flake8 . || python -m pylint .';
      }

      if (result.command) {
        const { stdout, stderr } = await execAsync(result.command, {
          cwd: this.workingDir,
          timeout: 60000,
        });
        result.output = stdout + stderr;
        result.passed = true;
      } else {
        result.output = 'No linting configured';
        result.passed = true; // Skip if not configured
      }
    } catch (error) {
      result.output = error.message + (error.stdout || '') + (error.stderr || '');
      result.passed = false;
    }

    return result;
  }

  /**
   * Run formatting check
   */
  async runFormatting(project) {
    const result = { passed: false, output: '', command: null };

    try {
      if (project.type === 'node') {
        if (project.scripts?.format) {
          result.command = 'npm run format -- --check';
        } else if (project.dependencies?.prettier) {
          result.command = 'npx prettier --check .';
        }
      } else if (project.type === 'python') {
        result.command = 'python -m black --check . || python -m autopep8 --diff .';
      }

      if (result.command) {
        const { stdout, stderr } = await execAsync(result.command, {
          cwd: this.workingDir,
          timeout: 60000,
        });
        result.output = stdout + stderr;
        result.passed = true;
      } else {
        result.output = 'No formatting configured';
        result.passed = true;
      }
    } catch (error) {
      result.output = error.message;
      result.passed = false;
    }

    return result;
  }

  /**
   * Run type checking
   */
  async runTypeCheck(project) {
    const result = { passed: false, output: '', command: null };

    try {
      if (project.type === 'node') {
        if (project.dependencies?.typescript) {
          result.command = 'npx tsc --noEmit';
        }
      } else if (project.type === 'python') {
        result.command = 'python -m mypy .';
      }

      if (result.command) {
        const { stdout, stderr } = await execAsync(result.command, {
          cwd: this.workingDir,
          timeout: 120000,
        });
        result.output = stdout + stderr;
        result.passed = true;
      } else {
        result.output = 'No type checking configured';
        result.passed = true;
      }
    } catch (error) {
      result.output = error.message;
      result.passed = false;
    }

    return result;
  }

  /**
   * Run unit tests
   */
  async runUnitTests(project) {
    const result = { passed: false, output: '', command: null, stats: null };

    try {
      if (project.type === 'node') {
        if (project.scripts?.test) {
          result.command = 'npm test';
        } else if (project.dependencies?.jest) {
          result.command = 'npx jest';
        } else if (project.dependencies?.mocha) {
          result.command = 'npx mocha';
        } else if (project.dependencies?.vitest) {
          result.command = 'npx vitest run';
        }
      } else if (project.type === 'python') {
        result.command = 'python -m pytest';
      }

      if (result.command) {
        const { stdout, stderr } = await execAsync(result.command, {
          cwd: this.workingDir,
          timeout: this.options.timeout,
          env: { ...process.env, CI: 'true' },
        });
        result.output = stdout + stderr;
        result.passed = true;
        result.stats = this.parseTestOutput(result.output);
      } else {
        result.output = 'No test command configured';
        result.passed = true;
      }
    } catch (error) {
      result.output = error.message + (error.stdout || '') + (error.stderr || '');
      result.passed = false;
      result.stats = this.parseTestOutput(result.output);
    }

    return result;
  }

  /**
   * Run E2E tests with Playwright
   */
  async runE2ETests(project) {
    const result = { passed: false, output: '', command: null };

    if (!this.options.cloudRunUrl) {
      result.output = 'No cloud URL configured for E2E tests';
      result.passed = true;
      return result;
    }

    try {
      // Check for Playwright
      const hasPlaywright = project.type === 'node' &&
        (project.dependencies?.['@playwright/test'] || project.dependencies?.playwright);

      if (hasPlaywright) {
        result.command = 'npx playwright test';
        const { stdout, stderr } = await execAsync(result.command, {
          cwd: this.workingDir,
          timeout: this.options.timeout,
          env: {
            ...process.env,
            CI: 'true',
            BASE_URL: this.options.cloudRunUrl,
            PLAYWRIGHT_BASE_URL: this.options.cloudRunUrl,
          },
        });
        result.output = stdout + stderr;
        result.passed = true;
      } else {
        result.output = 'Playwright not installed, skipping E2E tests';
        result.passed = true;
      }
    } catch (error) {
      result.output = error.message + (error.stdout || '') + (error.stderr || '');
      result.passed = false;
    }

    return result;
  }

  /**
   * Parse test output to extract statistics
   */
  parseTestOutput(output) {
    // Jest pattern
    let match = output.match(/Tests:\s*(\d+)\s*passed,?\s*(\d+)?\s*failed?,?\s*(\d+)?\s*total/i);
    if (match) {
      return {
        framework: 'jest',
        passed: parseInt(match[1]) || 0,
        failed: parseInt(match[2]) || 0,
        total: parseInt(match[3]) || parseInt(match[1]) + (parseInt(match[2]) || 0),
      };
    }

    // Pytest pattern
    match = output.match(/(\d+)\s*passed.*?(\d+)?\s*failed?.*?in\s*([\d.]+)s/i);
    if (match) {
      return {
        framework: 'pytest',
        passed: parseInt(match[1]) || 0,
        failed: parseInt(match[2]) || 0,
        duration: parseFloat(match[3]),
      };
    }

    // Playwright pattern
    match = output.match(/(\d+)\s*passed.*?(\d+)?\s*failed?.*?\(([^)]+)\)/i);
    if (match) {
      return {
        framework: 'playwright',
        passed: parseInt(match[1]) || 0,
        failed: parseInt(match[2]) || 0,
        duration: match[3],
      };
    }

    return null;
  }

  /**
   * Calculate overall verification result
   */
  calculateOverall() {
    const critical = ['unitTests'];
    const optional = ['linting', 'formatting', 'typeCheck', 'e2eTests'];

    // All critical tests must pass
    const criticalPassed = critical.every(key =>
      this.results[key] === null || this.results[key].passed
    );

    // Count optional passes
    const optionalPassed = optional.filter(key =>
      this.results[key] === null || this.results[key].passed
    ).length;

    return {
      passed: criticalPassed,
      criticalPassed,
      optionalPassed,
      totalOptional: optional.length,
      summary: criticalPassed
        ? `Verification passed (${optionalPassed}/${optional.length} optional checks passed)`
        : 'Verification failed: critical tests did not pass',
    };
  }

  /**
   * Run post-processing (formatting, linting fixes)
   */
  async runPostProcessing(project) {
    const results = [];

    try {
      if (project.type === 'node') {
        // Try to fix linting
        if (project.scripts?.['lint:fix']) {
          await execAsync('npm run lint:fix', { cwd: this.workingDir, timeout: 60000 });
          results.push('Linting fixes applied');
        } else if (project.dependencies?.eslint) {
          await execAsync('npx eslint . --ext .js,.jsx,.ts,.tsx --fix', {
            cwd: this.workingDir,
            timeout: 60000,
          });
          results.push('ESLint fixes applied');
        }

        // Try to format
        if (project.dependencies?.prettier) {
          await execAsync('npx prettier --write .', { cwd: this.workingDir, timeout: 60000 });
          results.push('Prettier formatting applied');
        }
      } else if (project.type === 'python') {
        try {
          await execAsync('python -m black .', { cwd: this.workingDir, timeout: 60000 });
          results.push('Black formatting applied');
        } catch (e) {
          // Black not installed
        }
      }
    } catch (error) {
      results.push(`Post-processing error: ${error.message}`);
    }

    return results;
  }

  /**
   * Get verification summary
   */
  getSummary() {
    return {
      results: this.results,
      passed: this.results.overall?.passed || false,
      summary: this.results.overall?.summary || 'Not run',
    };
  }
}

module.exports = VerificationManager;
