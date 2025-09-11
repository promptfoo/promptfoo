import * as fs from 'fs';
import * as path from 'path';
import { readTests } from '../../src/util/testCaseReader';
import type { TestSuite } from '../../src/types';

describe('YAML assertion loading integration test (issue #5519)', () => {
  const fixtureDir = path.join(__dirname, '../fixtures/issue-5519-repro');
  
  beforeAll(() => {
    // Ensure fixture directory exists
    expect(fs.existsSync(fixtureDir)).toBe(true);
  });

  it('should preserve Python file references when loading YAML tests', async () => {
    const configPath = path.join(fixtureDir, 'promptfooconfig.yaml');
    
    // Read the configuration and tests
    const testSuite: TestSuite = {
      prompts: ['test prompt'],
      providers: [{ id: 'python:./provider.py' }],
      tests: 'file://tests.yaml',
      outputPath: './output.json'
    };

    // Use the actual test reading logic with the fixture directory as base path
    const tests = await readTests(testSuite, fixtureDir);
    
    // Verify we have 2 tests as expected
    expect(tests).toHaveLength(2);
    
    // Verify the first test (Should PASS) preserves the Python file reference
    const goodTest = tests.find(t => t.vars?.name === 'Should PASS');
    expect(goodTest).toBeDefined();
    expect(goodTest!.assert).toHaveLength(1);
    expect(goodTest!.assert![0]).toEqual({
      type: 'python',
      value: 'file://good_assertion.py'
    });
    
    // Verify the second test (Should FAIL) preserves the Python file reference 
    const badTest = tests.find(t => t.vars?.name === 'Should FAIL');
    expect(badTest).toBeDefined();
    expect(badTest!.assert).toHaveLength(1);
    expect(badTest!.assert![0]).toEqual({
      type: 'python',
      value: 'file://bad_assertion.py'
    });
  });

  it('should demonstrate that file references are NOT loaded as inline content', async () => {
    const testSuite: TestSuite = {
      prompts: ['test prompt'],
      providers: [{ id: 'python:./provider.py' }],
      tests: 'file://tests.yaml',
      outputPath: './output.json'
    };

    const tests = await readTests(testSuite, fixtureDir);
    
    // Verify that assertion values are still file:// references, not the content
    const goodTest = tests.find(t => t.vars?.name === 'Should PASS');
    expect(goodTest!.assert![0].value).toBe('file://good_assertion.py');
    
    // The value should NOT contain the actual Python code
    expect(goodTest!.assert![0].value).not.toContain('def get_assert');
    expect(goodTest!.assert![0].value).not.toContain('return {');
    
    const badTest = tests.find(t => t.vars?.name === 'Should FAIL');
    expect(badTest!.assert![0].value).toBe('file://bad_assertion.py');
    
    // The value should NOT contain the actual Python code
    expect(badTest!.assert![0].value).not.toContain('import inspect');
    expect(badTest!.assert![0].value).not.toContain('return {');
  });

  it('should handle relative paths correctly in fixture context', async () => {
    // Test that the file references are preserved even with relative paths
    const testSuite: TestSuite = {
      prompts: ['test prompt'],
      providers: [{ id: 'python:./provider.py' }],
      tests: 'file://tests.yaml',
      outputPath: './output.json'
    };

    const tests = await readTests(testSuite, fixtureDir);
    
    // Both assertions should maintain their file:// prefixes
    expect(tests[0].assert![0].value).toMatch(/^file:\/\//);
    expect(tests[1].assert![0].value).toMatch(/^file:\/\//);
  });
});