import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCache, withCacheEnabled } from '../../src/cache';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { AwsBedrockAgentsProvider } from '../../src/providers/bedrock/agents';
import { UnifiedConfigSchema } from '../../src/types/index';
import { resolveConfigs } from '../../src/util/config/load';
import type {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';

vi.mock('../../src/telemetry');

afterEach(() => {
  vi.restoreAllMocks();
  cliState.config = undefined;
  cliState.selectedProviderConfigs = undefined;
  cliState.basePath = undefined;
  cliState.safeMode = undefined;
});

describe('Bedrock Agents examples', () => {
  it.each([
    ['promptfooconfig.yaml', 4],
    ['promptfooconfig.multi-agent.yaml', 6],
  ] as const)('routes and grades the intended requests in %s', async (filename, count) => {
    const { config, testSuite } = await resolveConfigs(
      { config: [path.resolve(__dirname, '../../examples/amazon-bedrock/agents', filename)] },
      {},
    );
    UnifiedConfigSchema.parse(config);
    const calls: InvokeAgentCommand['input'][] = [];
    const send = vi.fn(async (command: InvokeAgentCommand) => {
      const input = command.input;
      calls.push(input);
      expect(input.agentAliasId).toBeTruthy();
      expect(input.inputText).not.toContain('{{');
      let output: string;
      if (filename === 'promptfooconfig.yaml') {
        const outputs = new Map([
          ['Tell me about your capabilities.', 'I can help answer questions.'],
          ['Calculate the sum of 100 and 250.', '350'],
          ['Remember that my favorite color is blue.', 'I will remember that.'],
          ['What is my favorite color?', 'Blue'],
        ]);
        expect(outputs.has(input.inputText!)).toBe(true);
        output = outputs.get(input.inputText!)!;
      } else {
        const responses: Record<string, string> = {
          TECH_AGENT_ID: 'Check the upload limit and authorization permissions for 403 errors.',
          BILLING_AGENT_ID: 'I can help with a duplicate charge refund and your plan upgrade.',
          PRODUCT_AGENT_ID: 'A streaming service can handle the required throughput.',
          SUPERVISOR_AGENT_ID: 'I will escalate this to a manager.',
        };
        output = responses[input.agentId!];
        expect(output).toBeTruthy();
      }
      return {
        completion: (async function* () {
          yield { chunk: { bytes: new TextEncoder().encode(output) } };
        })(),
        sessionId: input.sessionId,
      };
    });
    vi.spyOn(AwsBedrockAgentsProvider.prototype, 'getAgentRuntimeClient').mockResolvedValue({
      send,
    } as unknown as BedrockAgentRuntimeClient);

    cliState.safeMode = true;
    const cacheGet = vi.spyOn(await getCache(), 'get');
    if (filename === 'promptfooconfig.yaml') {
      cacheGet.mockResolvedValue(JSON.stringify({ output: 'Stale cached response' }));
    }
    const evaluation = new Eval(config);
    await withCacheEnabled(true, () =>
      evaluate(testSuite, evaluation, config.evaluateOptions ?? {}),
    );
    const summary = await evaluation.toEvaluateSummary();
    expect(summary.results).toHaveLength(count);
    expect(summary.results.map((result) => result.error)).toEqual(Array(count).fill(undefined));
    expect(summary.stats).toMatchObject({ successes: count, failures: 0, errors: 0 });
    expect(calls).toHaveLength(count);
    if (filename === 'promptfooconfig.yaml') {
      expect(config.evaluateOptions?.maxConcurrency).toBe(1);
      expect(cacheGet).not.toHaveBeenCalled();
      expect(new Set(calls.map((call) => call.sessionId)).size).toBe(1);
      expect(calls.map((call) => call.inputText)).toEqual([
        'Tell me about your capabilities.',
        'Calculate the sum of 100 and 250.',
        'Remember that my favorite color is blue.',
        'What is my favorite color?',
      ]);
    } else {
      expect(
        calls.every((call) => typeof call.sessionId === 'string' && call.sessionId.length > 0),
      ).toBe(true);
      expect(new Set(calls.map((call) => call.sessionId)).size).toBe(count);
      expect(calls.map((call) => call.agentId).sort()).toEqual([
        'BILLING_AGENT_ID',
        'BILLING_AGENT_ID',
        'PRODUCT_AGENT_ID',
        'SUPERVISOR_AGENT_ID',
        'TECH_AGENT_ID',
        'TECH_AGENT_ID',
      ]);
      for (const result of summary.results) {
        expect(result.testCase.providers).toContain(result.provider.label);
        expect(result.prompt.raw).toBe(result.testCase.vars?.query);
      }
    }
  });
});
