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
  vi.unstubAllEnvs();
  cliState.config = undefined;
  cliState.selectedProviderConfigs = undefined;
  cliState.basePath = undefined;
  cliState.safeMode = undefined;
});

async function loadExample(filename: string) {
  const resolved = await resolveConfigs(
    { config: [path.resolve(__dirname, '../../examples/amazon-bedrock/agents', filename)] },
    {},
  );
  UnifiedConfigSchema.parse(resolved.config);
  return resolved;
}

async function runExample({ config, testSuite }: Awaited<ReturnType<typeof loadExample>>) {
  cliState.safeMode = true;
  const evaluation = new Eval(config);
  await evaluate(testSuite, evaluation, config.evaluateOptions ?? {});
  return evaluation.toEvaluateSummary();
}

type AgentInput = InvokeAgentCommand['input'];

function mockAgent(respond: (input: AgentInput) => string) {
  const calls: AgentInput[] = [];
  vi.spyOn(AwsBedrockAgentsProvider.prototype, 'getAgentRuntimeClient').mockResolvedValue({
    async send({ input }: InvokeAgentCommand) {
      calls.push(input);
      expect(input.agentAliasId).toBeTruthy();
      const output = respond(input);
      expect(output).toBeTruthy();
      return {
        completion: (async function* () {
          yield { chunk: { bytes: new TextEncoder().encode(output) } };
        })(),
        sessionId: input.sessionId,
      };
    },
  } as unknown as BedrockAgentRuntimeClient);
  return calls;
}

describe('Bedrock Agents examples', () => {
  it('sends ordered turns in a fresh session for each run', async () => {
    const answers = new Map([
      ['Tell me about your capabilities.', 'I can help answer questions.'],
      ['Calculate the sum of 100 and 250.', '350'],
      ['Remember that my favorite color is blue.', 'I will remember that.'],
      ['What is my favorite color?', 'Blue'],
    ]);
    const calls = mockAgent(({ inputText }) => answers.get(inputText!)!);
    const cacheGet = vi.spyOn(await getCache(), 'get');
    cacheGet.mockResolvedValue(JSON.stringify({ output: 'Stale cached response' }));

    for (const sessionId of ['first-conversation', 'second-conversation']) {
      vi.stubEnv('BEDROCK_SESSION_ID', sessionId);
      const example = await loadExample('promptfooconfig.yaml');
      expect(example.config.evaluateOptions?.maxConcurrency).toBe(1);
      const summary = await withCacheEnabled(true, () => runExample(example));
      expect(summary.stats).toMatchObject({ successes: 4, failures: 0, errors: 0 });
      expect(calls.map(({ sessionId, inputText }) => [sessionId, inputText])).toEqual(
        [...answers.keys()].map((query) => [sessionId, query]),
      );
      calls.length = 0;
    }
    expect(cacheGet).not.toHaveBeenCalled();
  });

  it('routes each support question to the intended agents in independent sessions', async () => {
    const responses: Record<string, string> = {
      TECH_AGENT_ID: 'Check the upload limit and authorization permissions for 403 errors.',
      BILLING_AGENT_ID: 'I can help with a duplicate charge refund and your plan upgrade.',
      PRODUCT_AGENT_ID: 'A streaming service can handle the required throughput.',
      SUPERVISOR_AGENT_ID: 'I will escalate this to a manager.',
    };
    const calls = mockAgent(({ agentId }) => responses[agentId!]);
    const example = await loadExample('promptfooconfig.multi-agent.yaml');
    const summary = await withCacheEnabled(false, () => runExample(example));
    expect(summary.stats).toMatchObject({ successes: 6, failures: 0, errors: 0 });
    expect(calls.map((call) => call.agentId).sort()).toEqual([
      'BILLING_AGENT_ID',
      'BILLING_AGENT_ID',
      'PRODUCT_AGENT_ID',
      'SUPERVISOR_AGENT_ID',
      'TECH_AGENT_ID',
      'TECH_AGENT_ID',
    ]);
    expect(calls.every((call) => Boolean(call.sessionId))).toBe(true);
    expect(new Set(calls.map((call) => call.sessionId)).size).toBe(6);
    for (const result of summary.results) {
      expect(result.testCase.providers).toContain(result.provider.label);
      expect(result.prompt.raw).toBe(result.testCase.vars?.query);
    }
  });

  it('rejects specialist answers for the wrong role', async () => {
    const example = await loadExample('promptfooconfig.multi-agent.yaml');
    example.testSuite.tests = example.testSuite.tests?.filter((test) =>
      String(test.vars?.query).startsWith('I upgraded my plan'),
    );
    const responses: Record<string, string> = {
      TECH_AGENT_ID: 'Check the payment for your plan upgrade.',
      BILLING_AGENT_ID: 'Check your authorization permissions for 403 errors.',
    };
    mockAgent(({ agentId }) => responses[agentId!]);
    const summary = await withCacheEnabled(false, () => runExample(example));
    expect(summary.stats).toMatchObject({ successes: 0, failures: 2, errors: 0 });
    for (const result of summary.results) {
      expect(result.gradingResult?.componentResults).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            pass: false,
            assertion: expect.objectContaining({ type: 'icontains-any' }),
          }),
        ]),
      );
    }
  });
});
