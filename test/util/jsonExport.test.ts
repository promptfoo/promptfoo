import * as fs from 'fs';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as blobs from '../../src/blobs';
import EvalResult, { sanitizeResultForJsonlArtifact } from '../../src/models/evalResult';
import { getTraceStore } from '../../src/tracing/store';
import { writeOutput } from '../../src/util/index';
import { sanitizeObject } from '../../src/util/sanitizer';
import { createEvaluateResult } from '../factories/eval';
import { createTempDir, mockProcessEnv, removeTempDir } from './utils';

// Mock dependencies
vi.mock('../../src/database', () => ({
  getDb: vi.fn().mockReturnValue({
    select: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
  }),
}));

vi.mock('../../src/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('JSON export with improved error handling', () => {
  let tempDir: string;
  let tempFilePath: string;
  let mockEval: any;

  beforeEach(() => {
    tempDir = createTempDir('promptfoo-json-test-');
    tempFilePath = path.join(tempDir, 'test-export.json');

    mockEval = {
      id: 'test-eval-id',
      createdAt: '2025-01-01T00:00:00.000Z',
      author: 'test-author',
      config: { testConfig: true },
      prompts: [
        { raw: 'Test prompt 1', label: 'prompt1' },
        { raw: 'Test prompt 2', label: 'prompt2' },
      ],
      toEvaluateSummary: vi.fn(),
      getResultsCount: vi.fn(),
    };
  });

  afterEach(() => {
    removeTempDir(tempDir);
    vi.clearAllMocks();
  });

  describe('normal JSON export', () => {
    beforeEach(() => {
      mockEval.toEvaluateSummary.mockResolvedValue({
        version: 3,
        timestamp: '2025-01-01T00:00:00.000Z',
        prompts: mockEval.prompts,
        results: [
          { testIdx: 0, promptIdx: 0, success: true, score: 1.0 },
          { testIdx: 1, promptIdx: 0, success: true, score: 0.9 },
        ],
        stats: {
          successes: 2,
          failures: 0,
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        },
      });
    });

    it('should export JSON successfully', async () => {
      await writeOutput(tempFilePath, mockEval, 'https://share.url');

      expect(fs.existsSync(tempFilePath)).toBe(true);
      const content = fs.readFileSync(tempFilePath, 'utf8');
      const parsed = JSON.parse(content);

      // Verify structure matches expected OutputFile format
      expect(parsed).toHaveProperty('evalId', 'test-eval-id');
      expect(parsed).toHaveProperty('results');
      expect(parsed.results).toHaveProperty('version', 3);
      expect(parsed.results.results).toHaveLength(2);
      expect(parsed).toHaveProperty('config', { testConfig: true });
      expect(parsed).toHaveProperty('shareableUrl', 'https://share.url');
      expect(parsed).toHaveProperty('metadata');
    });

    it('should export persisted vars and runtime options for round-trip imports', async () => {
      mockEval.vars = ['topic', 'tone'];
      mockEval.runtimeOptions = { cache: false, maxConcurrency: 2 };

      await writeOutput(tempFilePath, mockEval, null);

      const content = fs.readFileSync(tempFilePath, 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed).toHaveProperty('vars', ['topic', 'tone']);
      expect(parsed).toHaveProperty('runtimeOptions', { cache: false, maxConcurrency: 2 });
    });

    it('should embed referenced blob bytes only when media export is enabled', async () => {
      const hash = 'a'.repeat(64);
      const data = Buffer.from('portable image');
      mockEval.toEvaluateSummary.mockResolvedValue({
        version: 3,
        timestamp: '2025-01-01T00:00:00.000Z',
        prompts: mockEval.prompts,
        results: [{ response: { output: `promptfoo://blob/${hash}` } }],
        stats: { successes: 1, failures: 0 },
      });
      vi.spyOn(blobs, 'getBlobByHash').mockResolvedValue({
        data,
        metadata: {
          mimeType: 'image/png',
          sizeBytes: data.length,
          createdAt: '2025-01-01T00:00:00.000Z',
          provider: 'filesystem',
          key: hash,
        },
      });

      await writeOutput(tempFilePath, mockEval, null);
      expect(JSON.parse(fs.readFileSync(tempFilePath, 'utf8'))).not.toHaveProperty('blobAssets');

      await writeOutput(tempFilePath, mockEval, null, { includeMedia: true });
      const parsed = JSON.parse(fs.readFileSync(tempFilePath, 'utf8'));
      expect(parsed.blobAssets).toEqual([
        {
          hash,
          mimeType: 'image/png',
          sizeBytes: data.length,
          data: data.toString('base64'),
        },
      ]);
    });

    it('should embed blob bytes referenced only by exported traces', async () => {
      const hash = 'b'.repeat(64);
      const data = Buffer.from('portable trace image');
      const traceSpy = vi.spyOn(getTraceStore(), 'getTracesByEvaluation').mockResolvedValue([
        {
          traceId: 'trace-media-export',
          evaluationId: mockEval.id,
          testCaseId: 'trace-media-case',
          metadata: { attachment: `promptfoo://blob/${hash}` },
          spans: [],
        },
      ]);
      vi.spyOn(blobs, 'getBlobByHash').mockResolvedValue({
        data,
        metadata: {
          mimeType: 'image/png',
          sizeBytes: data.length,
          createdAt: '2025-01-01T00:00:00.000Z',
          provider: 'filesystem',
          key: hash,
        },
      });

      try {
        await writeOutput(tempFilePath, mockEval, null, { includeMedia: true });

        const parsed = JSON.parse(fs.readFileSync(tempFilePath, 'utf8'));
        expect(parsed.traces[0].metadata.attachment).toBe(`promptfoo://blob/${hash}`);
        expect(parsed.blobAssets).toEqual([
          {
            hash,
            mimeType: 'image/png',
            sizeBytes: data.length,
            data: data.toString('base64'),
          },
        ]);
      } finally {
        traceSpy.mockRestore();
      }
    });

    it('should not embed response blob bytes when response output stripping is enabled', async () => {
      const restoreEnv = mockProcessEnv({ PROMPTFOO_STRIP_RESPONSE_OUTPUT: 'true' });
      const hash = 'c'.repeat(64);
      const getBlobSpy = vi.spyOn(blobs, 'getBlobByHash');
      mockEval.toEvaluateSummary.mockResolvedValue({
        version: 3,
        timestamp: '2025-01-01T00:00:00.000Z',
        prompts: mockEval.prompts,
        results: [
          {
            response: {
              output: '[output stripped]',
              metadata: { blobUris: [`promptfoo://blob/${hash}`] },
            },
          },
        ],
        stats: { successes: 1, failures: 0 },
      });

      try {
        await writeOutput(tempFilePath, mockEval, null, { includeMedia: true });

        const parsed = JSON.parse(fs.readFileSync(tempFilePath, 'utf8'));
        expect(parsed.results.results[0].response.metadata.blobUris).toBeUndefined();
        expect(parsed).not.toHaveProperty('blobAssets');
        expect(getBlobSpy).not.toHaveBeenCalled();
      } finally {
        getBlobSpy.mockRestore();
        restoreEnv();
      }
    });

    it('should handle null shareableUrl', async () => {
      await writeOutput(tempFilePath, mockEval, null);

      const content = fs.readFileSync(tempFilePath, 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed.shareableUrl).toBeNull();
    });

    it('should maintain proper JSON formatting', async () => {
      await writeOutput(tempFilePath, mockEval, 'https://test.url');

      const content = fs.readFileSync(tempFilePath, 'utf8');

      // Verify proper 2-space indentation
      expect(content).toContain('{\n  "evalId":');
      expect(content).toContain('  "results": {');
      expect(content).toContain('    "version":');

      // Should be valid JSON
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('should include all required metadata fields', async () => {
      await writeOutput(tempFilePath, mockEval, 'https://test.url');

      const content = fs.readFileSync(tempFilePath, 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed.metadata).toHaveProperty('promptfooVersion');
      expect(parsed.metadata).toHaveProperty('nodeVersion');
      expect(parsed.metadata).toHaveProperty('platform');
      expect(parsed.metadata).toHaveProperty('exportedAt');
      expect(parsed.metadata).toHaveProperty('author', 'test-author');
    });
  });

  describe('deep credential sanitation failures', () => {
    it('retains the explicit non-throwing sanitizer policy outside artifact exports', () => {
      const input = '{"child":'.repeat(4000) + '{"apiKey":"fixture credential"}' + '}'.repeat(4000);
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        expect(sanitizeObject(input, { maxDepth: Infinity, throwOnError: false })).toBe(input);
        expect(errorLog).toHaveBeenCalledWith(
          expect.stringContaining('Error sanitizing'),
          expect.any(RangeError),
        );
      } finally {
        errorLog.mockRestore();
      }
    });

    it.each([
      [
        'object JSON',
        '{"apiKey":"fixture credential","value":"public"}',
        '{"apiKey":"[REDACTED]","value":"public"}',
      ],
      [
        'array JSON',
        '[{"apiKey":"fixture credential"},{"value":"public"}]',
        '[{"apiKey":"[REDACTED]"},{"value":"public"}]',
      ],
      ['number JSON', ' 42 ', ' 42 '],
      ['boolean JSON', 'true', 'true'],
      ['null JSON', 'null', 'null'],
      ['string JSON', '"public text"', '"public text"'],
      ['invalid JSON', '{invalid public JSON', '{invalid public JSON'],
      ['ordinary text', 'ordinary public text', 'ordinary public text'],
      [
        'form text',
        'apiKey=fixture%20credential&value=public',
        'apiKey=%5BREDACTED%5D&value=public',
      ],
    ])(
      'preserves %s parsing and redaction semantics during export',
      async (_label, input, expected) => {
        const vars = { payload: input };
        mockEval.toEvaluateSummary.mockResolvedValue({
          version: 3,
          prompts: [],
          results: [{ success: true, score: 1, vars }],
          stats: { successes: 1, failures: 0, errors: 0, tokenUsage: {} },
        });
        await writeOutput(tempFilePath, mockEval, null);
        const output = JSON.parse(fs.readFileSync(tempFilePath, 'utf8'));
        expect(output.results.results[0].vars.payload).toBe(expected);
        expect(vars.payload).toBe(input);
      },
    );

    it.each([
      'vars',
      'JSON-string vars',
      'prompt config',
      'aggregate prompt config',
      'provider config',
    ])('never writes unsanitized serializable %s when recursive sanitation fails', async (slot) => {
      const depth = 4000;
      // Build JSON without recursively stringifying the fixture: that can overflow
      // Node's stack on Windows before the real export sanitizer is exercised.
      const original =
        '{"child":'.repeat(depth) +
        '{"apiKey":"deep-credential-must-not-be-exported"}' +
        '}'.repeat(depth);
      const nested = JSON.parse(original);
      let originalLeaf = nested;
      for (let i = 0; i < depth; i++) {
        originalLeaf = originalLeaf.child;
      }
      expect(original).toContain('deep-credential-must-not-be-exported');
      const row: Record<string, unknown> = { success: true, score: 1 };
      const prompts: unknown[] = [];
      if (slot === 'vars') {
        row.vars = nested;
      } else if (slot === 'JSON-string vars') {
        row.vars = { payload: original };
      } else if (slot === 'prompt config') {
        row.prompt = { raw: 'hello', label: 'hello', config: nested };
      } else if (slot === 'provider config') {
        row.provider = { id: 'echo', config: nested };
      } else {
        prompts.push({ raw: 'hello', label: 'hello', config: nested });
      }
      mockEval.toEvaluateSummary.mockResolvedValue({
        version: 3,
        timestamp: '2025-01-01T00:00:00.000Z',
        prompts,
        results: [row],
        stats: { successes: 1, failures: 0, errors: 0, tokenUsage: {} },
      });
      let writeError: unknown;
      try {
        await writeOutput(tempFilePath, mockEval, null);
      } catch (error) {
        writeError = error;
      }
      if (writeError) {
        expect(fs.existsSync(tempFilePath)).toBe(false);
      } else {
        const content = fs.readFileSync(tempFilePath, 'utf8');
        expect(content.includes('deep-credential-must-not-be-exported')).toBe(false);
      }
      let leaf = nested;
      for (let i = 0; i < depth; i++) {
        expect(Object.keys(leaf)).toEqual(['child']);
        leaf = leaf.child;
      }
      expect(leaf).toBe(originalLeaf);
      expect(leaf).toEqual({ apiKey: 'deep-credential-must-not-be-exported' });
    });

    it('redacts deep aggregate configuration and preserves its safe sibling and source object', async () => {
      const config = {
        options: { provider: { config: { apiKey: 'aggregate credential', temperature: 0.2 } } },
      };
      const prompt = { id: 'a'.repeat(64), raw: 'hello', label: 'friendly label', config };
      const original = structuredClone(prompt);
      mockEval.toEvaluateSummary.mockResolvedValue({
        version: 3,
        prompts: [prompt],
        results: [],
        stats: { successes: 0, failures: 0, errors: 0, tokenUsage: {} },
      });
      await writeOutput(tempFilePath, mockEval, null);
      const content = fs.readFileSync(tempFilePath, 'utf8');
      const output = JSON.parse(content).results.prompts[0];
      expect(output.config.options.provider.config).toEqual({
        apiKey: '[REDACTED]',
        temperature: 0.2,
      });
      expect(output.id).toBe(prompt.id);
      expect(output.raw).toBe('hello');
      expect(content).not.toContain('aggregate credential');
      expect(prompt).toEqual(original);
    });
  });

  describe.each([2, 3])('known transcript projection in V%s artifacts', (version) => {
    it.each(['none', 'prompt', 'output', 'vars', 'grading', 'metadata', 'prompt+output', 'all'])(
      'honors independent %s stripping across schema copies without mutating inputs',
      async (flag) => {
        const strips = (category: string) => flag === 'all' || flag.split('+').includes(category);
        const restoreEnv = mockProcessEnv({
          PROMPTFOO_STRIP_PROMPT_TEXT: String(strips('prompt')),
          PROMPTFOO_STRIP_RESPONSE_OUTPUT: String(strips('output')),
          PROMPTFOO_STRIP_TEST_VARS: String(strips('vars')),
          PROMPTFOO_STRIP_GRADING_RESULT: String(strips('grading')),
          PROMPTFOO_STRIP_METADATA: String(strips('metadata')),
        });
        const grade = {
          pass: true,
          score: 0.75,
          reason: 'grade reason',
          tokensUsed: { total: 3 },
          metadata: { note: 'grading metadata canary' },
          opaque: {
            metadata: { note: 'opaque grading data' },
            content: 'keep opaque grade content',
          },
          componentResults: [
            {
              pass: true,
              score: 0.5,
              reason: 'component reason',
              metadata: { note: 'component metadata canary' },
              componentResults: [
                {
                  pass: true,
                  score: 1,
                  reason: 'leaf',
                  metadata: { note: 'leaf metadata canary' },
                },
              ],
            },
          ],
        };
        // GOAT and Crescendo emit prompt; imported legacy entries can use message.
        const successfulAttack = {
          turn: 2,
          prompt: 'successful input canary',
          response: 'successful output canary',
        };
        const legacySuccessfulAttack = {
          turn: 3,
          message: 'legacy attack message canary',
          response: 'legacy attack response canary',
        };
        const metadata = {
          redteamFinalPrompt: 'final input canary',
          redteamHistory: [
            {
              prompt: 'history input canary',
              promptAudio: { data: 'input audio canary', format: 'wav' },
              promptImage: { data: 'input image canary', format: 'png' },
              output: 'history output canary',
              outputAudio: { data: 'output audio canary', format: 'wav' },
              outputImage: { data: 'output image canary', format: 'png' },
              inputVars: { topic: 'turn vars canary' },
              graderPassed: true,
            },
            null,
            'legacy history entry',
          ],
          messages: [
            { role: 'system', content: 'system input canary' },
            { role: 'developer', content: 'developer input canary' },
            {
              role: 'user',
              content: [{ type: 'text', text: 'message input canary' }],
              label: 'keep label',
            },
            { role: 'assistant', content: 'assistant transcript canary' },
            null,
          ],
          successfulAttacks: [
            successfulAttack,
            legacySuccessfulAttack,
            null,
            'legacy successful attack entry',
          ],
          transformDisplayVars: { topic: 'display vars canary' },
          storedGraderResult: grade,
          totalSuccessfulAttacks: 1,
          custom: {
            prompt: 'opaque prompt',
            output: 'opaque output',
            content: 'opaque content',
            metadata: { note: 'opaque metadata' },
          },
        };
        const originalSuccessfulAttacks = metadata.successfulAttacks;
        const row = createEvaluateResult({
          provider: { id: 'raw/provider:model-id', label: 'raw model label' },
          response: { output: { http: { output: 'opaque model value' } }, metadata },
          metadata,
          gradingResult: grade,
          namedScores: { quality: 0.75 },
        });
        const original = structuredClone(row);
        const cell = {
          prompt: 'table prompt',
          text: 'table output',
          response: row.response,
          metadata,
          gradingResult: grade,
          testCase: {},
        };
        const originalCell = structuredClone(cell);
        const makeSummary = () => ({
          version,
          results: [row],
          stats: { successes: 1, failures: 0, errors: 0, tokenUsage: {} },
          ...(version === 2
            ? {
                table: {
                  head: { prompts: [], vars: [] },
                  body: [{ vars: [], test: {}, outputs: [cell] }],
                },
              }
            : { prompts: [] }),
        });
        const kept = (category: string, value: unknown) => (strips(category) ? undefined : value);
        const checkGrade = (result: Record<string, any> | null) => {
          if (strips('grading')) {
            expect(result).toBeNull();
            return;
          }
          expect(result).toMatchObject({
            pass: true,
            score: 0.75,
            reason: 'grade reason',
            tokensUsed: { total: 3 },
          });
          expect(result!.opaque).toEqual(grade.opaque);
          for (const component of [
            result!,
            result!.componentResults[0],
            result!.componentResults[0].componentResults[0],
          ]) {
            expect(component.metadata === undefined).toBe(strips('metadata'));
          }
        };
        const checkMetadata = (copy: Record<string, any>) => {
          const history = copy.redteamHistory[0];
          const originalHistory = metadata.redteamHistory[0] as Record<string, unknown>;
          for (const key of ['prompt', 'promptAudio', 'promptImage']) {
            expect(history[key]).toEqual(kept('prompt', originalHistory[key]));
          }
          for (const key of ['output', 'outputAudio', 'outputImage']) {
            expect(history[key]).toEqual(kept('output', originalHistory[key]));
          }
          expect(copy.redteamFinalPrompt).toEqual(kept('prompt', metadata.redteamFinalPrompt));
          expect(history.inputVars).toEqual(kept('vars', originalHistory.inputVars));
          expect(copy.transformDisplayVars).toEqual(kept('vars', metadata.transformDisplayVars));
          expect(copy.successfulAttacks[0].prompt).toEqual(kept('prompt', successfulAttack.prompt));
          expect(copy.successfulAttacks[0].response).toEqual(
            kept('output', successfulAttack.response),
          );
          expect(copy.successfulAttacks[0].turn).toBe(successfulAttack.turn);
          expect(copy.successfulAttacks[1].message).toEqual(
            kept('prompt', legacySuccessfulAttack.message),
          );
          expect(copy.successfulAttacks[1].response).toEqual(
            kept('output', legacySuccessfulAttack.response),
          );
          expect(copy.successfulAttacks[1].turn).toBe(legacySuccessfulAttack.turn);
          expect(copy.successfulAttacks.slice(2)).toEqual([null, 'legacy successful attack entry']);
          expect(copy.storedGraderResult).toEqual(kept('grading', grade));
          for (const [index, message] of copy.messages.slice(0, 3).entries()) {
            expect(message.content).toEqual(kept('prompt', metadata.messages[index]?.content));
          }
          // Assistant turns can be reused as inputs by stateless conversation providers.
          expect(copy.messages[3].content === undefined).toBe(strips('prompt') || strips('output'));
          expect(copy.messages[2].label).toBe('keep label');
          expect(copy.messages[4]).toBeNull();
          expect(copy.redteamHistory.slice(1)).toEqual([null, 'legacy history entry']);
          expect(copy.custom).toEqual(metadata.custom);
          expect(copy.totalSuccessfulAttacks).toBe(1);
          expect(history.graderPassed).toBe(true);
          if (flag === 'none') {
            expect(copy).toEqual(metadata);
          }
        };
        const check = (projected: Record<string, any>) => {
          expect(projected.namedScores ?? row.namedScores).toEqual({ quality: 0.75 });
          checkGrade(projected.gradingResult);
          if (strips('metadata')) {
            expect(projected.metadata).toEqual({});
            expect(projected.response.metadata).toBeUndefined();
          } else {
            checkMetadata(projected.metadata);
            checkMetadata(projected.response.metadata);
          }
          expect(projected.response.output).toEqual(
            strips('output') ? '[output stripped]' : row.response!.output,
          );
        };
        const checkSerialized = (content: string) => {
          const canaries = {
            prompt: [
              'history input canary',
              'input audio canary',
              'input image canary',
              'message input canary',
              'successful input canary',
              'legacy attack message canary',
            ],
            output: [
              'history output canary',
              'output audio canary',
              'output image canary',
              'successful output canary',
              'legacy attack response canary',
            ],
            vars: ['turn vars canary', 'display vars canary'],
            grading: ['grade reason', 'component reason'],
            metadata: [
              'grading metadata canary',
              'component metadata canary',
              'leaf metadata canary',
            ],
          };
          for (const [category, values] of Object.entries(canaries)) {
            if (strips(category) || (strips('metadata') && category !== 'grading')) {
              for (const value of values) {
                expect(content).not.toContain(value);
              }
            }
          }
        };
        try {
          // Exercise JSONL and model projections as well as the real format writers.
          const jsonlArtifact = sanitizeResultForJsonlArtifact(row);
          check(jsonlArtifact);
          checkSerialized(`${JSON.stringify(jsonlArtifact)}\n`);
          const model = new EvalResult({
            ...row,
            response: row.response ?? null,
            gradingResult: row.gradingResult ?? null,
            id: 'fixture-result',
            evalId: 'fixture-eval',
          });
          check(model.toEvaluateResult());
          for (const extension of ['json', 'yaml', 'txt', 'xml']) {
            mockEval.toEvaluateSummary.mockImplementation(async () => makeSummary());
            const file = path.join(tempDir, `transcript.${extension}`);
            await writeOutput(file, mockEval, null);
            const content = fs.readFileSync(file, 'utf8');
            checkSerialized(content);
            if (extension === 'json') {
              const exported = JSON.parse(content);
              check(exported.results.results[0]);
              expect(exported.results.results[0].provider).toEqual(row.provider);
              if (version === 2) {
                check(exported.results.table.body[0].outputs[0]);
              }
            }
          }
          expect(row).toEqual(original);
          expect(cell).toEqual(originalCell);
          expect(model.response).toBe(row.response);
          expect(model.gradingResult).toBe(grade);
          expect(row.metadata).toBe(metadata);
          expect(row.response!.metadata).toBe(metadata);
          expect(cell.metadata).toBe(metadata);
          expect(metadata.successfulAttacks).toBe(originalSuccessfulAttacks);
          expect(metadata.successfulAttacks[0]).toBe(successfulAttack);
          expect(metadata.successfulAttacks[1]).toBe(legacySuccessfulAttack);
        } finally {
          restoreEnv();
        }
      },
    );
  });

  describe('memory limit error handling', () => {
    beforeEach(() => {
      mockEval.getResultsCount.mockResolvedValue(50000);
      mockEval.toEvaluateSummary.mockImplementation(() => {
        throw new RangeError('Invalid string length');
      });
    });

    it('should handle RangeError gracefully with helpful message', async () => {
      await expect(writeOutput(tempFilePath, mockEval, null)).rejects.toThrow(
        'Dataset too large for JSON export',
      );

      await expect(writeOutput(tempFilePath, mockEval, null)).rejects.toThrow(
        'Consider using JSONL format instead',
      );
    });

    it('should include result count in error message', async () => {
      await expect(writeOutput(tempFilePath, mockEval, null)).rejects.toThrow('50000 results');
    });

    it('should not create output file when memory error occurs', async () => {
      try {
        await writeOutput(tempFilePath, mockEval, null);
      } catch (_error) {
        // Expected to throw
      }

      expect(fs.existsSync(tempFilePath)).toBe(false);
    });
  });

  describe('other error handling', () => {
    it('should propagate non-RangeError exceptions', async () => {
      const testError = new Error('Database connection failed');
      mockEval.toEvaluateSummary.mockRejectedValue(testError);

      await expect(writeOutput(tempFilePath, mockEval, null)).rejects.toThrow(
        'Database connection failed',
      );
    });

    it('should handle file system errors', async () => {
      // Use a path that will definitely fail - writing to a file that already exists as a directory
      const dirAsFile = path.join(tempDir, 'directory-as-file');
      fs.mkdirSync(dirAsFile);
      const invalidPath = dirAsFile; // Try to write to a directory path as if it were a file

      mockEval.toEvaluateSummary.mockResolvedValue({
        version: 3,
        results: [],
        stats: { successes: 0, failures: 0 },
      });

      await expect(writeOutput(invalidPath, mockEval, null)).rejects.toThrow();
    });
  });

  describe('backward compatibility', () => {
    it('should maintain exact same JSON structure as original implementation', async () => {
      const expectedSummary = {
        version: 3,
        timestamp: '2025-01-01T00:00:00.000Z',
        prompts: [
          { raw: 'Test prompt 1', label: 'prompt1' },
          { raw: 'Test prompt 2', label: 'prompt2' },
        ],
        results: [
          {
            testIdx: 0,
            promptIdx: 0,
            success: true,
            score: 1.0,
            vars: { input: 'test' },
            output: 'response',
          },
        ],
        stats: {
          successes: 1,
          failures: 0,
          errors: 0,
          tokenUsage: { total: 100, prompt: 50, completion: 50 },
        },
      };

      mockEval.toEvaluateSummary.mockResolvedValue(expectedSummary);

      await writeOutput(tempFilePath, mockEval, 'https://share.url');

      const content = fs.readFileSync(tempFilePath, 'utf8');
      const parsed = JSON.parse(content);

      // Verify exact structure
      expect(Object.keys(parsed).sort()).toEqual(
        ['evalId', 'results', 'config', 'shareableUrl', 'metadata'].sort(),
      );

      expect(parsed.results).toEqual(expectedSummary);
    });

    it('should handle both EvaluateSummaryV2 and V3 formats', async () => {
      const v2Summary = {
        version: 2,
        timestamp: '2025-01-01T00:00:00.000Z',
        results: [{ testIdx: 0, success: true }],
        table: { head: { prompts: [], vars: [] }, body: [] },
        stats: { successes: 1, failures: 0 },
      };

      mockEval.toEvaluateSummary.mockResolvedValue(v2Summary);

      await writeOutput(tempFilePath, mockEval, null);

      const content = fs.readFileSync(tempFilePath, 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed.results.version).toBe(2);
      expect(parsed.results).toHaveProperty('table');
      expect(parsed.results.results).toEqual([{ testIdx: 0, success: true }]);
    });
  });

  describe('performance considerations', () => {
    it('should complete export in reasonable time for moderate datasets', async () => {
      // Create a moderate-sized dataset
      const moderateResults = Array.from({ length: 1000 }, (_, i) => ({
        testIdx: i,
        promptIdx: 0,
        success: true,
        score: Math.random(),
        vars: { input: `test input ${i}` },
        output: `test output ${i}`,
      }));

      mockEval.toEvaluateSummary.mockResolvedValue({
        version: 3,
        timestamp: '2025-01-01T00:00:00.000Z',
        prompts: mockEval.prompts,
        results: moderateResults,
        stats: { successes: 1000, failures: 0 },
      });

      const startTime = Date.now();
      await writeOutput(tempFilePath, mockEval, null);
      const duration = Date.now() - startTime;

      // Should complete within reasonable time (5 seconds for 1000 results)
      expect(duration).toBeLessThan(5000);

      // Verify file was created and has content
      expect(fs.existsSync(tempFilePath)).toBe(true);
      const stats = fs.statSync(tempFilePath);
      expect(stats.size).toBeGreaterThan(1000); // Should have substantial content
    }, 10000); // 10 second timeout
  });
});
