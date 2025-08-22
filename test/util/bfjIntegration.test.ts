// @ts-ignore - bfj doesn't have TypeScript declarations
import bfj from 'bfj';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('bfj integration for large JSON', () => {
  let tempDir: string;
  let tempFilePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-bfj-integration-'));
    tempFilePath = path.join(tempDir, 'large-export.json');
  });

  afterEach(() => {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should handle data that would cause RangeError with JSON.stringify', async () => {
    // Create a dataset that approaches the string length limit
    // This simulates the exact scenario that was failing before
    const largeResults = Array.from({ length: 20000 }, (_, i) => ({
      testIdx: i,
      promptIdx: 0,
      success: true,
      score: Math.random(),
      latencyMs: 100 + i,
      vars: { 
        input: `This is a test input for evaluation ${i} with substantial content to increase object size`,
        context: `Additional context data for test ${i} that makes each result object significantly larger`,
        metadata: { 
          id: i, 
          timestamp: new Date().toISOString(),
          tags: ['performance', 'test', `batch-${Math.floor(i / 1000)}`],
          details: `Detailed information about test case ${i} with more content`
        }
      },
      output: `This is the generated output for test case ${i} with comprehensive response content that increases the overall size of the result object significantly`,
      provider: 'test-provider',
      testCase: {
        vars: { input: `test input ${i}` },
        assert: [
          { type: 'equals', value: 'expected response' },
          { type: 'contains', value: 'key phrase' },
          { type: 'not-contains', value: 'unwanted content' }
        ]
      },
      gradingResult: {
        pass: true,
        score: Math.random(),
        reason: `Detailed grading explanation for test ${i} with comprehensive analysis`,
        componentResults: [
          { pass: true, score: 1.0, reason: 'Component 1 analysis' },
          { pass: true, score: 0.9, reason: 'Component 2 analysis' }
        ]
      }
    }));

    const largeOutputData = {
      evalId: 'large-test-eval',
      results: {
        version: 3,
        timestamp: new Date().toISOString(),
        prompts: [
          { 
            raw: 'This is a comprehensive test prompt with substantial content',
            label: 'performance-test-prompt',
            id: 'prompt-1'
          },
          { 
            raw: 'This is another test prompt for the large dataset evaluation',
            label: 'performance-test-prompt-2', 
            id: 'prompt-2'
          },
        ],
        results: largeResults,
        stats: {
          successes: largeResults.length,
          failures: 0,
          errors: 0,
          tokenUsage: { 
            total: largeResults.length * 50, 
            prompt: largeResults.length * 25, 
            completion: largeResults.length * 25,
            cached: 0,
            numRequests: largeResults.length
          },
        },
      },
      config: { 
        description: 'Large dataset performance test configuration',
        prompts: ['prompt1.txt', 'prompt2.txt'],
        providers: ['test-provider'],
        tests: 'large-test-dataset.yaml',
        outputPath: 'large-output.json'
      },
      shareableUrl: 'https://app.promptfoo.dev/eval/large-test-12345',
      metadata: {
        promptfooVersion: '1.0.0',
        nodeVersion: process.version,
        platform: process.platform,
        exportedAt: new Date().toISOString(),
        author: 'integration-test',
        description: 'Large dataset integration test for memory efficiency'
      }
    };

    // This should work with bfj even though it would likely fail with JSON.stringify
    const startTime = Date.now();
    await bfj.write(tempFilePath, largeOutputData, { space: 2 });
    const duration = Date.now() - startTime;

    // Verify the file was created successfully
    expect(fs.existsSync(tempFilePath)).toBe(true);
    
    const stats = fs.statSync(tempFilePath);
    expect(stats.size).toBeGreaterThan(5000000); // Should be a large file (>5MB)

    // Verify we can read back the basic structure (without parsing the entire thing)
    const content = fs.readFileSync(tempFilePath, 'utf8');
    expect(content).toContain('"evalId": "large-test-eval"');
    expect(content).toContain('"version": 3');
    expect(content).toContain(`"testIdx": ${largeResults.length - 1}`); // Last result should be present

    // Should complete in reasonable time (bfj is slower but manageable)
    expect(duration).toBeLessThan(30000); // 30 seconds max for very large dataset

    console.log(`Successfully exported ${largeResults.length} results in ${duration}ms, file size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
  }, 45000); // 45 second timeout for large data test

  it('should produce identical structure to JSON.stringify for smaller data', async () => {
    const testData = {
      evalId: 'structure-test',
      results: {
        version: 3,
        timestamp: '2025-01-01T00:00:00.000Z',
        results: [
          { testIdx: 0, success: true, score: 1.0 },
          { testIdx: 1, success: true, score: 0.9 },
        ],
        stats: { successes: 2, failures: 0 },
      },
      config: { test: true },
      shareableUrl: null,
      metadata: { version: '1.0.0' }
    };

    // Export with bfj
    await bfj.write(tempFilePath, testData, { space: 2 });
    const bfjContent = fs.readFileSync(tempFilePath, 'utf8');
    const bfjParsed = JSON.parse(bfjContent);

    // Compare with JSON.stringify
    const standardJson = JSON.stringify(testData, null, 2);
    const standardParsed = JSON.parse(standardJson);

    // Should produce identical data structures
    expect(bfjParsed).toEqual(standardParsed);
  });

  it('should handle edge case data types correctly', async () => {
    const edgeCaseData = {
      evalId: 'edge-case-test',
      results: {
        version: 3,
        nullValue: null,
        undefinedValue: undefined, // Should be omitted in JSON
        emptyArray: [],
        emptyObject: {},
        specialStrings: ['', '\n', '\t', '"quotes"', "single'quotes"],
        numbers: [0, -1, 1.5, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER],
        booleans: [true, false],
        nested: {
          deep: {
            structure: {
              value: 'deeply nested'
            }
          }
        }
      },
      config: {},
      shareableUrl: null
    };

    await bfj.write(tempFilePath, edgeCaseData, { space: 2 });
    
    const content = fs.readFileSync(tempFilePath, 'utf8');
    const parsed = JSON.parse(content);

    expect(parsed.results.nullValue).toBeNull();
    expect(parsed.results).not.toHaveProperty('undefinedValue');
    expect(parsed.results.emptyArray).toEqual([]);
    expect(parsed.results.emptyObject).toEqual({});
    expect(parsed.results.specialStrings).toContain('"quotes"');
    expect(parsed.results.nested.deep.structure.value).toBe('deeply nested');
  });
});