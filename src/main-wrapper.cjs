#!/usr/bin/env node

// This wrapper detects whether to use ESM or CJS based on the environment
// It provides backwards compatibility for users who might have issues with ESM

const { existsSync } = require('fs');
const { join } = require('path');
const { spawn } = require('child_process');

// Check if this is development (running from src) or production (running from dist)
const isDevelopment = __dirname.endsWith('/src');

let esmPath, cjsPath;
if (isDevelopment) {
  // Development: main.js is in src directory
  esmPath = join(__dirname, 'main.js');
  cjsPath = join(__dirname, 'main.js'); // Same file, will be transpiled by ts-node
} else {
  // Production: binaries in dist (wrapper is in dist/, builds are in dist/esm and dist/cjs)
  esmPath = join(__dirname, 'esm/src/main.js');
  cjsPath = join(__dirname, 'cjs/src/main.js');
}

// Function to run the CLI
function runCli(scriptPath) {
  const child = spawn(process.execPath, [scriptPath, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('error', (err) => {
    console.error('Failed to start process:', err);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

// Try ESM first, fall back to CJS
if (existsSync(esmPath)) {
  // Try to detect if ESM will work by checking Node.js version and flags
  const nodeVersion = process.versions.node.split('.').map(Number);
  const supportsESM = nodeVersion[0] >= 14;
  
  if (supportsESM && !process.env.PROMPTFOO_FORCE_CJS) {
    runCli(esmPath);
  } else if (existsSync(cjsPath)) {
    runCli(cjsPath);
  } else {
    console.error('CJS build not found. Please run "npm run build" first.');
    process.exit(1);
  }
} else if (existsSync(cjsPath)) {
  // Fall back to CJS
  runCli(cjsPath);
} else {
  console.error('No build found. Please run "npm run build" first.');
  process.exit(1);
}