const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Extension hook that manages git workspace lifecycle
 * @param {string} hookName - The name of the hook being called (beforeAll, beforeEach, afterEach, afterAll)
 * @param {Object} context - Context information for the hook
 */
function extensionHook(hookName, context) {
  // Resolve workspace path relative to this hook file (not the cwd)
  const workspacePath = path.join(__dirname, 'workspace');
  const gitPath = path.join(workspacePath, '.git');
  const reportPath = path.join(__dirname, 'latest-diffs.md');

  if (hookName === 'beforeAll') {
    // Initialize git repo once before all tests
    try {
      console.log('Initializing git repository...');

      // Initialize git if not already initialized
      if (!fs.existsSync(gitPath)) {
        execSync('git init', {
          cwd: workspacePath,
          stdio: 'pipe',
        });
      }

      // Configure git user for the initial commit
      execSync('git config user.name "Test User"', {
        cwd: workspacePath,
        stdio: 'pipe',
      });
      execSync('git config user.email "test@example.com"', {
        cwd: workspacePath,
        stdio: 'pipe',
      });

      // Add all files and create initial commit
      execSync('git add -A', {
        cwd: workspacePath,
        stdio: 'pipe',
      });

      execSync('git commit -m "Initial commit"', {
        cwd: workspacePath,
        stdio: 'pipe',
      });

      // Create fresh report file
      fs.writeFileSync(reportPath, '# Test Run Report\n\n', 'utf8');

      console.log('=== Git repository initialized ===');
      console.log('');
    } catch (error) {
      console.error('Git initialization failed:', error.message);
    }
  } else if (hookName === 'afterEach') {
    // Capture changes and reset workspace after each test
    try {
      const timestamp = new Date().toISOString();
      const gitStatus = execSync('git status --porcelain', {
        cwd: workspacePath,
        encoding: 'utf8',
      });

      // Build report entry
      let reportEntry = `## Test completed at ${timestamp}\n\n`;

      if (gitStatus.trim()) {
        const gitDiff = execSync('git diff HEAD', {
          cwd: workspacePath,
          encoding: 'utf8',
        });

        reportEntry += '### Changes Made\n\n```diff\n' + gitDiff + '\n```\n\n';

        // Reset workspace
        execSync('git reset --hard HEAD', {
          cwd: workspacePath,
          stdio: 'pipe', // Silent
        });
      } else {
        reportEntry += '_No changes made during test_\n\n';
      }

      // Append to report
      fs.appendFileSync(reportPath, reportEntry, 'utf8');
    } catch (error) {
      console.error('Git reset failed:', error.message);
    }
  } else if (hookName === 'afterAll') {
    // Clean up git repository after all tests
    try {
      if (fs.existsSync(gitPath)) {
        fs.rmSync(gitPath, { recursive: true, force: true });
      }
      console.log('Git workspace cleaned up. View diffs: cat ' + reportPath);
    } catch (error) {
      console.error('Git cleanup failed:', error.message);
    }
  }
}

module.exports = extensionHook;
