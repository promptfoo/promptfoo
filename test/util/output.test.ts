import * as fsPromises from 'fs/promises';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { getDb } from '../../src/database/index';
import * as googleSheets from '../../src/googleSheets';
import Eval from '../../src/models/eval';
import { type EvaluateResult, ResultFailureReason } from '../../src/types/index';
import { createOutputMetadata, writeMultipleOutputs, writeOutput } from '../../src/util/output';

vi.mock('../../src/database', () => ({
  getDb: vi.fn(),
}));

vi.mock('proxy-agent', () => ({
  ProxyAgent: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    statSync: vi.fn(),
    readdirSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

const mockFileHandle = vi.hoisted(() => ({
  write: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  appendFile: vi.fn(),
  mkdir: vi.fn(),
  open: vi.fn().mockResolvedValue(mockFileHandle),
}));

vi.mock('../../src/googleSheets', () => ({
  writeCsvToGoogleSheet: vi.fn(),
}));

describe('writeOutput', () => {
  let consoleLogSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    // Restore mock implementations that vi.resetAllMocks() clears
    mockFileHandle.write.mockResolvedValue(undefined);
    mockFileHandle.close.mockResolvedValue(undefined);
    vi.mocked(fsPromises.open).mockResolvedValue(
      mockFileHandle as unknown as fsPromises.FileHandle,
    );
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // @ts-ignore
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    vi.resetAllMocks();
  });

  it('writeOutput with CSV output', async () => {
    // @ts-ignore
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const outputPath = 'output.csv';
    const results: EvaluateResult[] = [
      {
        success: true,
        failureReason: ResultFailureReason.NONE,
        score: 1.0,
        namedScores: {},
        latencyMs: 1000,
        provider: {
          id: 'foo',
        },
        prompt: {
          raw: 'Test prompt',
          label: '[display] Test prompt',
        },
        response: {
          output: 'Test output',
        },
        vars: {
          var1: 'value1',
          var2: 'value2',
        },
        promptIdx: 0,
        testIdx: 0,
        testCase: {},
        promptId: 'foo',
      },
    ];
    const eval_ = new Eval({});
    await eval_.addResult(results[0]);

    const shareableUrl = null;
    await writeOutput(outputPath, eval_, shareableUrl);

    // CSV uses file handle streaming for memory-efficient export
    // Headers are always written even when database returns no results
    expect(fsPromises.open).toHaveBeenCalledWith(outputPath, 'w');
    expect(mockFileHandle.write).toHaveBeenCalled(); // Headers written
    expect(mockFileHandle.close).toHaveBeenCalled();
  });

  it('writeOutput with JSON output', async () => {
    const outputPath = 'output.json';
    const eval_ = new Eval({});
    await writeOutput(outputPath, eval_, null);

    expect(fsPromises.writeFile).toHaveBeenCalledTimes(1);
  });

  it('writeOutput with YAML output', async () => {
    const outputPath = 'output.yaml';
    const eval_ = new Eval({});
    await writeOutput(outputPath, eval_, null);

    expect(fsPromises.writeFile).toHaveBeenCalledTimes(1);
  });

  it('writeOutput with XML output', async () => {
    const outputPath = 'output.xml';
    const eval_ = new Eval({});
    await writeOutput(outputPath, eval_, null);

    expect(fsPromises.writeFile).toHaveBeenCalledTimes(1);
  });

  it('writeOutput with json and txt output', async () => {
    const outputPath = ['output.json', 'output.txt'];
    const eval_ = new Eval({});

    await writeMultipleOutputs(outputPath, eval_, null);

    expect(fsPromises.writeFile).toHaveBeenCalledTimes(2);
  });

  it('writeOutput with HTML template escapes special characters', async () => {
    // Use the real fs module to read the template
    const realFs = await vi.importActual<typeof import('fs')>('fs');
    const templatePath = path.resolve(__dirname, '../../src/tableOutput.html');
    const templateContent = realFs.readFileSync(templatePath, 'utf-8');

    // Check that the template has escape filters on all user-provided content
    expect(templateContent).toContain('{{ header | escape }}');
    expect(templateContent).toContain('{{ cell | escape }}');

    // Ensure both data-content attribute and cell content are escaped
    const cellRegex =
      /<td[^>]*data-content="\{\{ cell \| escape \}\}"[^>]*>\{\{ cell \| escape \}\}<\/td>/;
    expect(templateContent).toMatch(cellRegex);
  });

  it('writes output to Google Sheets', async () => {
    const outputPath = 'https://docs.google.com/spreadsheets/d/1234567890/edit#gid=0';

    const config = { description: 'Test config' };
    const shareableUrl = null;
    const eval_ = new Eval(config);

    await writeOutput(outputPath, eval_, shareableUrl);

    expect(googleSheets.writeCsvToGoogleSheet).toHaveBeenCalledTimes(1);
  });

  it('writes Google Sheets output with provider in column headers', async () => {
    const outputPath = 'https://docs.google.com/spreadsheets/d/1234567890/edit#gid=0';

    const eval_ = new Eval({});
    await eval_.addPrompts([{ raw: 'prompt1', label: 'First Prompt', provider: 'openai:gpt-4' }]);
    eval_.setVars(['input']);

    const result: EvaluateResult = {
      success: true,
      failureReason: ResultFailureReason.NONE,
      score: 1.0,
      namedScores: {},
      latencyMs: 100,
      provider: { id: 'openai:gpt-4' },
      prompt: { raw: 'prompt1', label: 'First Prompt' },
      response: { output: 'Test output' },
      vars: { input: 'test input' },
      promptIdx: 0,
      testIdx: 0,
      testCase: { vars: { input: 'test input' } },
      promptId: 'prompt1',
    };
    await eval_.addResult(result);

    await writeOutput(outputPath, eval_, null);

    expect(googleSheets.writeCsvToGoogleSheet).toHaveBeenCalledTimes(1);
    const rows = vi.mocked(googleSheets.writeCsvToGoogleSheet).mock.calls[0][0];
    expect(rows.length).toBeGreaterThan(0);

    const columnKeys = Object.keys(rows[0]);
    expect(columnKeys).toContain('[openai:gpt-4] First Prompt');
  });

  it('writes Google Sheets output with multiple providers in column headers', async () => {
    const outputPath = 'https://docs.google.com/spreadsheets/d/1234567890/edit#gid=0';

    const eval_ = new Eval({});
    await eval_.addPrompts([
      { raw: 'prompt1', label: 'Test Prompt', provider: 'openai:gpt-4' },
      { raw: 'prompt1', label: 'Test Prompt', provider: 'anthropic:claude-3' },
    ]);
    eval_.setVars(['input']);

    await eval_.addResult({
      success: true,
      failureReason: ResultFailureReason.NONE,
      score: 1.0,
      namedScores: {},
      latencyMs: 100,
      provider: { id: 'openai:gpt-4' },
      prompt: { raw: 'prompt1', label: 'Test Prompt' },
      response: { output: 'GPT-4 output' },
      vars: { input: 'test input' },
      promptIdx: 0,
      testIdx: 0,
      testCase: { vars: { input: 'test input' } },
      promptId: 'prompt1',
    });
    await eval_.addResult({
      success: true,
      failureReason: ResultFailureReason.NONE,
      score: 0.8,
      namedScores: {},
      latencyMs: 150,
      provider: { id: 'anthropic:claude-3' },
      prompt: { raw: 'prompt1', label: 'Test Prompt' },
      response: { output: 'Claude output' },
      vars: { input: 'test input' },
      promptIdx: 1,
      testIdx: 0,
      testCase: { vars: { input: 'test input' } },
      promptId: 'prompt1',
    });

    await writeOutput(outputPath, eval_, null);

    expect(googleSheets.writeCsvToGoogleSheet).toHaveBeenCalledTimes(1);
    const rows = vi.mocked(googleSheets.writeCsvToGoogleSheet).mock.calls[0][0];
    expect(rows.length).toBeGreaterThan(0);

    const columnKeys = Object.keys(rows[0]);
    expect(columnKeys).toContain('[openai:gpt-4] Test Prompt');
    expect(columnKeys).toContain('[anthropic:claude-3] Test Prompt');
  });
});

describe('createOutputMetadata', () => {
  it('should create metadata with all fields when evalRecord has all data', async () => {
    const evalRecord = {
      createdAt: new Date('2025-01-01T12:00:00.000Z').getTime(),
      author: 'test-author',
    } as any as Eval;

    const metadata = createOutputMetadata(evalRecord);

    expect(metadata).toMatchObject({
      promptfooVersion: expect.any(String),
      nodeVersion: expect.stringMatching(/^v\d+\.\d+\.\d+/),
      platform: expect.any(String),
      arch: expect.any(String),
      exportedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      evaluationCreatedAt: '2025-01-01T12:00:00.000Z',
      author: 'test-author',
    });
  });

  it('should handle missing createdAt gracefully', async () => {
    const evalRecord = {
      author: 'test-author',
    } as any as Eval;

    const metadata = createOutputMetadata(evalRecord);

    expect(metadata).toMatchObject({
      promptfooVersion: expect.any(String),
      nodeVersion: expect.stringMatching(/^v\d+\.\d+\.\d+/),
      platform: expect.any(String),
      arch: expect.any(String),
      exportedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      evaluationCreatedAt: undefined,
      author: 'test-author',
    });
  });

  it('should handle missing author', async () => {
    const evalRecord = {
      createdAt: new Date('2025-01-01T12:00:00.000Z').getTime(),
    } as any as Eval;

    const metadata = createOutputMetadata(evalRecord);

    expect(metadata).toMatchObject({
      promptfooVersion: expect.any(String),
      nodeVersion: expect.stringMatching(/^v\d+\.\d+\.\d+/),
      platform: expect.any(String),
      arch: expect.any(String),
      exportedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      evaluationCreatedAt: '2025-01-01T12:00:00.000Z',
      author: undefined,
    });
  });

  it('should handle invalid date in createdAt', async () => {
    const evalRecord = {
      createdAt: 'invalid-date',
      author: 'test-author',
    } as any as Eval;

    const metadata = createOutputMetadata(evalRecord);

    // When new Date() is given invalid input, it returns "Invalid Date"
    expect(metadata).toMatchObject({
      promptfooVersion: expect.any(String),
      nodeVersion: expect.stringMatching(/^v\d+\.\d+\.\d+/),
      platform: expect.any(String),
      arch: expect.any(String),
      exportedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      evaluationCreatedAt: undefined,
      author: 'test-author',
    });
  });

  it('should create consistent exportedAt timestamps', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T10:30:00.000Z'));

    const evalRecord = {} as any as Eval;
    const metadata = createOutputMetadata(evalRecord);

    expect(metadata.exportedAt).toBe('2025-01-15T10:30:00.000Z');

    vi.useRealTimers();
  });
});
