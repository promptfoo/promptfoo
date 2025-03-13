import type { Command } from 'commander';
import dedent from 'dedent';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { doEval } from '../../../src/commands/eval';
import * as evaluatorModule from '../../../src/evaluator';
import type { CommandLineOptions, EvaluateOptions } from '../../../src/types';

jest.mock('../../../src/evaluator', () => ({
  evaluate: jest.fn().mockResolvedValue({ results: [], summary: {} }),
}));

jest.mock('../../../src/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  getLogLevel: jest.fn().mockReturnValue('info'),
}));

jest.mock('../../../src/migrate', () => ({
  runDbMigrations: jest.fn(),
}));

jest.mock('../../../src/telemetry', () => ({
  record: jest.fn(),
  recordAndSendOnce: jest.fn(),
  send: jest.fn().mockResolvedValue(undefined),
}));

const evaluateMock = jest.mocked(evaluatorModule.evaluate);

describe('evaluateOptions behavior', () => {
  let tempDir: string;
  let configPath: string;
  const originalExit = process.exit;

  beforeAll(() => {
    process.exit = jest.fn() as any;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-test-'));
    configPath = path.join(tempDir, 'promptfooconfig.yaml');

    const configContent = dedent`
      evaluateOptions:
        maxConcurrency: 3

      providers:
        - id: openai:gpt-4o-mini

      prompts:
        - 'test prompt'

      tests:
        - vars:
            input: 'test input'
    `;

    fs.writeFileSync(configPath, configContent);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  afterAll(() => {
    process.exit = originalExit;
  });

  it('should handle evaluateOptions from config files in external directories', async () => {
    const cmdObj: Partial<CommandLineOptions & Command> = {
      config: [configPath],
    };

    await doEval(cmdObj, {}, undefined, {});

    expect(evaluateMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.any(Object),
    );

    const options = evaluateMock.mock.calls[0][2];

    expect(options.maxConcurrency).toBeUndefined();
  });

  it('should prioritize command line options over config file options', async () => {
    const cmdObj: Partial<CommandLineOptions & Command> = {
      config: [configPath],
      maxConcurrency: 5,
    };

    await doEval(cmdObj, {}, undefined, {});

    expect(evaluateMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.any(Object),
    );

    const options = evaluateMock.mock.calls[0][2];
    expect(options.maxConcurrency).toBe(5);
  });

  it('should correctly merge evaluateOptions from multiple sources', () => {
    const config = {
      evaluateOptions: {
        maxConcurrency: 3,
        showProgressBar: false,
      },
      providers: [],
      prompts: [],
    };

    const initialOptions: EvaluateOptions = {
      showProgressBar: true,
    };

    const mergedOptions = config.evaluateOptions
      ? { ...initialOptions, ...config.evaluateOptions }
      : initialOptions;

    expect(mergedOptions.maxConcurrency).toBe(3);
    expect(mergedOptions.showProgressBar).toBe(false);
  });
});
