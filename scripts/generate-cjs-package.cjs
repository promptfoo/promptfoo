#!/usr/bin/env node

// Generate a package.json for the CJS build with type: "commonjs"
const fs = require('fs');
const path = require('path');

const rootPackageJson = require('../package.json');

// Create a modified version for CJS
const cjsPackageJson = {
  ...rootPackageJson,
  type: 'commonjs',
  // Remove ESM-specific fields
  main: './src/index.js',
  exports: undefined,
  module: undefined
};

// Ensure dist/cjs directory exists
const cjsDir = path.join(__dirname, '..', 'dist', 'cjs');
if (!fs.existsSync(cjsDir)) {
  fs.mkdirSync(cjsDir, { recursive: true });
}

// Write the CJS package.json
fs.writeFileSync(
  path.join(cjsDir, 'package.json'),
  JSON.stringify(cjsPackageJson, null, 2) + '\n'
);

console.log('Generated CJS package.json');