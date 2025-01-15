import * as fs from 'fs';
import yaml from 'js-yaml';
import { doEval } from '../../src/commands/eval';
import type Eval from '../../src/models/eval';
import { doGenerateRedteam } from '../../src/redteam/commands/generate';
import { doRedteamRun } from '../../src/redteam/shared';
import { createShareableUrl } from '../../src/share';
import { isRunningUnderNpx } from '../../src/util';
import { loadDefaultConfig } from '../../src/util/config/default';

jest.mock('fs');
jest.mock('js-yaml');
jest.mock('../../src/commands/eval');
jest.mock('../../src/redteam/commands/generate');
jest.mock('../../src/share');
jest.mock('../../src/util');
jest.mock('../../src/util/config/default');

describe('doRedteamRun', () => {
  const mockEvalResult = {
    id: 'test-eval-id',
    createdAt: Date.now(),
    config: {},
    results: [],
    prompts: [],
    persisted: false,
    version: () => 3,
    useOldResults: () => false,
    setTable: jest.fn(),
    save: jest.fn(),
    getVars: jest.fn(),
    getPrompts: jest.fn(),
    getTable: jest.fn(),
    addResult: jest.fn(),
    fetchResultsBatched: jest.fn(),
    fetchResultsByTestIdx: jest.fn(),
    addPrompts: jest.fn(),
    loadResults: jest.fn(),
    getResults: jest.fn(),
    toEvaluateSummary: jest.fn(),
    toResultsFile: jest.fn(),
    delete: jest.fn(),
  } as unknown as Eval;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(loadDefaultConfig).mockResolvedValue({
      defaultConfig: {},
      defaultConfigPath: undefined,
    });
    jest.mocked(doGenerateRedteam).mockResolvedValue({});
    jest.mocked(doEval).mockResolvedValue(mockEvalResult);
    jest.mocked(createShareableUrl).mockResolvedValue('https://example.com/share');
    jest.mocked(isRunningUnderNpx).mockReturnValue(false);
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(yaml.dump).mockReturnValue('test yaml');
  });

  it('should run with default configuration', async () => {
    const options = {
      config: 'promptfooconfig.yaml',
      output: 'redteam.yaml',
    };

    const result = await doRedteamRun(options);

    expect(doGenerateRedteam).toHaveBeenCalledWith({
      config: 'promptfooconfig.yaml',
      output: 'redteam.yaml',
      inRedteamRun: true,
      force: undefined,
      verbose: undefined,
      delay: undefined,
      abortSignal: undefined,
    });
    expect(doEval).toHaveBeenCalledWith(
      expect.objectContaining({
        config: ['redteam.yaml'],
        cache: true,
        write: true,
      }),
      {},
      'redteam.yaml',
      expect.objectContaining({
        showProgressBar: true,
      }),
    );
    expect(result).toEqual(mockEvalResult);
  });

  it('should handle live redteam config', async () => {
    const liveConfig = {
      prompts: ['test prompt'],
      tests: ['test case'],
    };

    const options = {
      liveRedteamConfig: liveConfig,
    };

    await doRedteamRun(options);

    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalledWith(expect.any(String), 'test yaml');
    expect(yaml.dump).toHaveBeenCalledWith(liveConfig);
  });

  it('should skip evaluation if no test cases generated', async () => {
    jest.mocked(fs.existsSync).mockReturnValue(false);
    jest.mocked(doGenerateRedteam).mockResolvedValue(null);

    const result = await doRedteamRun({});

    expect(doEval).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('should handle cloud-loaded results', async () => {
    const options = {
      loadedFromCloud: true,
    };

    await doRedteamRun(options);

    expect(createShareableUrl).toHaveBeenCalledWith(mockEvalResult, false);
  });

  it('should handle abort signal', async () => {
    const abortSignal = new AbortController().signal;
    const options = {
      abortSignal,
    };

    await doRedteamRun(options);

    expect(doGenerateRedteam).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal,
        inRedteamRun: true,
      }),
    );
    expect(doEval).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        abortSignal,
      }),
    );
  });
});
