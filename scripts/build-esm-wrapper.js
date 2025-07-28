#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

// Create a wrapper that loads the CommonJS module
const wrapperContent = `// ESM wrapper for CommonJS module
import { createRequire } from 'module';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load the CommonJS module
const promptfoo = require('./dist/src/index.js');

// Re-export everything
export const {
  assertions,
  cache,
  evaluate,
  guardrails,
  loadApiProvider,
  redteam,
  generateTable
} = promptfoo;

// Export default
export default promptfoo.default || promptfoo;
`;

async function build() {
  try {
    // Write the wrapper file
    await fs.writeFile(
      path.join(__dirname, '..', 'index.mjs'),
      wrapperContent,
      'utf-8'
    );
    
    console.log('✓ Created ESM wrapper');
    
    // Also ensure we have the CommonJS entry point
    const cjsContent = `// CommonJS entry point
module.exports = require('./dist/src/index.js');
`;
    
    await fs.writeFile(
      path.join(__dirname, '..', 'index.cjs'),
      cjsContent,
      'utf-8'
    );
    
    console.log('✓ Created CommonJS wrapper');
    
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();