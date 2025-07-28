// Test to verify both ESM and CommonJS imports work correctly
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('Package exports', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should support CommonJS require', () => {
    const testFile = path.join(tempDir, 'test-cjs.js');
    const testContent = `
      const promptfoo = require('${process.cwd()}');
      console.log(JSON.stringify({
        hasEvaluate: typeof promptfoo.evaluate === 'function',
        hasAssertions: typeof promptfoo.assertions === 'object',
        hasLoadApiProvider: typeof promptfoo.loadApiProvider === 'function'
      }));
    `;
    fs.writeFileSync(testFile, testContent);

    const output = execSync(`node ${testFile}`, { encoding: 'utf8' });
    const result = JSON.parse(output);

    expect(result.hasEvaluate).toBe(true);
    expect(result.hasAssertions).toBe(true);
    expect(result.hasLoadApiProvider).toBe(true);
  });

  it('should support ESM import', () => {
    const testFile = path.join(tempDir, 'test-esm.mjs');
    const testContent = `
      import { evaluate, assertions, loadApiProvider } from '${process.cwd()}/index.mjs';
      console.log(JSON.stringify({
        hasEvaluate: typeof evaluate === 'function',
        hasAssertions: typeof assertions === 'object',
        hasLoadApiProvider: typeof loadApiProvider === 'function'
      }));
    `;
    fs.writeFileSync(testFile, testContent);

    const output = execSync(`node ${testFile}`, { encoding: 'utf8' });
    const result = JSON.parse(output);

    expect(result.hasEvaluate).toBe(true);
    expect(result.hasAssertions).toBe(true);
    expect(result.hasLoadApiProvider).toBe(true);
  });

  it('should support ESM default import', () => {
    const testFile = path.join(tempDir, 'test-esm-default.mjs');
    const testContent = `
      import promptfoo from '${process.cwd()}/index.mjs';
      console.log(JSON.stringify({
        hasEvaluate: typeof promptfoo.evaluate === 'function',
        hasAssertions: typeof promptfoo.assertions === 'object',
        hasLoadApiProvider: typeof promptfoo.loadApiProvider === 'function'
      }));
    `;
    fs.writeFileSync(testFile, testContent);

    const output = execSync(`node ${testFile}`, { encoding: 'utf8' });
    const result = JSON.parse(output);

    expect(result.hasEvaluate).toBe(true);
    expect(result.hasAssertions).toBe(true);
    expect(result.hasLoadApiProvider).toBe(true);
  });
});