const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const api = require('promptfoo');
const packageRequire = createRequire(require.resolve('promptfoo'));
const { ZodType } = packageRequire('zod');

async function main() {
  assert(api.AssertionSchema instanceof ZodType, 'Keep CommonJS dependency export conditions');
  assert.equal(Object.isExtensible(api), true);
  const evaluateDescriptor = Object.getOwnPropertyDescriptor(api, 'evaluate');
  assert(evaluateDescriptor, 'Keep the CommonJS evaluate export');
  assert.equal(evaluateDescriptor.writable, true);
  const { checkEvaluate } = await import('./evaluate.mjs');
  await checkEvaluate(api, 'cjs');
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
