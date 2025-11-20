#!/usr/bin/env ts-node
/**
 * Test to verify Python and JavaScript tool paths are resolved relative to config base directory.
 * This reproduces the scenario: promptfoo eval -c configs/promptfooconfig.yaml
 */

import cliState from './src/cliState';
import { maybeLoadToolsFromExternalFile } from './src/util/index';

async function testSubdirectoryResolution() {
  console.log('\n🧪 Testing Subdirectory Path Resolution\n');
  console.log('='.repeat(60));

  let passed = 0;
  let failed = 0;

  // Test 1: Python file in subdirectory with relative path
  console.log('\nTest 1: Python file with relative path (file://./tools.py:get_tools)');
  try {
    // Simulate being in project root but config in /tmp/pf-test-config/
    const originalBasePath = cliState.basePath;
    cliState.basePath = '/tmp/pf-test-config';

    const tools = await maybeLoadToolsFromExternalFile('file://./tools.py:get_tools');

    cliState.basePath = originalBasePath;

    if (Array.isArray(tools) && tools.length === 1 && tools[0].function?.name === 'test_tool') {
      console.log('✅ PASSED - Python file resolved correctly from config base path');
      passed++;
    } else {
      console.log('❌ FAILED - Unexpected result:', JSON.stringify(tools));
      failed++;
    }
  } catch (error) {
    console.log(
      '❌ FAILED -',
      error instanceof Error ? error.message.split('\n')[0] : String(error),
    );
    failed++;
  }

  // Test 2: JavaScript file in project root (existing test)
  console.log('\nTest 2: JavaScript file with relative path (file://./test-tools.js:get_tools)');
  try {
    const originalBasePath = cliState.basePath;
    cliState.basePath = process.cwd();

    const tools = await maybeLoadToolsFromExternalFile('file://./test-tools.js:get_tools');

    cliState.basePath = originalBasePath;

    if (Array.isArray(tools) && tools.length === 1) {
      console.log('✅ PASSED - JavaScript file resolved correctly from config base path');
      passed++;
    } else {
      console.log('❌ FAILED - Unexpected result');
      failed++;
    }
  } catch (error) {
    console.log(
      '❌ FAILED -',
      error instanceof Error ? error.message.split('\n')[0] : String(error),
    );
    failed++;
  }

  // Test 3: Python file with relative path from project root
  console.log('\nTest 3: Python file in project root (file://./test-tools.py:get_tools)');
  try {
    const originalBasePath = cliState.basePath;
    cliState.basePath = process.cwd();

    const tools = await maybeLoadToolsFromExternalFile('file://./test-tools.py:get_tools');

    cliState.basePath = originalBasePath;

    if (Array.isArray(tools) && tools.length === 1) {
      console.log('✅ PASSED - Python file resolved correctly from project root');
      passed++;
    } else {
      console.log('❌ FAILED - Unexpected result');
      failed++;
    }
  } catch (error) {
    console.log(
      '❌ FAILED -',
      error instanceof Error ? error.message.split('\n')[0] : String(error),
    );
    failed++;
  }

  // Test 4: Verify ENOENT error when basePath is wrong (should fail gracefully)
  console.log('\nTest 4: Error when Python file not found in basePath');
  try {
    const originalBasePath = cliState.basePath;
    cliState.basePath = '/nonexistent/path';

    await maybeLoadToolsFromExternalFile('file://./tools.py:get_tools');

    cliState.basePath = originalBasePath;

    console.log('❌ FAILED - Should have thrown error for nonexistent file');
    failed++;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (
      msg.includes('Failed to load tools') ||
      msg.includes('ENOENT') ||
      msg.includes('No such file')
    ) {
      console.log('✅ PASSED - Correctly throws error for nonexistent file');
      passed++;
    } else {
      console.log('❌ FAILED - Wrong error:', msg.split('\n')[0]);
      failed++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed (${passed + failed} total)\n`);

  if (failed > 0) {
    console.log('❌ Some tests failed!\n');
    process.exit(1);
  } else {
    console.log('✅ All subdirectory resolution tests passed!\n');
    process.exit(0);
  }
}

testSubdirectoryResolution().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
