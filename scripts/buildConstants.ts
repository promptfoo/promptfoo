#!/usr/bin/env tsx
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * Build script to copy and transpile constants.ts to constants.js for CI compatibility
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcPath = path.join(__dirname, '../src/generated/constants.ts');
const distPath = path.join(__dirname, '../dist/src/generated/constants.js');

// Read the TypeScript constants file
const tsContent = fs.readFileSync(srcPath, 'utf8');

// Simple transpilation - convert export to CommonJS exports
let jsContent = tsContent
  .replace(/^export const /gm, 'exports.')
  .replace(/\/\/ This file is auto-generated.*\n/, '')
  .replace(/\/\/ Generated at:.*\n/, '');

// Ensure it ends with a newline
if (!jsContent.endsWith('\n')) {
  jsContent += '\n';
}

// Write the JavaScript version
fs.writeFileSync(distPath, jsContent, 'utf8');

console.log('Generated dist/src/generated/constants.js');
