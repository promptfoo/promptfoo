import { PythonShell } from 'python-shell';
import { afterEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { getProcessEnv } from '../../../src/envars';
import logger from '../../../src/logger';
import {
  pythonPromptFunction,
  pythonPromptFunctionLegacy,
} from '../../../src/prompts/processors/python';
import { runPython } from '../../../src/python/pythonUtils';

import type { ApiProvider } from '../../../src/types/index';

vi.mock('fs');
vi.mock('python-shell');
vi.mock('../../../src/python/pythonUtils');
vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

afterEach(() => {
  vi.resetAllMocks();
});

describe('pythonPromptFunction', () => {
  interface PythonContext {
    vars: Record<string, string | object>;
    provider: ApiProvider;
  }

  it('should call python wrapper function with correct arguments', async () => {
    const filePath = 'path/to/script.py';
    const functionName = 'testFunction';
    const context = {
      vars: { key: 'value' },
      provider: {
        id: () => 'providerId',
        label: 'providerLabel',
        callApi: vi.fn(),
      } as ApiProvider,
    } as PythonContext;

    const mockRunPython = vi.mocked(runPython);
    mockRunPython.mockResolvedValue('mocked result');

    await expect(pythonPromptFunction(filePath, functionName, context)).resolves.toBe(
      'mocked result',
    );
    expect(mockRunPython).toHaveBeenCalledWith(filePath, functionName, [
      {
        ...context,
        provider: {
          id: 'providerId',
          label: 'providerLabel',
        },
        config: {},
      },
    ]);
  });

  it('passes each invocation file environment to the legacy Python child', async () => {
    const run = vi.mocked(PythonShell.run).mockResolvedValue(['ok']);
    const context = { vars: {}, provider: { id: () => 'offline' } as ApiProvider };
    await Promise.all(
      ['first', 'second'].map((value) =>
        cliState.withEnvFileOverrides(
          { PROMPTFOO_PYTHON: 'python3', PROMPTFOO_TEST_MARKER: value },
          async () => {
            await Promise.resolve();
            await pythonPromptFunctionLegacy('script.py', context);
          },
        ),
      ),
    );
    expect(run.mock.calls.map(([, options]) => options?.env?.PROMPTFOO_TEST_MARKER)).toEqual([
      'first',
      'second',
    ]);
    expect(run.mock.calls.every(([, options]) => options?.pythonPath === 'python3')).toBe(true);
    expect(getProcessEnv().PROMPTFOO_TEST_MARKER).toBeUndefined();
  });

  it('should call legacy function with correct arguments', async () => {
    const filePath = 'path/to/script.py';
    const context = {
      vars: { key: 'value' },
      provider: { id: () => 'providerId', label: 'providerLabel' } as ApiProvider,
    } as PythonContext;
    const mockPythonShellRun = vi.mocked(PythonShell.run);
    const mockLoggerDebug = vi.mocked(logger.debug);
    mockPythonShellRun.mockImplementation(() => {
      return Promise.resolve(['mocked result']);
    });
    await expect(pythonPromptFunctionLegacy(filePath, context)).resolves.toBe('mocked result');
    expect(mockPythonShellRun).toHaveBeenCalledWith(filePath, {
      mode: 'text',
      env: getProcessEnv(),
      pythonPath: process.env.PROMPTFOO_PYTHON || 'python',
      args: [
        JSON.stringify({
          vars: context.vars,
          provider: {
            id: context.provider.id(),
            label: context.provider.label,
          },
          config: {},
        }),
      ],
    });
    expect(mockLoggerDebug).toHaveBeenCalledWith(`Executing python prompt script ${filePath}`);
    expect(mockLoggerDebug).toHaveBeenCalledWith(
      `Python prompt script ${filePath} returned: mocked result`,
    );
  });
});
