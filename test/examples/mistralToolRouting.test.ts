import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertions } from '../../src/assertions';
import { disableCache, enableCache, fetchWithCache, isCacheEnabled } from '../../src/cache';
import cliState from '../../src/cliState';
import { renderPrompt } from '../../src/evaluatorHelpers';
import { resolveConfigs } from '../../src/util/config/load';
import { mockProcessEnv } from '../util/utils';

import type { ApiProvider, AtomicTestCase } from '../../src/types';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

const EXAMPLE = path.resolve(__dirname, '../../examples/mistral/promptfooconfig.tool-routing.yaml');

// Mistral Large 4 always reasons and returns its thinking before the answer.
const thinking = { type: 'thinking', thinking: [{ type: 'text', text: 'Pick the tool.' }] };
const calculateCall = (operation: string, a: number, b: number) => ({
  id: 'call_1',
  type: 'function',
  function: { name: 'calculate', arguments: JSON.stringify({ operation, a, b }) },
});

function respond(body: Record<string, any>) {
  const prompt = String(body.messages?.[0]?.content);
  if (prompt.includes('divide 100 by 4')) {
    return { content: null, tool_calls: [calculateCall('divide', 100, 4)] };
  }
  if (prompt.includes('Let me calculate that.')) {
    return {
      content: [thinking, { type: 'text', text: 'Let me calculate that.' }],
      tool_calls: [calculateCall('multiply', 15, 8)],
    };
  }
  if (body.tools) {
    return { content: null, tool_calls: [calculateCall('multiply', 15, 8)] };
  }
  return { content: [thinking, { type: 'text', text: 'ok' }] };
}

describe('Mistral tool-routing example', () => {
  let restoreEnv: () => void;
  let previousBasePath: typeof cliState.basePath;
  let cacheWasEnabled: boolean;
  let requests: Record<string, any>[];

  beforeEach(() => {
    vi.resetAllMocks();
    restoreEnv = mockProcessEnv({
      MISTRAL_API_KEY: 'example-test-key',
      MISTRAL_API_HOST: undefined,
      MISTRAL_API_BASE_URL: undefined,
    });
    previousBasePath = cliState.basePath;
    cacheWasEnabled = isCacheEnabled();
    disableCache();
    requests = [];
    vi.mocked(fetchWithCache).mockImplementation(async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      requests.push(body);
      return {
        data: {
          choices: [{ index: 0, message: { role: 'assistant', ...respond(body) } }],
          usage: { prompt_tokens: 50, completion_tokens: 120, total_tokens: 170 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
    });
  });

  afterEach(() => {
    restoreEnv();
    cliState.basePath = previousBasePath;
    if (cacheWasEnabled) {
      enableCache();
    }
    vi.resetAllMocks();
  });

  it('leaves room for Mistral Large 4 reasoning and passes each test', async () => {
    const { testSuite } = await resolveConfigs({ config: [EXAMPLE] }, {});
    const providersByLabel = new Map<string, ApiProvider>(
      testSuite.providers.map((provider) => [provider.label!, provider]),
    );

    expect(testSuite.tests).toHaveLength(4);
    for (const test of testSuite.tests as AtomicTestCase[]) {
      const [label] = test.providers as string[];
      const provider = providersByLabel.get(label)!;
      expect(provider.id()).toBe('mistral:mistral-large-latest');
      const prompt = await renderPrompt(testSuite.prompts[0], test.vars ?? {}, undefined, provider);

      const response = await provider.callApi(prompt, {
        vars: test.vars ?? {},
        prompt: { raw: prompt, label: prompt },
      });
      const grading = await runAssertions({ test, provider, prompt, providerResponse: response });

      expect(grading.pass, `${test.description}: ${grading.reason}`).toBe(true);
      // Live, Large 4 spent up to 1,023 reasoning tokens on a short prompt at medium effort.
      expect(requests.at(-1)).toMatchObject({ reasoning_effort: 'low' });
      expect(requests.at(-1)?.max_tokens).toBeGreaterThanOrEqual(1024);
    }
    expect(requests).toHaveLength(4);
  });
});
