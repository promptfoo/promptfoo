import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluate } from '../src/node/evaluate';
import { mockProcessEnv } from './util/utils';

import type { EvaluateTestSuite, ProviderOptions } from '../src/types/index';

const { configs, graderId } = vi.hoisted(() => ({
  configs: [] as ProviderOptions[],
  graderId: 'anthropic:claude-agent-sdk:config-test',
}));

// Replace only the external agent runtime; exercise real evaluation, provider
// resolution, config rendering, and assertion/matcher code without API calls.
vi.mock('../src/providers/registry', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/providers/registry')>();
  return {
    ...original,
    getProviderFactories: async (providerPath: string) => {
      if (providerPath !== graderId) {
        return original.getProviderFactories(providerPath);
      }
      return [
        {
          test: () => true,
          create: async (_path: string, options: ProviderOptions) => {
            configs.push(options);
            return {
              id: () => graderId,
              config: options.config,
              callApi: async () => ({
                output: JSON.stringify({
                  pass: true,
                  score: 1,
                  reason: options.config?.working_dir,
                }),
              }),
            };
          },
        },
      ];
    },
  };
});

let restoreEnv: () => void;

beforeEach(() => {
  vi.resetAllMocks();
  configs.length = 0;
  restoreEnv = mockProcessEnv();
});

afterEach(() => {
  restoreEnv();
  vi.restoreAllMocks();
  configs.length = 0;
});

function makeSuite(location: string): EvaluateTestSuite {
  const provider = {
    id: graderId,
    config: { working_dir: '{{root}}/{{trace_id}}', sandbox_mode: 'read-only' },
  };
  const assertion = { type: 'agent-rubric' as const, value: 'Inspect evidence', provider };
  const suite: EvaluateTestSuite = {
    providers: ['echo'],
    prompts: ['case {{trace_id}}'],
    defaultTest: { vars: { root: './evidence' } },
    tests: [{ vars: { trace_id: ['abc', 'def'] } }],
  };
  const test = (suite.tests as Array<{ vars: object; assert?: unknown; options?: unknown }>)[0];
  const defaults = suite.defaultTest as Exclude<EvaluateTestSuite['defaultTest'], string>;
  if (!defaults) {
    throw new Error('Expected defaultTest');
  }
  switch (location) {
    case 'default assertion':
      defaults.assert = [assertion];
      break;
    case 'test options':
      test.options = { provider };
      test.assert = [{ type: 'agent-rubric', value: 'Inspect evidence' }];
      break;
    case 'default options':
      defaults.options = { provider };
      test.assert = [{ type: 'agent-rubric', value: 'Inspect evidence' }];
      break;
    case 'type map':
      test.assert = [
        {
          ...assertion,
          provider: {
            text: provider,
            embedding: { id: 'unused:provider', config: { working_dir: '{{unused}}' } },
          },
        },
      ];
      break;
    case 'assert set':
      test.assert = [{ type: 'assert-set', assert: [assertion] }];
      break;
    case 'scenario':
      suite.scenarios = [
        { config: [{ assert: [assertion] }], tests: [{ vars: { trace_id: ['abc', 'def'] } }] },
      ];
      suite.tests = [];
      break;
    default:
      test.assert = [assertion];
  }
  return suite;
}

describe('agent-rubric per-case provider config', () => {
  it.each([
    'assertion',
    'default assertion',
    'test options',
    'default options',
    'type map',
    'assert set',
    'scenario',
  ])('renders %s config after merging defaults and expanding rows', async (location) => {
    const suite = makeSuite(location);
    const original = JSON.stringify(suite);
    const result = await evaluate(suite, { cache: false, maxConcurrency: 2 });
    const summary = await result.toEvaluateSummary();
    expect(summary.results).toHaveLength(2);
    expect(summary.results.every((row) => row.success)).toBe(true);
    expect(configs.map(({ config }) => config?.working_dir).sort()).toEqual([
      './evidence/abc',
      './evidence/def',
    ]);
    expect(configs).toHaveLength(2);
    expect(JSON.stringify(suite)).toBe(original);
  });

  it('renders block-only templates and preserves suite/provider env precedence', async () => {
    const suite = makeSuite('assertion');
    suite.env = { OPENAI_API_KEY: 'suite-value' };
    suite.tests = [
      {
        vars: { useFixture: true },
        assert: [
          {
            type: 'agent-rubric',
            value: 'Inspect',
            provider: {
              id: graderId,
              env: { OPENAI_API_KEY: 'provider-value' },
              config: {
                working_dir: '{% if useFixture %}./fixture-a{% else %}./fixture-b{% endif %}',
                custom: '{{env.OPENAI_API_KEY}}',
              },
            },
          },
        ],
      },
    ];
    const result = await evaluate(suite, { cache: false });
    expect((await result.toEvaluateSummary()).results[0].success).toBe(true);
    expect(configs[0].config).toMatchObject({
      working_dir: './fixture-a',
      custom: 'provider-value',
    });
  });

  it('fails before creating a grader when a workspace variable is missing', async () => {
    const suite = makeSuite('assertion');
    (suite.tests as Array<{ vars: object }>)[0].vars = {};
    const result = await evaluate(suite, { cache: false });
    const [row] = (await result.toEvaluateSummary()).results;
    expect(row.success).toBe(false);
    expect(row.error).toContain('working_dir');
    expect(row.error).toContain('variables are defined');
    expect(configs).toHaveLength(0);
  });

  it('leaves other assertion types on their existing provider resolution path', async () => {
    const suite = makeSuite('assertion');
    suite.tests = [
      {
        vars: { trace_id: 'abc' },
        assert: [
          {
            type: 'llm-rubric',
            value: 'Inspect',
            provider: {
              id: graderId,
              config: { working_dir: './evidence/{{trace_id}}' },
            },
          },
        ],
      },
    ];
    const result = await evaluate(suite, { cache: false });
    expect((await result.toEvaluateSummary()).results[0].success).toBe(true);
    expect(configs[0].config?.working_dir).toBe('./evidence/{{trace_id}}');
  });

  it('uses already-constructed provider instances unchanged', async () => {
    const callApi = vi
      .fn()
      .mockResolvedValue({ output: JSON.stringify({ pass: true, score: 1, reason: 'ok' }) });
    const provider = { id: () => graderId, config: { working_dir: '{{literal}}' }, callApi };
    const result = await evaluate(
      {
        providers: ['echo'],
        prompts: ['test'],
        tests: [{ assert: [{ type: 'agent-rubric', value: 'Inspect', provider }] }],
      },
      { cache: false },
    );
    expect((await result.toEvaluateSummary()).results[0].success).toBe(true);
    expect(callApi).toHaveBeenCalledOnce();
    expect(provider.config.working_dir).toBe('{{literal}}');
    expect(configs).toHaveLength(0);
  });

  it('does not render template syntax introduced by test data a second time', async () => {
    mockProcessEnv({ OPENAI_API_KEY: 'must-not-appear' });
    const suite = makeSuite('assertion');
    const payload = '{{env.OPENAI_API_KEY}}{% if true %}literal{% endif %}';
    (suite.tests as Array<{ vars: object }>)[0].vars = { trace_id: payload };
    const result = await evaluate(suite, { cache: false });
    expect((await result.toEvaluateSummary()).results[0].success).toBe(true);
    expect(configs[0].config?.working_dir).toBe(`./evidence/${payload}`);
  });
});
