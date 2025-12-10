// CommonJS module to test CJS fallback
// This file uses module.exports which will fail ESM import and trigger CJS fallback

module.exports = {
  testValue: 'cjs-fallback-test',
  testFunction: () => 'cjs fallback result',
};
