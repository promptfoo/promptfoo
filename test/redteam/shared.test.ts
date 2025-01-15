import * as fs from 'fs';
import yaml from 'js-yaml';
import * as os from 'os';
import * as path from 'path';
import { doEval } from '../../src/commands/eval';
import logger, { setLogCallback, setLogLevel } from '../../src/logger';
import type Eval from '../../src/models/eval';
import { doGenerateRedteam } from '../../src/redteam/commands/generate';
import { doRedteamRun } from '../../src/redteam/shared';
import { createShareableUrl } from '../../src/share';
import { isRunningUnderNpx } from '../../src/util';
import { loadDefaultConfig } from '../../src/util/config/default';

jest.mock('fs');
jest.mock('../../src/logger');
jest.mock('../../src/commands/eval');
jest.mock('../../src/redteam/commands/generate');
jest.mock('../../src/util/config/default');
jest.mock('../../src/share');
jest.mock('../../src/util');

describe('doRedteamRun', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(1736911528082);
    jest.spyOn(os, 'tmpdir').mockReturnValue('/tmp');
  });

  it('should run with basic options', async () => {
    const mockConfig = { prompts: ['test prompt'] };
    const mockEvalResult = {
      id: 'test-eval',
      createdAt: Date.now(),
      config: {},
      results: [],
      prompts: [],
      persisted: false,
    } as unknown as Eval;

    jest.mocked(loadDefaultConfig).mockResolvedValue({
      defaultConfig: {},
      defaultConfigPath: 'config.yaml',
    });

    jest.mocked(doGenerateRedteam).mockResolvedValue(mockConfig);
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(doEval).mockResolvedValue(mockEvalResult);
    jest.mocked(isRunningUnderNpx).mockReturnValue(false);

    const options = {
      verbose: true,
      config: 'test-config.yaml',
      output: 'test-output.yaml',
    };

    const result = await doRedteamRun(options);

    expect(setLogLevel).toHaveBeenCalledWith('debug');
    expect(doGenerateRedteam).toHaveBeenCalledWith({
      config: 'test-config.yaml',
      output: 'test-output.yaml',
      force: undefined,
      verbose: true,
      inRedteamRun: true,
      abortSignal: undefined,
    });
    expect(doEval).toHaveBeenCalledWith(
      {
        config: ['test-output.yaml'],
        output: ['test-output.yaml'],
        cache: true,
        write: true,
        filterProviders: undefined,
        filterTargets: undefined,
        verbose: true,
      },
      {},
      'test-output.yaml',
      {
        showProgressBar: true,
        abortSignal: undefined,
      },
    );
    expect(result).toEqual(mockEvalResult);
  });

  it('should handle liveRedteamConfig', async () => {
    const mockConfig = { prompts: ['test prompt'] };
    const expectedTmpDir = '/tmp/redteam-1736911528082';

    jest.mocked(fs.mkdirSync).mockImplementation();
    jest.mocked(fs.writeFileSync).mockImplementation();
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(doGenerateRedteam).mockResolvedValue(mockConfig);
    jest.mocked(loadDefaultConfig).mockResolvedValue({
      defaultConfig: {},
      defaultConfigPath: undefined,
    });
    jest.mocked(doEval).mockResolvedValue({
      id: 'test',
      createdAt: Date.now(),
      config: {},
      results: [],
      prompts: [],
      persisted: false,
    } as unknown as Eval);

    await doRedteamRun({
      liveRedteamConfig: mockConfig,
    });

    expect(fs.mkdirSync).toHaveBeenCalledWith(expectedTmpDir, { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      path.join(expectedTmpDir, 'redteam.yaml'),
      yaml.dump(mockConfig),
    );
  });

  it('should skip evaluation if no test cases generated', async () => {
    jest.mocked(doGenerateRedteam).mockResolvedValue(null);
    jest.mocked(fs.existsSync).mockReturnValue(false);

    const result = await doRedteamRun({});

    expect(result).toBeUndefined();
    expect(doEval).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('No test cases generated. Skipping scan.');
  });

  it('should handle custom log callback', async () => {
    const logCallback = jest.fn();
    jest.mocked(doGenerateRedteam).mockResolvedValue({});
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(loadDefaultConfig).mockResolvedValue({
      defaultConfig: {},
      defaultConfigPath: undefined,
    });
    jest.mocked(doEval).mockResolvedValue({} as unknown as Eval);

    await doRedteamRun({
      logCallback,
    });

    expect(setLogCallback).toHaveBeenCalledWith(logCallback);
    expect(setLogCallback).toHaveBeenLastCalledWith(null);
  });

  it('should create shareable URL when loaded from cloud', async () => {
    const mockEvalResult = {
      id: 'test-eval',
      createdAt: Date.now(),
      config: {},
      results: [],
      prompts: [],
      persisted: false,
    } as unknown as Eval;
    const mockShareableUrl = 'https://test.url';

    jest.mocked(doGenerateRedteam).mockResolvedValue({});
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(doEval).mockResolvedValue(mockEvalResult);
    jest.mocked(createShareableUrl).mockResolvedValue(mockShareableUrl);
    jest.mocked(loadDefaultConfig).mockResolvedValue({
      defaultConfig: {},
      defaultConfigPath: undefined,
    });

    await doRedteamRun({
      loadedFromCloud: true,
    });

    expect(createShareableUrl).toHaveBeenCalledWith(mockEvalResult, false);
    expect(logger.info).toHaveBeenCalledWith(`View results: ${mockShareableUrl}`);
  });
});
