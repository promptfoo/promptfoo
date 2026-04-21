import './setup';

import { randomUUID } from 'crypto';

import { expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { type ApiProvider, type TestSuite } from '../../src/types/index';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

describeEvaluator('evaluator scenarios and conversations', () => {
  it('evaluate with scenarios', async () => {
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi
        .fn()
        .mockResolvedValueOnce({
          output: 'Hola mundo',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        })
        .mockResolvedValueOnce({
          output: 'Bonjour le monde',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ language }}')],
      scenarios: [
        {
          config: [
            {
              vars: {
                language: 'Spanish',
                expectedHelloWorld: 'Hola mundo',
              },
            },
            {
              vars: {
                language: 'French',
                expectedHelloWorld: 'Bonjour le monde',
              },
            },
          ],
          tests: [
            {
              assert: [
                {
                  type: 'equals',
                  value: '{{expectedHelloWorld}}',
                },
              ],
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
    expect(summary.stats.successes).toBe(2);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe('Hola mundo');
    expect(summary.results[1].response?.output).toBe('Bonjour le monde');
  });

  it('evaluate with scenarios and multiple vars', async () => {
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi
        .fn()
        .mockResolvedValueOnce({
          output: 'Spanish Hola',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        })
        .mockResolvedValueOnce({
          output: 'Spanish Bonjour',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        })
        .mockResolvedValueOnce({
          output: 'French Hola',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        })
        .mockResolvedValueOnce({
          output: 'French Bonjour',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        }),
    };
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ language }} {{ greeting }}')],
      scenarios: [
        {
          config: [
            {
              vars: {
                language: ['Spanish', 'French'],
                greeting: ['Hola', 'Bonjour'],
              },
            },
          ],
          tests: [
            {
              assert: [
                {
                  type: 'equals',
                  value: '{{language}} {{greeting}}',
                },
              ],
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(4);
    expect(summary.stats.successes).toBe(4);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe('Spanish Hola');
    expect(summary.results[1].response?.output).toBe('Spanish Bonjour');
    expect(summary.results[2].response?.output).toBe('French Hola');
    expect(summary.results[3].response?.output).toBe('French Bonjour');
  });

  it('evaluate with scenarios and defaultTest', async () => {
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Hello, World',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      defaultTest: {
        metadata: { defaultKey: 'defaultValue' },
        assert: [
          {
            type: 'starts-with',
            value: 'Hello',
          },
        ],
      },
      scenarios: [
        {
          config: [{ metadata: { configKey: 'configValue' } }],
          tests: [{ metadata: { testKey: 'testValue' } }],
        },
        {
          config: [
            {
              assert: [
                {
                  type: 'contains',
                  value: ',',
                },
              ],
            },
          ],
          tests: [
            {
              assert: [
                {
                  type: 'icontains',
                  value: 'world',
                },
              ],
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();
    expect(summary).toMatchObject({
      stats: {
        successes: 2,
        failures: 0,
      },
      results: expect.arrayContaining([
        expect.objectContaining({
          gradingResult: expect.objectContaining({
            componentResults: expect.arrayContaining([expect.anything()]),
          }),
        }),
        expect.objectContaining({
          gradingResult: expect.objectContaining({
            componentResults: expect.arrayContaining([
              expect.anything(),
              expect.anything(),
              expect.anything(),
            ]),
          }),
        }),
      ]),
    });

    expect(summary.results[0].testCase.metadata).toEqual({
      defaultKey: 'defaultValue',
      configKey: 'configValue',
      testKey: 'testValue',
      conversationId: '__scenario_0__', // Auto-generated for scenario isolation
    });

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
  });

  it('should maintain separate conversation histories between scenarios without explicit conversationId', async () => {
    // This test verifies the fix for GitHub issue #384:
    // Scenarios should have isolated _conversation state by default
    const mockApiProvider = {
      id: () => 'test-provider',
      callApi: vi.fn().mockImplementation((_prompt) => ({
        output: 'Test output',
      })),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [
        {
          raw: '{% for completion in _conversation %}Previous: {{ completion.input }} -> {{ completion.output }}\n{% endfor %}Current: {{ question }}',
          label: 'Conversation test',
        },
      ],
      scenarios: [
        {
          // First scenario - conversation about books
          config: [{}],
          tests: [
            { vars: { question: 'Recommend a sci-fi book' } },
            { vars: { question: 'Tell me more about it' } },
          ],
        },
        {
          // Second scenario - conversation about recipes
          // Should NOT include history from first scenario
          config: [{}],
          tests: [
            { vars: { question: 'Suggest a pasta recipe' } },
            { vars: { question: 'How long does it take?' } },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(4);

    // First scenario, first question - no history
    const firstCall = mockApiProvider.callApi.mock.calls[0][0];
    expect(firstCall).toContain('Current: Recommend a sci-fi book');
    expect(firstCall).not.toContain('Previous:');

    // First scenario, second question - should have first scenario's history
    const secondCall = mockApiProvider.callApi.mock.calls[1][0];
    expect(secondCall).toContain('Previous: ');
    expect(secondCall).toContain('Recommend a sci-fi book');
    expect(secondCall).toContain('Current: Tell me more about it');

    // Second scenario, first question - should NOT have first scenario's history
    // This is the key assertion that verifies the fix for issue #384
    const thirdCall = mockApiProvider.callApi.mock.calls[2][0];
    expect(thirdCall).toContain('Current: Suggest a pasta recipe');
    expect(thirdCall).not.toContain('Previous:');
    expect(thirdCall).not.toContain('sci-fi');
    expect(thirdCall).not.toContain('Recommend');

    // Second scenario, second question - should only have second scenario's history
    const fourthCall = mockApiProvider.callApi.mock.calls[3][0];
    expect(fourthCall).toContain('Previous: ');
    expect(fourthCall).toContain('Suggest a pasta recipe');
    expect(fourthCall).toContain('Current: How long does it take?');
    expect(fourthCall).not.toContain('sci-fi');
  });

  it('should allow scenarios to share conversation history with explicit conversationId', async () => {
    // This test verifies that users can still explicitly share conversations across scenarios
    const mockApiProvider = {
      id: () => 'test-provider',
      callApi: vi.fn().mockImplementation((_prompt) => ({
        output: 'Test output',
      })),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [
        {
          raw: '{% for completion in _conversation %}Previous: {{ completion.input }}\n{% endfor %}Current: {{ question }}',
          label: 'Conversation test',
        },
      ],
      scenarios: [
        {
          config: [{}],
          tests: [
            {
              vars: { question: 'Question from scenario 1' },
              metadata: { conversationId: 'shared-conversation' },
            },
          ],
        },
        {
          config: [{}],
          tests: [
            {
              vars: { question: 'Question from scenario 2' },
              metadata: { conversationId: 'shared-conversation' },
            },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);

    // First scenario - no history
    const firstCall = mockApiProvider.callApi.mock.calls[0][0];
    expect(firstCall).not.toContain('Previous:');

    // Second scenario - SHOULD have first scenario's history because they share conversationId
    const secondCall = mockApiProvider.callApi.mock.calls[1][0];
    expect(secondCall).toContain('Previous: ');
    expect(secondCall).toContain('Question from scenario 1');
  });
});
