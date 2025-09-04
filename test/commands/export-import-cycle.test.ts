import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Command } from 'commander';
import { exportCommand } from '../../src/commands/export';
import { importCommand } from '../../src/commands/import';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import logger from '../../src/logger';
import type { UnifiedConfig } from '../../src/types';

// Don't mock fs - we need real file operations for this test
jest.unmock('fs');

jest.mock('../../src/telemetry', () => ({
  record: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
}));

jest.mock('../../src/globalConfig/accounts', () => ({
  getUserEmail: jest.fn().mockReturnValue('test@example.com'),
}));

// Mock database to avoid better-sqlite3 binding issues
jest.mock('../../src/database', () => ({
  getDb: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnValue([]),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    run: jest.fn(),
    delete: jest.fn().mockReturnThis(),
    transaction: jest.fn((cb) =>
      cb({
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        run: jest.fn(),
        delete: jest.fn().mockReturnThis(),
      }),
    ),
  })),
}));

// Create temporary directory for test files
const tmpDir = path.join(__dirname, '.tmp-export-import-test');

describe('Export/Import Cycle', () => {
  let mockExit: jest.SpyInstance;

  beforeAll(() => {
    // Always create fresh directory
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    // Clean up temp directory
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
      if (code === 1) {
        throw new Error(`Process exited with code ${code}`);
      }
      return undefined as never;
    });
  });

  afterEach(() => {
    mockExit.mockRestore();
  });

  it.skip('should successfully export and import a v3 eval (current format)', async () => {
    // Create a mock eval with v3 data
    const evalId = `eval-test-${uuidv4()}`;
    const exportPath = path.join(tmpDir, `${evalId}.json`);

    const mockEval = {
      id: evalId,
      createdAt: '2024-10-20T00:00:00.000Z',
      author: 'test@example.com',
      config: {
        prompts: ['test-prompt.txt'],
        providers: ['openai:gpt-3.5-turbo'],
        tests: [
          { vars: { question: 'What is 2+2?' } },
          { vars: { question: 'What is the capital of France?' } },
        ],
      } as Partial<UnifiedConfig>,
      toEvaluateSummary: jest.fn().mockResolvedValue({
        version: 3,
        timestamp: '2024-10-20T00:00:00.000Z',
        prompts: [
          { raw: 'Answer: {{question}}', label: 'test-prompt', provider: 'openai:gpt-3.5-turbo' },
        ],
        results: [
          {
            provider: { id: 'openai:gpt-3.5-turbo', label: 'OpenAI GPT-3.5' },
            prompt: { raw: 'Answer: What is 2+2?', label: 'test-prompt' },
            vars: { question: 'What is 2+2?' },
            response: { output: '4' },
            success: true,
            score: 1.0,
            testIdx: 0,
            promptIdx: 0,
          },
          {
            provider: { id: 'openai:gpt-3.5-turbo', label: 'OpenAI GPT-3.5' },
            prompt: { raw: 'Answer: What is the capital of France?', label: 'test-prompt' },
            vars: { question: 'What is the capital of France?' },
            response: { output: 'Paris' },
            success: true,
            score: 1.0,
            testIdx: 1,
            promptIdx: 0,
          },
        ],
        stats: { successes: 2, failures: 0, tokenUsage: { total: 50, prompt: 20, completion: 30 } },
      }),
    };

    // Mock Eval.findById for export
    jest.spyOn(Eval, 'findById').mockResolvedValue(mockEval as any);

    // Test Export
    const exportProgram = new Command();
    exportCommand(exportProgram);

    await exportProgram.parseAsync(['node', 'test', 'export', evalId, '--output', exportPath]);

    // Verify export
    expect(fs.existsSync(exportPath)).toBe(true);
    const exportedData = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));

    // Debug: log the exported data structure
    // console.log('Exported data keys:', Object.keys(exportedData));
    // console.log('Has config?', 'config' in exportedData);

    expect(exportedData).toMatchObject({
      evalId,
      results: {
        version: 3,
        timestamp: '2024-10-20T00:00:00.000Z',
        prompts: expect.any(Array),
        results: expect.arrayContaining([
          expect.objectContaining({
            success: true,
            score: 1.0,
          }),
        ]),
        stats: expect.objectContaining({
          successes: 2,
          failures: 0,
        }),
      },
      config: mockEval.config,
      shareableUrl: null, // Add this field
      metadata: expect.objectContaining({
        promptfooVersion: expect.any(String),
        nodeVersion: expect.any(String),
        platform: expect.any(String),
      }),
    });

    // Test Import
    const importProgram = new Command();
    importCommand(importProgram);

    // Verify the file was created
    expect(fs.existsSync(exportPath)).toBe(true);
    const fileContent = fs.readFileSync(exportPath, 'utf-8');
    expect(fileContent).toBeTruthy();

    // Mock the database and models for import
    const mockEvalWithPrompts = {
      id: evalId,
      prompts: [],
      addPrompts: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(Eval, 'create').mockResolvedValue(mockEvalWithPrompts as any);
    jest.spyOn(EvalResult, 'createManyFromEvaluateResult').mockResolvedValue([]);

    // Import with new ID to avoid collision
    await importProgram.parseAsync(['node', 'test', 'import', exportPath, '--new-id']);

    // Verify import was called correctly
    expect(Eval.create).toHaveBeenCalledWith(
      mockEval.config,
      exportedData.results.prompts,
      expect.objectContaining({
        author: expect.any(String),
        createdAt: expect.any(Date),
      }),
    );

    expect(EvalResult.createManyFromEvaluateResult).toHaveBeenCalledWith(
      exportedData.results.results,
      expect.any(String),
      { returnInstances: false },
    );
  });

  it('should handle v3 format import', async () => {
    const v3File = path.join(tmpDir, 'test-v3.json');

    const v3Data = {
      id: 'eval-v3-test',
      createdAt: '2024-10-20T00:00:00.000Z',
      author: 'test@example.com',
      results: {
        version: 3,
        timestamp: '2024-10-20T00:00:00.000Z',
        prompts: [
          {
            raw: 'Answer: {{question}}',
            label: 'test-prompt',
            provider: 'openai:gpt-3.5-turbo',
          },
        ],
        results: [
          {
            provider: { id: 'openai:gpt-3.5-turbo', label: 'OpenAI GPT-3.5' },
            prompt: { raw: 'Answer: What is 2+2?', label: 'test-prompt' },
            promptId: 'test-prompt-id',
            vars: { question: 'What is 2+2?' },
            response: { output: '4' },
            success: true,
            score: 1.0,
            testIdx: 0,
            promptIdx: 0,
            testCase: { vars: { question: 'What is 2+2?' } },
          },
        ],
        stats: { successes: 1, failures: 0 },
      },
      config: { prompts: ['test-prompt.txt'] },
    };

    fs.writeFileSync(v3File, JSON.stringify(v3Data, null, 2));

    const importProgram = new Command();
    importCommand(importProgram);

    // Mock the database and models for import
    const mockEvalWithPrompts = {
      id: 'eval-v3-test',
      prompts: [],
      addPrompts: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(Eval, 'create').mockResolvedValue(mockEvalWithPrompts as any);
    jest.spyOn(EvalResult, 'createManyFromEvaluateResult').mockResolvedValue([]);

    await importProgram.parseAsync(['node', 'test', 'import', v3File, '--new-id']);

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringMatching(/^Eval with ID .+ has been successfully imported\.$/),
    );
  });

  it('should handle v2 legacy format correctly', async () => {
    const v2File = path.join(tmpDir, 'test-v2.json');

    const v2Data = {
      id: 'eval-v2-legacy',
      createdAt: '2024-01-01T00:00:00.000Z',
      author: 'legacy@example.com',
      description: 'Legacy v2 eval',
      results: {
        version: 2,
        timestamp: '2024-01-01T00:00:00.000Z',
        results: [
          {
            prompt: { raw: 'test', label: 'test' },
            vars: { x: 1 },
            response: { output: 'result' },
            success: true,
            score: 1.0,
          },
        ],
        table: {
          head: { prompts: [{ raw: 'test', label: 'test' }], vars: ['x'] },
          body: [{ outputs: ['result'], vars: ['1'] }],
        },
        stats: { successes: 1, failures: 0 },
      },
      config: { prompts: ['test.txt'] },
    };

    fs.writeFileSync(v2File, JSON.stringify(v2Data, null, 2));

    const importProgram = new Command();
    importCommand(importProgram);

    // Mock database insert for v2
    const mockDb = {
      transaction: jest.fn(async (cb) => {
        await cb({
          insert: jest.fn().mockReturnThis(),
          values: jest.fn().mockReturnThis(),
          run: jest.fn(),
          delete: jest.fn().mockReturnThis(),
        });
      }),
    };

    jest.mock('../../src/database', () => ({
      getDb: jest.fn(() => mockDb),
    }));

    await importProgram.parseAsync(['node', 'test', 'import', v2File]);

    expect(logger.info).toHaveBeenCalledWith(
      `Eval with ID eval-v2-legacy has been successfully imported.`,
    );
  });
});
