#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

async function createDualPackageOutput() {
  console.log('Creating dual package output...');
  
  try {
    // First, make sure we have a built dist directory
    if (!require('fs').existsSync('dist')) {
      console.error('Error: dist directory not found. Run npm run build first.');
      process.exit(1);
    }
    
    // Create ESM wrapper that handles imports properly
    const esmWrapperContent = `// ESM wrapper for dual package support
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const require = createRequire(import.meta.url);

// Polyfill for Node.js < 20.11
if (!import.meta.dirname) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  import.meta.dirname = __dirname;
  import.meta.filename = __filename;
}

// Load the CommonJS build
const promptfoo = require('./dist/src/index.js');

// Re-export named exports
export const {
  assertions,
  cache,
  evaluate,
  guardrails,
  loadApiProvider,
  redteam,
  generateTable,
} = promptfoo;

// Re-export types
export * from './dist/src/index.js';

// Default export
export default promptfoo;
`;

    // Create CJS wrapper
    const cjsWrapperContent = `// CommonJS wrapper for dual package support
module.exports = require('./dist/src/index.js');
`;

    // Write the wrapper files
    await fs.writeFile('index.mjs', esmWrapperContent);
    await fs.writeFile('index.cjs', cjsWrapperContent);
    
    // Create a small ESM compatibility layer for dependencies
    const esmCompatContent = `// ESM compatibility utilities
export function createRequire(url) {
  return require('module').createRequire(url);
}

export function getFilename(url) {
  return require('url').fileURLToPath(url);
}

export function getDirname(url) {
  return require('path').dirname(getFilename(url));
}
`;

    await fs.mkdir('dist/esm-compat', { recursive: true });
    await fs.writeFile('dist/esm-compat/index.js', esmCompatContent);
    
    console.log('✅ Created dual package wrappers');
    
    // Update package.json exports
    const packageJson = JSON.parse(await fs.readFile('package.json', 'utf-8'));
    
    // Ensure proper exports configuration
    packageJson.exports = {
      ".": {
        "types": "./dist/src/index.d.ts",
        "import": "./index.mjs",
        "require": "./index.cjs",
        "default": "./index.cjs"
      },
      "./package.json": "./package.json"
    };
    
    packageJson.main = "./index.cjs";
    packageJson.module = "./index.mjs";
    packageJson.types = "./dist/src/index.d.ts";
    
    // Keep as commonjs type since the source is CommonJS
    packageJson.type = "commonjs";
    
    // Write back the updated package.json
    await fs.writeFile('package.json', JSON.stringify(packageJson, null, 2) + '\n');
    
    console.log('✅ Updated package.json exports');
    
  } catch (error) {
    console.error('Error creating dual package output:', error);
    process.exit(1);
  }
}

// Run the script
createDualPackageOutput();