// ESM entry point that imports the CommonJS module
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const promptfoo = require('./dist/src/index.js');

// Re-export everything
export const { assertions, cache, evaluate, guardrails, loadApiProvider, redteam, generateTable } =
  promptfoo;

// Re-export default
export default promptfoo.default || promptfoo;
