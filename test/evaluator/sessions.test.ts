import './setup';

import { randomUUID } from 'crypto';

import { expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import { runExtensionHook } from '../../src/evaluatorHelpers';
import Eval from '../../src/models/eval';
import { type TestSuite } from '../../src/types/index';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

describeEvaluator('evaluator session metadata', () => {
  it('should use sessionId from vars if not in response', async () => {
    const mockApiProvider = {
      id: () => 'test-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        // No sessionId in response
      }),
    };

    const mockExtension = 'file://test-extension.js';
    let capturedContext: any;

    const mockedRunExtensionHook = vi.mocked(runExtensionHook);
    mockedRunExtensionHook.mockImplementation(async (_extensions, hookName, context) => {
      if (hookName === 'afterEach') {
        capturedContext = context;
      }
      return context;
    });

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          vars: { var1: 'value1', sessionId: 'vars-session-456' },
        },
      ],
      extensions: [mockExtension],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(capturedContext).toBeDefined();
    expect(capturedContext.result.metadata.sessionId).toBe('vars-session-456');
  });

  it('should prioritize response sessionId over vars sessionId', async () => {
    const mockApiProvider = {
      id: () => 'test-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        sessionId: 'response-session-priority',
      }),
    };

    const mockExtension = 'file://test-extension.js';
    let capturedContext: any;

    const mockedRunExtensionHook = vi.mocked(runExtensionHook);
    mockedRunExtensionHook.mockImplementation(async (_extensions, hookName, context) => {
      if (hookName === 'afterEach') {
        capturedContext = context;
      }
      return context;
    });

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          vars: { var1: 'value1', sessionId: 'vars-session-ignored' },
        },
      ],
      extensions: [mockExtension],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(capturedContext).toBeDefined();
    expect(capturedContext.result.metadata.sessionId).toBe('response-session-priority');
    expect(capturedContext.result.metadata.sessionId).not.toBe('vars-session-ignored');
  });

  it('should handle empty sessionIds array', async () => {
    const mockApiProvider = {
      id: () => 'test-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
      }),
    };

    const mockExtension = 'file://test-extension.js';
    let capturedContext: any;

    const mockedRunExtensionHook = vi.mocked(runExtensionHook);
    mockedRunExtensionHook.mockImplementation(async (_extensions, hookName, context) => {
      if (hookName === 'afterEach') {
        capturedContext = context;
      }
      return context;
    });

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          vars: { var1: 'value1' },
          metadata: {
            sessionIds: [],
          },
        },
      ],
      extensions: [mockExtension],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(capturedContext).toBeDefined();
    expect(capturedContext.result.metadata.sessionIds).toEqual([]);
  });
});
