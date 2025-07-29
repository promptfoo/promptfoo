// ESM wrapper for dual package support
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
