import { mkdtemp, rm, writeFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertionUsesTrace, runAssertion } from '../../src/assertions';
import {
  copyResolvedAssertionAlias,
  getResolvedAssertionAlias,
  resolveAssertionAliases,
} from '../../src/assertions/aliases';
import { evaluate } from '../../src/node/evaluate';
import { runPython } from '../../src/python/pythonUtils';
import { runRuby } from '../../src/ruby/rubyUtils';
import { resolveConfigs } from '../../src/util/config/load';

import type { AtomicTestCase, TestCase } from '../../src/types/index';

vi.mock('../../src/python/pythonUtils', () => ({
  runPython: vi.fn(),
}));

vi.mock('../../src/ruby/rubyUtils', () => ({
  runRuby: vi.fn(),
}));

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.resetAllMocks();
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('named script assertion aliases', () => {
  async function resolveAssertionAlias(type: 'javascript' | 'python' | 'ruby', script: string) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'promptfoo-assertion-alias-'));
    temporaryDirectories.push(directory);

    const configPath = path.join(directory, 'promptfooconfig.yaml');
    await writeFile(
      configPath,
      `providers:\n  - echo\nprompts:\n  - prompt\nassertionAliases:\n  - label: checks-callsite-value\n    type: ${type}\n    script: file://./${script}:checkValue\ntests:\n  - assert:\n      - type: checks-callsite-value\n        value: test\n        config:\n          distance: 4\n`,
    );

    const { testSuite } = await resolveConfigs({ config: [configPath] }, {});
    const test = testSuite.tests?.[0] as AtomicTestCase;
    const assertion = test.assert?.[0];

    expect(assertion).toMatchObject({
      type: 'checks-callsite-value',
      value: 'test',
      config: { distance: 4 },
    });
    if (!assertion || assertion.type === 'assert-set') {
      throw new Error('Expected the configured script assertion alias');
    }

    return { assertion, directory, test };
  }

  it('runs the aliased script with the call-site value and config', async () => {
    const { assertion, directory, test } = await resolveAssertionAlias(
      'javascript',
      'check-value.mjs',
    );
    await writeFile(
      path.join(directory, 'check-value.mjs'),
      "export function checkValue(_output, context) {\n  return context.value === 'test' && context.config?.distance === 4;\n}\n",
    );

    await expect(
      runAssertion({
        assertion,
        test,
        providerResponse: { output: 'ignored' },
      }),
    ).resolves.toMatchObject({
      assertion: expect.objectContaining({ type: 'checks-callsite-value' }),
      pass: true,
      score: 1,
    });
  });

  it('passes the call-site value and config to Python aliases', async () => {
    vi.mocked(runPython).mockResolvedValue(true);
    const { assertion, directory, test } = await resolveAssertionAlias('python', 'check-value.py');

    await expect(
      runAssertion({
        assertion,
        test,
        providerResponse: { output: 'ignored' },
      }),
    ).resolves.toMatchObject({ pass: true, score: 1 });

    expect(runPython).toHaveBeenCalledWith(path.join(directory, 'check-value.py'), 'checkValue', [
      'ignored',
      expect.objectContaining({
        value: 'test',
        config: { distance: 4 },
      }),
    ]);
  });

  it('passes the call-site value and config to Ruby aliases', async () => {
    vi.mocked(runRuby).mockResolvedValue(true);
    const { assertion, directory, test } = await resolveAssertionAlias('ruby', 'check-value.rb');

    await expect(
      runAssertion({
        assertion,
        test,
        providerResponse: { output: 'ignored' },
      }),
    ).resolves.toMatchObject({ pass: true, score: 1 });

    expect(runRuby).toHaveBeenCalledWith(path.join(directory, 'check-value.rb'), 'checkValue', [
      'ignored',
      expect.objectContaining({
        value: 'test',
        config: { distance: 4 },
      }),
    ]);
  });

  it('resolves aliases in scenario config assertions', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'promptfoo-assertion-alias-'));
    temporaryDirectories.push(directory);

    const configPath = path.join(directory, 'promptfooconfig.yaml');
    await writeFile(
      configPath,
      `providers:\n  - echo\nprompts:\n  - prompt\nassertionAliases:\n  - label: checks-scenario-value\n    type: javascript\n    script: file://./check-value.mjs:checkValue\nscenarios:\n  - config:\n      - assert:\n          - type: checks-scenario-value\n            value: test\n    tests:\n      - vars: {}\n`,
    );
    await writeFile(
      path.join(directory, 'check-value.mjs'),
      "export function checkValue(_output, context) {\n  return context.value === 'test';\n}\n",
    );

    const { testSuite } = await resolveConfigs({ config: [configPath] }, {});
    const test = testSuite.scenarios?.[0]?.config?.[0] as AtomicTestCase | undefined;
    const assertion = test?.assert?.[0];

    if (!assertion || assertion.type === 'assert-set' || !test) {
      throw new Error('Expected the scenario config script assertion alias');
    }

    await expect(
      runAssertion({
        assertion,
        test,
        providerResponse: { output: 'ignored' },
      }),
    ).resolves.toMatchObject({ pass: true, score: 1 });
  });

  it('resolves aliases passed to programmatic evaluate after cloning tests', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'promptfoo-assertion-alias-'));
    temporaryDirectories.push(directory);

    const scriptPath = path.join(directory, 'check-value.mjs');
    await writeFile(
      scriptPath,
      "export function checkValue(_output, context) {\n  return context.value === 'test';\n}\n",
    );

    const evalRecord = await evaluate(
      {
        prompts: ['prompt'],
        providers: ['echo'],
        assertionAliases: [
          {
            label: 'checks-library-value',
            type: 'javascript',
            script: `file://${scriptPath}:checkValue`,
          },
        ],
        tests: [{ assert: [{ type: 'checks-library-value', value: 'test' }] }],
      },
      { cache: false },
    );
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.errors).toBe(0);
  });

  it('loads file-reference scenarios before resolving aliases', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'promptfoo-assertion-alias-'));
    temporaryDirectories.push(directory);

    const scriptPath = path.join(directory, 'check-value.mjs');
    const scenariosPath = path.join(directory, 'scenarios.yaml');
    await writeFile(
      scriptPath,
      "export function checkValue(_output, context) {\n  return context.value === 'test';\n}\n",
    );
    await writeFile(
      scenariosPath,
      `- config:\n    - assert:\n        - type: checks-file-scenario\n          value: test\n  tests:\n    - vars: {}\n`,
    );

    const evalRecord = await evaluate(
      {
        prompts: ['prompt'],
        providers: ['echo'],
        assertionAliases: [
          {
            label: 'checks-file-scenario',
            type: 'javascript',
            script: `file://${scriptPath}:checkValue`,
          },
        ],
        scenarios: [`file://${scenariosPath}`],
      },
      { cache: false },
    );
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.errors).toBe(0);
  });

  it('preserves pre-resolved aliases when programmatic evaluation clones tests', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'promptfoo-assertion-alias-'));
    temporaryDirectories.push(directory);

    const scriptPath = path.join(directory, 'check-value.mjs');
    await writeFile(
      scriptPath,
      "export function checkValue(_output, context) {\n  return context.value === 'test';\n}\n",
    );
    const [test] = resolveAssertionAliases(
      [{ assert: [{ type: 'checks-pre-resolved', value: 'test' }] } as unknown as TestCase],
      [
        {
          label: 'checks-pre-resolved',
          type: 'javascript',
          script: `file://${scriptPath}:checkValue`,
        },
      ],
    );

    const evalRecord = await evaluate(
      {
        prompts: ['prompt'],
        providers: ['echo'],
        tests: [test],
      },
      { cache: false },
    );
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.errors).toBe(0);
  });

  it('rejects an alias that collides with a built-in assertion type', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'promptfoo-assertion-alias-'));
    temporaryDirectories.push(directory);

    const configPath = path.join(directory, 'promptfooconfig.yaml');
    await writeFile(
      configPath,
      `providers:\n  - echo\nprompts:\n  - prompt\nassertionAliases:\n  - label: contains\n    type: javascript\n    script: file://./check-value.mjs:checkValue\ntests:\n  - assert:\n      - type: contains\n        value: test\n`,
    );

    await expect(resolveConfigs({ config: [configPath] }, {})).rejects.toThrow(
      'Assertion alias label conflicts with built-in assertion type: contains',
    );
  });

  it('rejects Redteam assertion labels during alias resolution', () => {
    expect(() =>
      resolveAssertionAliases(
        [],
        [
          {
            label: 'promptfoo:redteam:harmful',
            type: 'javascript',
            script: 'file://check-value.mjs:checkValue',
          },
        ],
      ),
    ).toThrow(
      'Assertion alias label conflicts with built-in assertion type: promptfoo:redteam:harmful',
    );
  });

  it('treats aliases for script assertions as trace-aware', () => {
    const [test] = resolveAssertionAliases(
      [
        {
          assert: [{ type: 'checks-trace', value: 'test' }],
        } as unknown as AtomicTestCase,
      ],
      [
        {
          label: 'checks-trace',
          type: 'javascript',
          script: 'file://check-trace.mjs:checkTrace',
        },
      ],
    );
    const assertion = test.assert?.[0];

    if (!assertion || assertion.type === 'assert-set') {
      throw new Error('Expected a configured script assertion alias');
    }

    expect(assertionUsesTrace(assertion)).toBe(true);
  });

  it('passes through built-in assertions when aliases are defined', () => {
    const assertion = { type: 'equals' as const, value: 'hi' };
    const [test] = resolveAssertionAliases(
      [{ assert: [assertion] } as TestCase],
      [
        {
          label: 'checks-passthrough',
          type: 'javascript',
          script: 'file://check-value.mjs:checkValue',
        },
      ],
    );
    const resolved = test.assert?.[0];

    expect(resolved).toBe(assertion);
    if (!resolved || resolved.type === 'assert-set') {
      throw new Error('Expected the built-in assertion to pass through');
    }
    expect(getResolvedAssertionAlias(resolved)).toBeUndefined();
  });

  it('resolves alias references nested inside assert sets', () => {
    const [test] = resolveAssertionAliases(
      [
        {
          assert: [
            {
              type: 'assert-set',
              assert: [{ type: 'checks-nested', value: 'nested' }],
            },
          ],
        } as unknown as TestCase,
      ],
      [
        {
          label: 'checks-nested',
          type: 'javascript',
          script: 'file://check-nested.mjs:checkNested',
        },
      ],
    );
    const assertionSet = test.assert?.[0];

    expect(assertionSet?.type).toBe('assert-set');
    if (!assertionSet || assertionSet.type !== 'assert-set') {
      throw new Error('Expected an assertion set');
    }
    const child = assertionSet.assert[0];
    expect(child).toMatchObject({ type: 'checks-nested', value: 'nested' });
    expect(getResolvedAssertionAlias(child)).toEqual({
      type: 'javascript',
      script: 'file://check-nested.mjs:checkNested',
      value: 'nested',
    });
  });

  it('returns assert-set targets unchanged when copying alias metadata', () => {
    const source = { type: 'assert-set' as const, assert: [] };
    const target = { type: 'assert-set' as const, assert: [] };

    expect(copyResolvedAssertionAlias(source, target)).toBe(target);
    expect(target).toEqual({ type: 'assert-set', assert: [] });
  });
});
