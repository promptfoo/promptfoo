import { PythonShell } from 'python-shell';
import logger from '../../../src/logger';
import {
  pythonPromptFunction,
  pythonPromptFunctionLegacy,
} from '../../../src/prompts/processors/python';
import { runPython } from '../../../src/python/pythonUtils';
import type { ApiProvider } from '../../../src/types';

jest.mock('fs');
jest.mock('python-shell');
jest.mock('../../../src/python/pythonUtils');

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
        callApi: jest.fn(),
      } as ApiProvider,
    } as PythonContext;

    const mockRunPython = jest.mocked(runPython);
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

  it('should call legacy function with correct arguments', async () => {
    const filePath = 'path/to/script.py';
    const context = {
      vars: { key: 'value' },
      provider: { id: () => 'providerId', label: 'providerLabel' } as ApiProvider,
    } as PythonContext;
    const mockPythonShellRun = jest.mocked(PythonShell.run);
    const mockLoggerDebug = jest.mocked(logger.debug);
    mockPythonShellRun.mockImplementation(() => {
      return Promise.resolve(['mocked result']);
    });
    await expect(pythonPromptFunctionLegacy(filePath, context)).resolves.toBe('mocked result');
    expect(mockPythonShellRun).toHaveBeenCalledWith(filePath, {
      mode: 'text',
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
