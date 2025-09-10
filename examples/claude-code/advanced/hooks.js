const { execSync } = require('child_process');
const path = require('path');

/**
 * Extension hook that resets git workspace after each test to prevent race conditions
 * @param {string} hookName - The name of the hook being called
 * @param {Object} context - Context information for the hook
 */
function extensionHook(hookName, context) {
  // Only run on afterEach to reset files after Claude Code modifications
  if (hookName !== 'afterEach') {
    return;
  }

  console.log('=== Git reset hook (afterEach) ===');
  console.log('Hook context:', {
    hasTest: !!context?.test,
    hasResult: !!context?.result,
    resultSuccess: context?.result?.success,
    resultError: context?.result?.error,
  });

  try {
    // Check git status before reset
    const workspacePath = path.resolve('./workspace');
    console.log('Checking git status before reset...');
    const gitStatus = execSync('git status --porcelain', {
      cwd: workspacePath,
      encoding: 'utf8',
    });
    console.log('Git status:', gitStatus.trim() || 'Clean');

    // Only reset if there are actually changes to avoid unnecessary output
    if (gitStatus.trim()) {
      console.log('Resetting workspace at:', workspacePath);
      execSync('git reset --hard HEAD', {
        cwd: workspacePath,
        stdio: 'inherit',
      });
      console.log('=== Git reset completed ===');
    } else {
      console.log('=== No changes to reset ===');
    }
    console.log('');
  } catch (error) {
    console.error('Git reset failed:', error.message);
  }
}

module.exports = extensionHook;
