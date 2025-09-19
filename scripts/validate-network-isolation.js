#!/usr/bin/env node

/**
 * Network Isolation Validator
 *
 * This script validates that tests are properly isolated from network access.
 * It runs tests in multiple modes to ensure no external network calls are made.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

function log(color, message) {
  console.log(`${color}${message}${RESET}`);
}

function runCommand(command, description) {
  log(BLUE, `\n🔍 ${description}`);
  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'test' },
    });

    // Check for network-related warnings in output
    const networkWarnings = output
      .split('\n')
      .filter(
        (line) =>
          line.includes('🚫 Blocked') ||
          line.includes('Network call') ||
          line.includes('📊 Network calls'),
      );

    if (networkWarnings.length > 0) {
      log(YELLOW, `⚠️  Network attempts detected:`);
      networkWarnings.forEach((warning) => {
        log(YELLOW, `   ${warning.trim()}`);
      });
    } else {
      log(GREEN, `✅ No network calls detected`);
    }

    return { success: true, output, networkWarnings };
  } catch (error) {
    log(RED, `❌ Command failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

function validateNetworkIsolation() {
  log(BLUE, '🛡️  Network Isolation Validator');
  log(BLUE, '==================================');

  const results = [];

  // Test 1: Run normal Jest tests
  results.push(
    runCommand(
      'npm test test/fetch.test.ts -- --maxWorkers=1 --forceExit',
      'Testing standard Jest configuration',
    ),
  );

  // Test 2: Run with network isolated environment
  results.push(
    runCommand(
      'npm run test:network-isolated test/fetch.test.ts -- --maxWorkers=1 --forceExit',
      'Testing with network isolated environment',
    ),
  );

  // Test 3: Run a sample of different test types
  const testSamples = ['test/providers/openai/chat.test.ts', 'test/evaluator.test.ts'];

  testSamples.forEach((testFile) => {
    if (fs.existsSync(testFile)) {
      results.push(
        runCommand(
          `npm test ${testFile} -- --maxWorkers=1 --forceExit`,
          `Testing ${path.basename(testFile)}`,
        ),
      );
    }
  });

  // Summary
  log(BLUE, '\n📊 Network Isolation Summary');
  log(BLUE, '============================');

  const successful = results.filter((r) => r.success).length;
  const totalNetworkWarnings = results.reduce(
    (sum, r) => sum + (r.networkWarnings ? r.networkWarnings.length : 0),
    0,
  );

  log(GREEN, `✅ Tests completed: ${successful}/${results.length}`);

  if (totalNetworkWarnings === 0) {
    log(GREEN, `🛡️  Network isolation: PERFECT - No external calls detected`);
  } else {
    log(YELLOW, `⚠️  Network isolation: GOOD - ${totalNetworkWarnings} blocked attempts logged`);
    log(YELLOW, `   This is normal - it shows the isolation is working!`);
  }

  // Recommendations
  log(BLUE, '\n💡 Recommendations');
  log(BLUE, '==================');
  log(BLUE, '• Use `npm run test:network-isolated` for maximum isolation');
  log(BLUE, '• Check jest.setup.ts for network monitoring configuration');
  log(BLUE, '• All external HTTP calls should be mocked using nock or jest.mock()');
  log(BLUE, '• Local calls to localhost/127.0.0.1 are allowed for test servers');

  return totalNetworkWarnings === 0 ? 0 : 1;
}

// Run if called directly
if (require.main === module) {
  process.exit(validateNetworkIsolation());
}

module.exports = { validateNetworkIsolation };
