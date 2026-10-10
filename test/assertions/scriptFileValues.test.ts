import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { dump as dumpYaml } from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runAssertion } from '../../src/assertions/index';
import cliState from '../../src/cliState';
import { loadTestsFromGlob } from '../../src/util/testCaseReader';

import type { Assertion, AssertionValue, AtomicTestCase } from '../../src/types/index';

describe('script assertion data-file parameters', () => {
  let directory: string;
  let script: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'promptfoo-script-values-'));
    script = `file://${path.join(directory, 'check.cjs')}`;
    await writeFile(
      path.join(directory, 'check.cjs'),
      'module.exports = (output, context) => JSON.stringify(context.value) === output;',
    );
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function checkInlineAndExternal(
    value: AssertionValue,
    expected: unknown,
    vars: Record<string, string> = {},
  ) {
    const inlineTest: AtomicTestCase = {
      vars: { label: 'rendered', ...vars },
      assert: [{ type: 'javascript', script, value }],
    };
    const testFile = path.join(directory, 'tests.json');
    await writeFile(testFile, JSON.stringify([inlineTest]));
    const [externalTest] = await loadTestsFromGlob(testFile);

    for (const test of [inlineTest, externalTest]) {
      const result = await runAssertion({
        assertion: test.assert![0] as Assertion,
        test: test as AtomicTestCase,
        providerResponse: { output: JSON.stringify(expected) },
      });
      expect(result).toMatchObject({ pass: true, score: 1 });
    }
  }

  it('loads text parameters with the same trimming as other assertion data files', async () => {
    const file = path.join(directory, 'expected.txt');
    await writeFile(file, 'hello {{ label }}\n');

    await checkInlineAndExternal(`file://${file}`, 'hello rendered');
  });

  it('renders a data-file path once with test variables', async () => {
    const file = path.join(directory, 'literal {{ second }}.txt');
    await writeFile(file, 'expected');

    await checkInlineAndExternal('file://{{ dataPath }}', 'expected', {
      dataPath: file,
      second: 'must-not-be-rendered',
    });
  });

  it('does not render substituted syntax in an executable parameter reference', async () => {
    const file = path.join(directory, 'literal {{ second }}.cjs');

    await checkInlineAndExternal('file://{{ dataPath }}', `file://${file}`, {
      dataPath: file,
      second: 'must-not-be-rendered',
    });
  });

  it('keeps relative data files rooted at the config directory for nested external YAML tests', async () => {
    const casesDirectory = path.join(directory, 'cases');
    await mkdir(casesDirectory);
    await writeFile(path.join(directory, 'expected.txt'), 'config directory');
    await writeFile(path.join(casesDirectory, 'expected.txt'), 'wrong directory');
    const inlineTest: AtomicTestCase = {
      assert: [{ type: 'javascript', script, value: 'file://expected.txt' }],
    };
    // JSON is also valid YAML; the external file is intentionally nested.
    await writeFile(path.join(casesDirectory, 'tests.yaml'), JSON.stringify([inlineTest]));

    await cliState.withBasePath(directory, async () => {
      const [externalTest] = await loadTestsFromGlob('cases/tests.yaml');
      for (const test of [inlineTest, externalTest]) {
        await expect(
          runAssertion({
            assertion: test.assert![0] as Assertion,
            test: test as AtomicTestCase,
            providerResponse: { output: JSON.stringify('config directory') },
          }),
        ).resolves.toMatchObject({ pass: true, score: 1 });
      }
    });
  });

  it('loads JSON parameters and renders their nested string values', async () => {
    const file = path.join(directory, 'expected.json');
    await writeFile(file, JSON.stringify({ expected: ['{{ label }}', { score: 5 }] }));

    await checkInlineAndExternal(`file://${file}`, { expected: ['rendered', { score: 5 }] });
  });

  it('loads data references nested in configured arrays and objects', async () => {
    const textFile = path.join(directory, 'expected.txt');
    const jsonFile = path.join(directory, 'expected.json');
    await writeFile(textFile, '{{ label }}');
    await writeFile(jsonFile, JSON.stringify({ enabled: true }));

    await checkInlineAndExternal(
      [`file://${textFile}`, { answer: `file://${jsonFile}` }, 5],
      ['rendered', { answer: { enabled: true } }, 5],
    );
  });

  it.each(['cjs', 'py', 'rb'])('does not execute a .%s parameter file', async (extension) => {
    const file = path.join(directory, `parameter.${extension}`);
    await writeFile(file, 'This parameter must not be loaded or executed.');

    await checkInlineAndExternal(`file://${file}`, `file://${file}`);
  });

  it.each(['txt', 'json'])(
    'does not follow references found inside a .%s data file',
    async (extension) => {
      const file = path.join(directory, `expected.${extension}`);
      const nestedReference = `file://${path.join(directory, 'missing.txt')}`;
      const expected = extension === 'json' ? { nested: nestedReference } : nestedReference;
      await writeFile(file, extension === 'json' ? JSON.stringify(expected) : nestedReference);

      await checkInlineAndExternal(`file://${file}`, expected);
    },
  );

  it('reports a missing data file instead of treating its URL as the parameter', async () => {
    const value = `file://${path.join(directory, 'missing.txt')}`;

    await expect(checkInlineAndExternal(value, value)).rejects.toThrow(/ENOENT/);
  });

  it.each(['json', 'yaml', 'jsonl'])(
    'resolves inherited script assertions before loading per-use data parameters in %s',
    async (extension) => {
      const fixture = path.join(directory, 'expected.txt');
      await writeFile(fixture, '{{ label }}');
      const rawTest = {
        vars: { fixture, label: 'rendered' },
        assert: [
          { type: 'javascript', script, value: 'default value' },
          ...[{}, { type: 'javascript' }, { script }].map((overrides) => ({
            $ref: '#/0/assert/0',
            ...overrides,
            value: 'file://{{ fixture }}',
          })),
        ],
      };
      const testFile = path.join(directory, `referenced-tests.${extension}`);
      await writeFile(
        testFile,
        extension === 'yaml'
          ? dumpYaml([rawTest])
          : JSON.stringify(extension === 'jsonl' ? rawTest : [rawTest]),
      );

      const [test] = await loadTestsFromGlob(testFile);
      for (const assertion of test.assert!.slice(1)) {
        await expect(
          runAssertion({
            assertion: assertion as Assertion,
            test: test as AtomicTestCase,
            providerResponse: { output: JSON.stringify('rendered') },
          }),
        ).resolves.toMatchObject({ pass: true, score: 1 });
      }
    },
  );

  it('still resolves references introduced by non-script assertion data files', async () => {
    const schemaFile = path.join(directory, 'schema.json');
    await writeFile(schemaFile, JSON.stringify({ $ref: '#/0/vars/schema' }));
    const testFile = path.join(directory, 'schema-tests.json');
    await writeFile(
      testFile,
      JSON.stringify([
        {
          vars: { schema: { type: 'string' } },
          assert: [{ type: 'is-json', value: `file://${schemaFile}` }],
        },
      ]),
    );

    const [test] = await loadTestsFromGlob(testFile);
    const assertion = test.assert![0] as Assertion;
    expect(assertion.value).toEqual({ type: 'string' });
    for (const [output, pass] of [
      ['"valid"', true],
      ['123', false],
    ] as const) {
      await expect(
        runAssertion({ assertion, test: test as AtomicTestCase, providerResponse: { output } }),
      ).resolves.toMatchObject({ pass });
    }
  });

  it('preserves the existing final dereference of recursive non-script schemas', async () => {
    const testFile = path.join(directory, 'recursive-schema-tests.json');
    await writeFile(
      testFile,
      JSON.stringify([
        {
          assert: [
            {
              type: 'is-json',
              value: { type: 'object', properties: { child: { $ref: '#/0/assert/0/value' } } },
            },
          ],
        },
      ]),
    );

    const [test] = await loadTestsFromGlob(testFile);
    const schema = (test.assert![0] as Assertion).value as { properties: { child: unknown } };
    expect(schema.properties.child).toBe(schema);
  });
});
