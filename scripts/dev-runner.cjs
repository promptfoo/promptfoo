#!/usr/bin/env node
/**
 * Development runner that optionally uses Node 23 --experimental-strip-types
 * Falls back to tsx/esm loader for older Node versions
 */
const { spawn } = require('child_process');
const process = require('process');

function getNodeMajorVersion() {
  const version = process.version.match(/v(\d+)/);
  return version ? parseInt(version[1], 10) : 0;
}

function runWithNode23Features(scriptPath, args = []) {
  const nodeMajor = getNodeMajorVersion();

  if (nodeMajor >= 23) {
    console.log(`Using Node ${nodeMajor} with experimental TypeScript support`);
    return spawn(
      'node',
      ['--experimental-strip-types', '--experimental-transform-types', scriptPath, ...args],
      {
        stdio: 'inherit',
        env: process.env,
      },
    );
  } else {
    console.log(`Using Node ${nodeMajor} with tsx import fallback`);
    return spawn('node', ['--import', 'tsx/esm', scriptPath, ...args], {
      stdio: 'inherit',
      env: process.env,
    });
  }
}

// Get script path and arguments from command line
const [, , scriptPath, ...args] = process.argv;

if (!scriptPath) {
  console.error('Usage: node dev-runner.cjs <script-path> [args...]');
  process.exit(1);
}

const child = runWithNode23Features(scriptPath, args);

child.on('close', (code) => {
  process.exit(code || 0);
});

child.on('error', (error) => {
  console.error('Failed to start process:', error);
  process.exit(1);
});
