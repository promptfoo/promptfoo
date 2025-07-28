// ESM wrapper for CommonJS module
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
