import fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleTrajectoryStepCount } from '../../src/assertions/trajectory';
import {
  canonicalJson,
  canonicalPrml,
  createEvalBar,
  createEvalLock,
  hashEvalBar,
  hashManifest,
  lockedThresholdPercent,
  verifyEvalLock,
  writeEvalLock,
} from '../../src/node/evalLock';

import type { Assertion, AssertionParams, TestSuite } from '../../src/types';
import type { TraceData } from '../../src/types/tracing';

function createSuite(expected = 'Paris', input = 'Paris'): TestSuite {
  return {
    prompts: [],
    providers: [],
    tests: [
      {
        vars: { input },
        assert: [{ type: 'equals', value: expected }],
      },
    ],
  } as TestSuite;
}

describe('evalLock', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-eval-lock-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('canonicalizes object keys recursively', () => {
    expect(canonicalJson({ z: 1, nested: { b: 2, a: 1 }, a: 3 })).toBe(
      '{"a":3,"nested":{"a":1,"b":2},"z":1}',
    );
  });

  it.each(
    [
      undefined,
      { required: undefined },
      [undefined],
      Array(1),
      -0,
      new Date(),
      new Map(),
      { nested: Object.assign(Object.create(null), { expected: 'value' }) },
      { nested: Object.assign(['value'], { extra: 'criterion' }) },
      { nested: new (class extends Array<string> {})('value') },
      { [Symbol('criterion')]: true },
      {
        get expected() {
          return 'dynamic';
        },
      },
    ].map((value) => [value]),
  )('rejects criteria that cannot be represented faithfully as JSON: %j', (value) => {
    const suite = createSuite();
    suite.tests![0].assert![0] = { type: 'equals', value } as Assertion;
    expect(() => hashEvalBar(createEvalBar(suite, { repeat: 1 }))).toThrow();
  });

  it('rejects undefined nested variables without rejecting optional loader fields', () => {
    const suite = createSuite();
    suite.defaultTest = {
      metadata: undefined,
      vars: undefined,
      options: { prefix: undefined, suffix: undefined, provider: undefined },
    };
    expect(() => hashEvalBar(createEvalBar(suite, { repeat: 1 }))).not.toThrow();
    suite.tests![0].vars = { object: { required: undefined } };
    expect(() => hashEvalBar(createEvalBar(suite, { repeat: 1 }))).toThrow('undefined');
  });

  it.each(['test', 'defaultTest', 'scenarioConfig', 'scenarioTest'] as const)(
    'rejects an explicitly undefined %s threshold before it can be erased',
    (location) => {
      const suite = createSuite();
      if (location === 'defaultTest') {
        suite.defaultTest = { threshold: undefined };
      } else if (location === 'scenarioConfig') {
        suite.scenarios = [{ config: [{ threshold: undefined }], tests: [{}] }];
      } else if (location === 'scenarioTest') {
        suite.scenarios = [{ config: [{ threshold: 0.5 }], tests: [{ threshold: undefined }] }];
      } else {
        suite.tests![0].threshold = undefined;
      }
      expect(() => createEvalBar(suite, { repeat: 1 })).toThrow('undefined threshold');
    },
  );

  it.each(['disableDefaultAsserts', 'repeat'] as const)(
    'rejects an undefined %s option that can clear an inherited setting',
    (option) => {
      const suite = createSuite();
      suite.scenarios = [
        {
          config: [{ options: { disableDefaultAsserts: true, repeat: 2 } }],
          tests: [{ options: { [option]: undefined } }],
        },
      ];
      expect(() => createEvalBar(suite, { repeat: 1 })).toThrow(
        `undefined test option "${option}"`,
      );
    },
  );

  it('retains absent, null, zero, and numeric scenario thresholds as distinct criteria', () => {
    const hashes = [{}, { threshold: null }, { threshold: 0 }, { threshold: 0.5 }].map((test) => {
      const suite = createSuite();
      suite.scenarios = [{ config: [{ threshold: 0.5 }], tests: [test as never] }];
      return hashEvalBar(createEvalBar(suite, { repeat: 1 }));
    });
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it.each([
    'trace-error-spans',
    'trace-span-count',
    'trace-span-duration',
    'trajectory:step-count',
    'trajectory:tool-args-match',
    'trajectory:tool-sequence',
    'trajectory:tool-used',
  ])('rejects %s and its inverse until trace interpretation is committed', (type) => {
    for (const assertionType of [type, `not-${type}`]) {
      const suite = createSuite();
      suite.tests![0].assert = [{ type: assertionType, value: {} } as Assertion];
      expect(() => createEvalBar(suite, { repeat: 1 })).toThrow('data-only assertion criteria');
    }
  });

  it.each(['defaultTest', 'nested', 'scenarioConfig', 'scenarioTest'] as const)(
    'rejects trace criteria in %s',
    (location) => {
      const suite = createSuite();
      const assert: Assertion[] = [{ type: 'trajectory:step-count', value: { max: 0 } }];
      if (location === 'defaultTest') {
        suite.defaultTest = { assert };
      } else if (location === 'nested') {
        suite.tests![0].assert = [{ type: 'assert-set', assert }];
      } else if (location === 'scenarioConfig') {
        suite.scenarios = [{ config: [{ assert }], tests: [{}] }];
      } else {
        suite.scenarios = [{ config: [{}], tests: [{ assert }] }];
      }
      expect(() => createEvalBar(suite, { repeat: 1 })).toThrow('data-only assertion criteria');
    },
  );

  it('rejects locking a trajectory whose unchanged spans can be reclassified', () => {
    const assertion: Assertion = {
      type: 'trajectory:step-count',
      value: { type: 'command', max: 0 },
    };
    const spans: TraceData['spans'] = [
      {
        spanId: 'shell-span',
        name: 'tool.call',
        startTime: 100,
        endTime: 200,
        attributes: { 'tool.name': 'bash', 'tool.arguments': '{"cmd":"echo actual"}' },
      },
    ];
    for (const commandToolNames of [['bash'], []]) {
      const trace: TraceData = {
        traceId: 'trace',
        evaluationId: 'eval',
        testCaseId: 'test',
        spans,
        metadata: { commandToolNames },
      };
      const params: AssertionParams = {
        assertion,
        baseType: 'trajectory:step-count',
        assertionValueContext: {
          trace,
          vars: {},
          test: {},
          prompt: 'actual',
          provider: { id: () => 'echo', callApi: async () => ({ output: 'actual' }) },
          logProbs: undefined,
          providerResponse: { output: 'actual' },
        },
        output: 'actual',
        outputString: 'actual',
        providerResponse: { output: 'actual' },
        test: {},
        inverse: false,
      };
      expect(handleTrajectoryStepCount(params).pass).toBe(commandToolNames.length === 0);
      const suite = createSuite();
      suite.tracing = { enabled: true, commandToolNames };
      suite.tests![0].assert = [assertion];
      expect(() => createEvalBar(suite, { repeat: 1 })).toThrow('data-only assertion criteria');
    }
  });

  it('rejects accessors in option and scenario envelopes before copying them', () => {
    const suite = createSuite();
    suite.defaultTest = {
      options: {
        get prefix() {
          return 'dynamic';
        },
      },
    };
    expect(() => createEvalBar(suite, { repeat: 1 })).toThrow('accessors');
    suite.defaultTest = undefined;
    suite.scenarios = [
      {
        config: [{}],
        tests: [],
        get description() {
          return 'dynamic';
        },
      },
    ];
    expect(() => createEvalBar(suite, { repeat: 1 })).toThrow('accessors');
  });

  it.each(['disableTemplating', 'disableVarExpansion', 'shortCircuitTestFailures'] as const)(
    'rejects verification after changing %s',
    async (setting) => {
      const lockPath = path.join(tempDir, 'interpretation.lock.json');
      await writeEvalLock(
        lockPath,
        createEvalBar(createSuite(), { repeat: 1, [setting]: true }),
        100,
      );
      await expect(
        verifyEvalLock(lockPath, createEvalBar(createSuite(), { repeat: 1, [setting]: false })),
      ).rejects.toThrow('do not match');
    },
  );

  it.each(['test', 'defaultTest', 'nested', 'scenarioConfig', 'scenarioTest'] as const)(
    'rejects accessor-backed %s assertion arrays before reading their elements',
    (location) => {
      const suite = createSuite();
      let reads = 0;
      const assertions: Assertion[] = [];
      Object.defineProperty(assertions, '0', {
        enumerable: true,
        get() {
          reads++;
          return { type: 'equals', value: reads === 1 ? 'Paris' : 'different' };
        },
      });
      if (location === 'defaultTest') {
        suite.defaultTest = { assert: assertions };
      } else if (location === 'nested') {
        suite.tests![0].assert = [{ type: 'assert-set', assert: assertions }];
      } else if (location === 'scenarioConfig') {
        suite.scenarios = [{ config: [{ assert: assertions }], tests: [] }];
      } else if (location === 'scenarioTest') {
        suite.scenarios = [{ config: [], tests: [{ assert: assertions }] }];
      } else {
        suite.tests![0].assert = assertions;
      }
      expect(() => createEvalBar(suite, { repeat: 1 })).toThrow('accessors');
      expect(reads).toBe(0);
    },
  );

  it.each(['tests', 'scenarios', 'scenarioConfigs', 'scenarioTests'] as const)(
    'rejects accessor-backed %s containers without invoking them',
    (location) => {
      const suite = createSuite();
      let reads = 0;
      const sourceArray = <T>(value: T): T[] => {
        const entries: T[] = [];
        Object.defineProperty(entries, '0', {
          enumerable: true,
          get() {
            reads++;
            return value;
          },
        });
        return entries;
      };
      if (location === 'tests') {
        suite.tests = sourceArray(suite.tests![0]);
      } else if (location === 'scenarios') {
        suite.scenarios = sourceArray({ config: [{}], tests: [] });
      } else if (location === 'scenarioConfigs') {
        suite.scenarios = [{ config: sourceArray({}), tests: [] }];
      } else {
        suite.scenarios = [{ config: [], tests: sourceArray({}) }];
      }
      expect(() => createEvalBar(suite, { repeat: 1 })).toThrow('accessors');
      expect(reads).toBe(0);
    },
  );

  it.each(['object', 'array'] as const)(
    'rejects proxy-backed %s criteria without invoking traps',
    (kind) => {
      const suite = createSuite();
      let reads = 0;
      const handler: ProxyHandler<object> = {
        get() {
          reads++;
          throw new Error('PROXY_TRAP_RAN');
        },
        has() {
          reads++;
          throw new Error('PROXY_TRAP_RAN');
        },
        getPrototypeOf() {
          reads++;
          throw new Error('PROXY_TRAP_RAN');
        },
      };
      if (kind === 'array') {
        suite.tests![0].assert = new Proxy<Assertion[]>(
          [{ type: 'equals', value: 'Paris' }],
          handler,
        );
      } else {
        suite.tests![0].assert = [
          { type: 'equals', value: new Proxy({ expected: 'Paris' }, handler) },
        ];
      }
      expect(() => hashEvalBar(createEvalBar(suite, { repeat: 1 }))).toThrow('proxies');
      expect(reads).toBe(0);
    },
  );

  it.each([
    (suite: TestSuite) => {
      suite.tests![0].prompts = ['easy'];
    },
    (suite: TestSuite) => {
      suite.tests![0].providers = ['easy'];
    },
    (suite: TestSuite) => {
      suite.defaultTest = { prompts: ['easy'] };
    },
    (suite: TestSuite) => {
      suite.scenarios = [{ config: [{ providers: ['easy'] }], tests: [{}] }];
    },
    (suite: TestSuite) => {
      suite.scenarios = [{ config: [{}], tests: [{ prompts: ['easy'] }] }];
    },
    (suite: TestSuite) => {
      suite.providers = [
        { id: () => 'echo', callApi: async () => ({ output: '' }), prompts: ['easy'] },
      ];
    },
    (suite: TestSuite) => {
      suite.providerPromptMap = { echo: ['easy'] };
    },
  ])('rejects selective routing that could omit locked tests (%#)', (mutateSuite) => {
    const suite = createSuite();
    mutateSuite(suite);
    expect(() => createEvalBar(suite, { repeat: 1 })).toThrow('selectors');
  });

  it('allows changing the prompt and target when every locked test still applies', () => {
    const original = createSuite();
    const changed = createSuite();
    changed.prompts = [{ raw: 'A different prompt', label: 'Different' }];
    changed.providers = [{ id: () => 'different-target', callApi: async () => ({ output: '' }) }];
    expect(hashEvalBar(createEvalBar(changed, { repeat: 1 }))).toBe(
      hashEvalBar(createEvalBar(original, { repeat: 1 })),
    );
  });

  it('strips only loader basePath from runtime per-test providers', () => {
    const createImportedSuite = (basePath: string, temperature = 0) => {
      const suite = createSuite();
      suite.tests![0].provider = {
        id: () => 'echo',
        callApi: async () => ({ output: '' }),
        config: { basePath, temperature, payload: { basePath: 'user-data' } },
      };
      return suite;
    };
    const original = createImportedSuite('/checkout/a');
    const hash = (suite: TestSuite) => hashEvalBar(createEvalBar(suite, { repeat: 1 }));
    expect(hash(createImportedSuite('/checkout/b'))).toBe(hash(original));
    expect(hash(createImportedSuite('/checkout/b', 1))).not.toBe(hash(original));
    expect(original.tests![0].provider).toMatchObject({ config: { basePath: '/checkout/a' } });
    expect(canonicalJson(createEvalBar(original, { repeat: 1 }))).toContain('user-data');
  });

  it('binds tests, assertions, repeat, and range into the bar hash', () => {
    const original = createEvalBar(createSuite(), { repeat: 3, filterRange: '0:2' });
    const changedAssertion = createEvalBar(createSuite('London'), {
      repeat: 3,
      filterRange: '0:2',
    });
    const changedResolvedInput = createEvalBar(createSuite('Paris', 'London'), {
      repeat: 3,
      filterRange: '0:2',
    });
    const changedRepeat = createEvalBar(createSuite(), { repeat: 2, filterRange: '0:2' });
    const changedRange = createEvalBar(createSuite(), { repeat: 3, filterRange: '1:2' });

    expect(
      new Set([
        hashEvalBar(original),
        hashEvalBar(changedAssertion),
        hashEvalBar(changedResolvedInput),
        hashEvalBar(changedRepeat),
        hashEvalBar(changedRange),
      ]).size,
    ).toBe(5);
  });

  it('binds template interpretation mode into the bar hash', () => {
    const templated = createEvalBar(createSuite('{{expected}}'), {
      repeat: 1,
      disableTemplating: false,
    });
    const literal = createEvalBar(createSuite('{{expected}}'), {
      repeat: 1,
      disableTemplating: true,
    });

    expect(hashEvalBar(literal)).not.toBe(hashEvalBar(templated));
  });

  it.each([
    ['inline scripts', { type: 'javascript', value: 'output === process.env.EXPECTED' }],
    ['provider-backed graders', { type: 'llm-rubric', value: 'Be correct', provider: 'grader' }],
    ['webhooks', { type: 'webhook', value: 'https://example.test/grade' }],
    ['manual grading', { type: 'human' }],
    ['comparative grading', { type: 'max-score' }],
  ])('rejects %s as mutable criteria', (_name, assertion) => {
    const suite = createSuite();
    suite.tests![0].assert = [assertion as Assertion];

    expect(() => createEvalBar(suite, { repeat: 1 })).toThrow(
      'only support data-only assertion criteria',
    );
  });

  it.each([
    '{{ env.CRITERION }}',
    '{% if env.GATE %}ok{% endif %}',
    "{% include 'criterion.njk' %}",
    '{{ values | random }}',
    '{{ value.toString() }}',
  ])('rejects runtime-dependent assertion templates: %s', (value) => {
    const suite = createSuite(value);
    expect(() => createEvalBar(suite, { repeat: 1 })).toThrow('simple test variable references');
    expect(() => createEvalBar(suite, { repeat: 1, disableTemplating: true })).not.toThrow();
  });

  it('rejects redteam criteria even with an explicit grading provider', () => {
    const suite = createSuite();
    suite.redteam = { provider: 'grader', graderExamples: [] } as TestSuite['redteam'];

    expect(() => createEvalBar(suite, { repeat: 1 })).toThrow('do not support redteam criteria');
  });

  it.each([
    [
      'assertion transforms',
      (suite: TestSuite) => {
        (suite.tests![0].assert![0] as Assertion).transform = 'output === process.env.EXPECTED';
      },
    ],
    [
      'test transforms',
      (suite: TestSuite) => {
        suite.tests![0].options = { transform: 'output === process.env.EXPECTED' };
      },
    ],
    [
      'variable transforms',
      (suite: TestSuite) => {
        suite.tests![0].options = { transformVars: 'vars.expected = process.env.EXPECTED' };
      },
    ],
    [
      'postprocessors',
      (suite: TestSuite) => {
        suite.tests![0].options = { postprocess: 'return process.env.EXPECTED' };
      },
    ],
    [
      'custom scoring functions',
      (suite: TestSuite) => {
        suite.tests![0].assertScoringFunction = 'scores.expected = process.env.EXPECTED' as never;
      },
    ],
  ])('rejects deferred %s', (_name, mutateSuite) => {
    const suite = createSuite();
    mutateSuite(suite);

    expect(() => createEvalBar(suite, { repeat: 1 })).toThrow('mutable runtime state');
  });

  it.each([
    [
      'default tests',
      (suite: TestSuite) => {
        suite.defaultTest = {
          assert: [{ type: 'javascript', value: 'output === process.env.EXPECTED' }],
        };
      },
    ],
    [
      'scenario configs',
      (suite: TestSuite) => {
        suite.scenarios = [
          {
            config: [
              { assert: [{ type: 'javascript', value: 'output === process.env.EXPECTED' }] },
            ],
            tests: [{}],
          },
        ];
      },
    ],
    [
      'scenario tests',
      (suite: TestSuite) => {
        suite.scenarios = [
          {
            config: [{}],
            tests: [{ assert: [{ type: 'javascript', value: 'output === process.env.EXPECTED' }] }],
          },
        ];
      },
    ],
  ])('rejects mutable criteria in %s', (_name, mutateSuite) => {
    const suite = createSuite();
    mutateSuite(suite);

    expect(() => createEvalBar(suite, { repeat: 1 })).toThrow(
      'only support data-only assertion criteria',
    );
  });

  it.each([
    [7.2, 9, 125],
    [58, 29, 50],
    [7, 7, 100],
  ])('preserves the inclusive threshold %s%% as a decimal ratio', (percent, passes, total) => {
    const lock = createEvalLock(createEvalBar(createSuite(), { repeat: 1 }), percent);
    expect(lock.manifest.threshold).toBe(passes / total);
    expect(lockedThresholdPercent(lock)).toBe(percent);
  });

  it('rejects a nonzero threshold that would round to zero in the manifest', () => {
    expect(() =>
      createEvalLock(createEvalBar(createSuite(), { repeat: 1 }), Number.MIN_VALUE),
    ).toThrow('too small to represent');
  });

  it('accepts nested and negated data-only assertions', () => {
    const suite = createSuite();
    suite.defaultTest = {
      assert: [
        {
          type: 'assert-set',
          assert: [{ type: 'not-contains', value: 'London' }],
        },
      ],
    };

    expect(() => createEvalBar(suite, { repeat: 1 })).not.toThrow();
  });

  it('strips checkout-specific provider base paths from the bar', () => {
    const createImportedSuite = (providerBasePath: string, note = 'stable'): TestSuite => {
      const suite = createSuite();
      suite.tests![0].metadata = {
        note,
        __promptfoo: { providerBasePath, remote: true },
      };
      return suite;
    };

    const first = createEvalBar(createImportedSuite('/checkout/one/tests'), { repeat: 1 });
    const relocated = createEvalBar(createImportedSuite('/checkout/two/tests'), { repeat: 1 });
    const changedMetadata = createEvalBar(createImportedSuite('/checkout/two/tests', 'changed'), {
      repeat: 1,
    });

    expect(hashEvalBar(relocated)).toBe(hashEvalBar(first));
    expect(hashEvalBar(changedMetadata)).not.toBe(hashEvalBar(first));
    expect(canonicalJson(first)).not.toContain('providerBasePath');
  });

  it('retains loader-like keys inside assertion values and variables', () => {
    const original = createSuite();
    original.tests![0].assert = [
      { type: 'equals', value: { __promptfoo: { providerBasePath: 'required' } } },
    ];
    original.tests![0].vars = { data: { __promptfoo: { providerBasePath: 'required' } } };
    const originalHash = hashEvalBar(createEvalBar(original, { repeat: 1 }));
    const changedAssertion = structuredClone(original);
    changedAssertion.tests![0].assert = [{ type: 'equals', value: { __promptfoo: {} } }];
    expect(hashEvalBar(createEvalBar(changedAssertion, { repeat: 1 }))).not.toBe(originalHash);
    const changedVars = structuredClone(original);
    changedVars.tests![0].vars = { data: { __promptfoo: {} } };
    expect(hashEvalBar(createEvalBar(changedVars, { repeat: 1 }))).not.toBe(originalHash);
  });

  it.each(['value', 'vars', 'options'] as const)(
    'preserves literal provider references in %s data',
    (location) => {
      const suiteWithPayload = (reference: string) => {
        const suite = createSuite();
        suite.providers = [
          { id: () => 'echo', label: 'target', callApi: async () => ({ output: '' }) },
        ];
        const payload = { type: 'record', provider: reference };
        if (location === 'value') {
          suite.tests![0].assert = [{ type: 'equals', value: payload }];
        } else {
          suite.tests![0].vars = location === 'vars' ? payload : { options: payload };
        }
        return createEvalBar(suite, { repeat: 1 });
      };
      const byId = suiteWithPayload('echo');
      const byLabel = suiteWithPayload('target');
      expect(hashEvalBar(byId)).not.toBe(hashEvalBar(byLabel));
      expect(canonicalJson(byId)).toContain('"provider":"echo"');
      expect(canonicalJson(byLabel)).toContain('"provider":"target"');
    },
  );

  it('still resolves providers in schema fields without rewriting their payloads', () => {
    const suite = createSuite();
    const provider = {
      id: () => 'echo',
      label: 'target',
      config: { payload: { type: 'record', provider: 'target' } },
      callApi: async () => ({ output: '' }),
    };
    suite.providers = [provider];
    suite.defaultTest = { provider: 'target', options: { provider: 'target' } };
    suite.tests![0].assert = [
      { type: 'assert-set', assert: [{ type: 'equals', value: 'Paris', provider: 'target' }] },
    ];
    suite.scenarios = [{ config: [{ options: { provider: 'target' } }], tests: [] }];
    const bar = createEvalBar(suite, { repeat: 1 });
    const snapshot = { id: 'echo', label: 'target', config: provider.config };
    expect(bar.defaultTest).toMatchObject({ provider: snapshot, options: { provider: snapshot } });
    expect(bar.tests).toMatchObject([{ assert: [{ assert: [{ provider: snapshot }] }] }]);
    expect(bar.scenarios).toMatchObject([{ config: [{ options: { provider: snapshot } }] }]);
    expect(canonicalJson(bar)).toContain('"payload":{"provider":"target","type":"record"}');
  });

  it.each(['assertion', 'test', 'value', 'vars'] as const)(
    'rejects provider-shaped %s data instead of discarding acceptance criteria',
    (location) => {
      const suite = createSuite();
      let providerCalls = 0;
      const methods = {
        id: () => {
          providerCalls++;
          return 'disguised-criterion';
        },
        callApi: async () => ({ output: '' }),
      };
      if (location === 'assertion') {
        Object.assign(suite.tests![0].assert![0], methods);
      } else if (location === 'test') {
        Object.assign(suite.tests![0], methods);
      } else if (location === 'value') {
        suite.tests![0].assert = [{ type: 'equals', value: { ...methods, expected: 'Paris' } }];
      } else {
        suite.tests![0].vars = { ...methods, expected: 'Paris' };
      }

      expect(() => hashEvalBar(createEvalBar(suite, { repeat: 1 }))).toThrow(
        'cannot safely bind function values',
      );
      expect(providerCalls).toBe(0);
    },
  );

  it.each(['text', 'embedding', 'classification', 'moderation'] as const)(
    'normalizes runtime providers in the schema-level %s slot',
    (providerType) => {
      const suiteWithProvider = (basePath: string, temperature = 0) => {
        const suite = createSuite();
        const provider = {
          id: () => 'echo',
          label: 'target',
          config: { basePath, temperature },
          callApi: async () => ({ output: '' }),
        };
        suite.providers = [provider];
        suite.tests![0].options = { provider: { [providerType]: 'target' } };
        return createEvalBar(suite, { repeat: 1 });
      };
      const original = suiteWithProvider('/checkout/one');
      expect(original.tests).toMatchObject([
        { options: { provider: { [providerType]: { id: 'echo', config: { temperature: 0 } } } } },
      ]);
      expect(hashEvalBar(original)).toBe(hashEvalBar(suiteWithProvider('/checkout/two')));
      expect(hashEvalBar(original)).not.toBe(hashEvalBar(suiteWithProvider('/checkout/two', 1)));
    },
  );

  it.each(['weight', 'threshold', 'value'])(
    'rejects non-enumerable assertion %s before copying it',
    (field) => {
      const suite = createSuite();
      Object.defineProperty(suite.tests![0].assert![0], field, { value: 0, enumerable: false });
      expect(() => createEvalBar(suite, { repeat: 1 })).toThrow('non-enumerable');
    },
  );

  it('rejects non-enumerable user data and array properties during canonicalization', () => {
    for (const data of [{}, []]) {
      Object.defineProperty(data, 'hidden', { value: 'criterion', enumerable: false });
      expect(() => canonicalJson(data)).toThrow('non-enumerable');
    }
    expect(canonicalJson(['criterion'])).toBe('["criterion"]');
  });

  it('rejects derived metric callbacks while allowing data-only metric formulas', () => {
    const suite = createSuite();
    suite.derivedMetrics = [{ name: 'score', value: () => 1 }];
    expect(() => createEvalBar(suite, { repeat: 1 })).toThrow('function-valued derived metrics');
    suite.derivedMetrics = [{ name: 'score', value: 'accuracy / __count' }];
    expect(() => hashEvalBar(createEvalBar(suite, { repeat: 1 }))).not.toThrow();
  });

  it.each(['name', 'value', 'array'] as const)(
    'rejects accessor-backed derived metric %s without reading it',
    (location) => {
      const suite = createSuite();
      let reads = 0;
      const metric = { name: 'score', value: 'accuracy / __count' };
      const metrics = [metric];
      Object.defineProperty(
        location === 'array' ? metrics : metric,
        location === 'array' ? '0' : location,
        {
          enumerable: true,
          get() {
            reads++;
            return location === 'array'
              ? metric
              : location === 'name'
                ? 'score'
                : 'accuracy / __count';
          },
        },
      );
      suite.derivedMetrics = metrics;

      expect(() => createEvalBar(suite, { repeat: 1 })).toThrow('accessors');
      expect(reads).toBe(0);
    },
  );

  it.each(['metric', 'array'] as const)(
    'rejects proxy-backed derived metric %s without invoking traps',
    (location) => {
      const suite = createSuite();
      let reads = 0;
      const handler = {
        get() {
          reads++;
          throw new Error('DERIVED_PROXY_RAN');
        },
      };
      const metric = { name: 'score', value: 'accuracy / __count' };
      suite.derivedMetrics =
        location === 'array' ? new Proxy([metric], handler) : [new Proxy(metric, handler)];

      expect(() => createEvalBar(suite, { repeat: 1 })).toThrow('proxies');
      expect(reads).toBe(0);
    },
  );

  it.each([
    { map: () => [] },
    [{ name: { toString: (): string => 'score' }, value: '1' }],
    [{ name: 'score', value: { toString: (): string => '1' } }],
  ])('rejects derived metrics that are not data-only string formulas: %j', (derivedMetrics) => {
    expect(() => createEvalBar({ ...createSuite(), derivedMetrics }, { repeat: 1 })).toThrow(
      'Evaluation locks require derived metrics',
    );
  });

  it('rejects closure-dependent function criteria', () => {
    const suite = createSuite();
    const expected = 'Paris';
    (suite.tests![0].assert![0] as Assertion).value = (() => expected) as never;

    expect(() => hashEvalBar(createEvalBar(suite, { repeat: 1 }))).toThrow(
      'cannot safely bind function values',
    );
  });

  it.each(['file://check.js', 'package:custom-assertions:check'])(
    'rejects unresolved executable criteria at registration: %s',
    async (value) => {
      const lockPath = path.join(tempDir, 'eval.lock.json');
      const suite = createSuite();
      suite.tests![0].assert = [{ type: 'equals', value }];

      await expect(
        writeEvalLock(lockPath, createEvalBar(suite, { repeat: 1 }), 80),
      ).rejects.toThrow('cannot include unresolved external reference');
      await expect(fs.stat(lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it('rejects extension hooks that could mutate the bar after verification', () => {
    const suite = {
      ...createSuite(),
      extensions: ['file://hooks.js:beforeEach'],
    };

    expect(() => createEvalBar(suite, { repeat: 1 })).toThrow(
      'extension hooks because hooks can mutate tests after verification',
    );
  });

  it('rejects custom Nunjucks filters that can alter criteria at runtime', () => {
    const suite = {
      ...createSuite(),
      nunjucksFilters: { mutable: (value: string) => value },
    };

    expect(() => createEvalBar(suite, { repeat: 1 })).toThrow(
      'do not support custom Nunjucks filters',
    );
  });

  it('creates a PRML lock with the pass-rate threshold', () => {
    const lock = createEvalLock(createEvalBar(createSuite(), { repeat: 1 }), 75);

    expect(lock.manifest).toMatchObject({
      version: 'prml/0.1',
      metric: 'pass_rate',
      comparator: '>=',
      threshold: 0.75,
      dataset: { id: 'promptfoo-resolved-eval-bar-v1' },
      seed: null,
      producer: { id: 'promptfoo' },
    });
    expect(lock.manifest.claim_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(lock.locked).toMatch(/^[a-f0-9]{64}$/);
    expect(lockedThresholdPercent(lock)).toBe(75);
  });

  it('matches the PRML v0.1 minimal conformance vector', () => {
    const manifest = {
      version: 'prml/0.1',
      claim_id: '01900000-0000-7000-8000-000000000000',
      created_at: '2026-05-01T12:00:00Z',
      metric: 'accuracy',
      comparator: '>=',
      threshold: 0.85,
      dataset: {
        id: 'imagenet-val-2012',
        hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      },
      seed: 42,
      producer: { id: 'studio-11.co' },
    };

    expect(canonicalPrml(manifest)).toBe(
      "claim_id: 01900000-0000-7000-8000-000000000000\ncomparator: '>='\ncreated_at: '2026-05-01T12:00:00Z'\ndataset:\n  hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n  id: imagenet-val-2012\nmetric: accuracy\nproducer:\n  id: studio-11.co\nseed: 42\nthreshold: 0.85\nversion: prml/0.1\n",
    );
    expect(hashManifest(manifest)).toBe(
      '1a3466cc08ee7fb60a726ea1c4db6ecf48a9f847b9b7523bfb54b2ffaefee546',
    );
  });

  it('rejects invalid pass-rate thresholds', () => {
    const bar = createEvalBar(createSuite(), { repeat: 1 });

    expect(() => createEvalLock(bar, -1)).toThrow('between 0 and 100');
    expect(() => createEvalLock(bar, 101)).toThrow('between 0 and 100');
    expect(() => createEvalLock(bar, Number.NaN)).toThrow('between 0 and 100');
  });

  it('writes and verifies a matching lock', async () => {
    const lockPath = path.join(tempDir, 'eval.lock.json');
    const bar = createEvalBar(createSuite(), { repeat: 4 });

    const written = await writeEvalLock(lockPath, bar, 80);
    const verified = await verifyEvalLock(lockPath, bar);

    expect(verified).toEqual(written);
  });

  it('refuses to overwrite an existing pre-registration', async () => {
    const lockPath = path.join(tempDir, 'eval.lock.json');
    const bar = createEvalBar(createSuite(), { repeat: 1 });
    await writeEvalLock(lockPath, bar, 80);

    await expect(writeEvalLock(lockPath, bar, 80)).rejects.toThrow('Refusing to overwrite');
  });

  it('detects a modified manifest', async () => {
    const lockPath = path.join(tempDir, 'eval.lock.json');
    const bar = createEvalBar(createSuite(), { repeat: 1 });
    await writeEvalLock(lockPath, bar, 80);
    const lock = JSON.parse(await fs.readFile(lockPath, 'utf8'));
    lock.manifest.threshold = 0.5;
    await fs.writeFile(lockPath, JSON.stringify(lock));

    await expect(verifyEvalLock(lockPath, bar)).rejects.toThrow('manifest has changed');
  });

  it('detects changes to the resolved eval bar', async () => {
    const lockPath = path.join(tempDir, 'eval.lock.json');
    const original = createEvalBar(createSuite(), { repeat: 1 });
    const changed = createEvalBar(createSuite('London'), { repeat: 1 });
    await writeEvalLock(lockPath, original, 80);

    await expect(verifyEvalLock(lockPath, changed)).rejects.toThrow(
      'Resolved tests, assertions, or execution policy do not match',
    );
  });
});
