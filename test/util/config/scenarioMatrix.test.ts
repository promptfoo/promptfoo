import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import logger from '../../../src/logger';
import { ConfigResolutionError } from '../../../src/util/config/errors';
import {
  expandScenarioConfigValues,
  loadScenarioConfigs,
  resolveFileRefFromBase,
  resolveScenarioConfigValuesRefs,
} from '../../../src/util/config/scenarioMatrix';
import { readScenarioTests } from '../../../src/util/testCaseReader';

import type { TestSuiteConfig } from '../../../src/types/index';

type ScenarioInput = Exclude<NonNullable<TestSuiteConfig['scenarios']>[number], string>;

describe('scenarioMatrix (real filesystem)', () => {
  let tmpDir: string;

  const write = (relativePath: string, contents: string): string => {
    const filePath = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
    return filePath;
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-scenario-matrix-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('resolveFileRefFromBase', () => {
    it('resolves relative refs against the base path', () => {
      expect(resolveFileRefFromBase('/base/dir', 'file://matrix.yaml')).toBe(
        `file://${path.resolve('/base/dir', 'matrix.yaml')}`,
      );
    });

    it('is idempotent for absolute refs', () => {
      const absolute = `file://${path.resolve('/base/dir', 'matrix.yaml')}`;
      expect(resolveFileRefFromBase('/other', absolute)).toBe(absolute);
    });

    it('returns non-file refs unchanged', () => {
      expect(resolveFileRefFromBase('/base', 'matrix.yaml')).toBe('matrix.yaml');
    });

    it('handles file:///C:/ drive forms per platform', () => {
      // Runs the win32 branch on CI's Windows shards with the real path module.
      const resolved = resolveFileRefFromBase('/base', 'file:///C:/dir/matrix.yaml');
      if (process.platform === 'win32') {
        expect(resolved).toBe('file://C:/dir/matrix.yaml');
      } else {
        // POSIX: /C:/... is already absolute and preserved verbatim.
        expect(resolved).toBe('file:///C:/dir/matrix.yaml');
      }
    });

    it('renders templated file refs before resolving them against the base path', () => {
      const matrixPath = path.join(tmpDir, 'matrix.yaml');
      vi.stubEnv('PROMPTFOO_SCENARIO_MATRIX_TEST_PATH', matrixPath);

      expect(
        resolveFileRefFromBase('/base', 'file://{{ env.PROMPTFOO_SCENARIO_MATRIX_TEST_PATH }}'),
      ).toBe(`file://${matrixPath}`);
    });

    it('uses explicit config env instead of process env', () => {
      vi.stubEnv('PROMPTFOO_SCENARIO_MATRIX_TEST_PATH', '/wrong/process/path.yaml');

      expect(
        resolveFileRefFromBase(tmpDir, 'file://{{ env.PROMPTFOO_SCENARIO_MATRIX_TEST_PATH }}', {
          PROMPTFOO_SCENARIO_MATRIX_TEST_PATH: 'matrix.yaml',
        }),
      ).toBe(`file://${path.join(tmpDir, 'matrix.yaml')}`);
    });

    it('honors file-path template environment policy', () => {
      vi.stubEnv('PROMPTFOO_SCENARIO_MATRIX_TEST_PATH', '/process-only/secret.yaml');
      vi.stubEnv('PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS', 'true');

      const processOnly = resolveFileRefFromBase(
        tmpDir,
        'file://{{ env.PROMPTFOO_SCENARIO_MATRIX_TEST_PATH }}',
        {},
      );
      expect(processOnly).not.toContain('/process-only/secret.yaml');

      const configDefined = resolveFileRefFromBase(
        tmpDir,
        'file://{{ env.PROMPTFOO_SCENARIO_MATRIX_TEST_PATH }}',
        { PROMPTFOO_SCENARIO_MATRIX_TEST_PATH: 'matrix.yaml' },
      );
      expect(configDefined).toBe(`file://${path.join(tmpDir, 'matrix.yaml')}`);

      vi.stubEnv('PROMPTFOO_DISABLE_TEMPLATING', 'true');
      expect(
        resolveFileRefFromBase(tmpDir, 'file://{{ env.PROMPTFOO_SCENARIO_MATRIX_TEST_PATH }}', {
          PROMPTFOO_SCENARIO_MATRIX_TEST_PATH: 'matrix.yaml',
        }),
      ).toContain('{{ env.PROMPTFOO_SCENARIO_MATRIX_TEST_PATH }}');
    });

    it('defaults to hiding process env in self-hosted mode', () => {
      vi.stubEnv('PROMPTFOO_SCENARIO_MATRIX_TEST_PATH', '/process-only/secret.yaml');
      vi.stubEnv('PROMPTFOO_SELF_HOSTED', 'true');

      expect(
        resolveFileRefFromBase(tmpDir, 'file://{{ env.PROMPTFOO_SCENARIO_MATRIX_TEST_PATH }}', {}),
      ).not.toContain('/process-only/secret.yaml');
      expect(
        resolveFileRefFromBase(tmpDir, 'file://{{ env.PROMPTFOO_SCENARIO_MATRIX_TEST_PATH }}', {
          PROMPTFOO_SCENARIO_MATRIX_TEST_PATH: 'matrix.yaml',
        }),
      ).toBe(`file://${path.join(tmpDir, 'matrix.yaml')}`);
    });

    it('does not use stale cliState env during a second file-path render', async () => {
      vi.stubEnv('PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS', 'true');
      write('stale-secret-matrix.yaml', '- vars:\n    source: stale\n');
      const previousConfig = cliState.config;
      cliState.config = { env: { STALE_MATRIX: 'stale-secret-matrix.yaml' } };

      let error: unknown;
      try {
        await expandScenarioConfigValues([{ $values: 'file://{{ env.NESTED_MATRIX }}' }], tmpDir, {
          NESTED_MATRIX: '{{ env.STALE_MATRIX }}',
        });
      } catch (caught) {
        error = caught;
      } finally {
        cliState.config = previousConfig;
      }

      expect(error).toBeDefined();
      expect(String(error)).not.toContain('stale-secret-matrix.yaml');
    });
  });

  describe('expandScenarioConfigValues', () => {
    it('expands $values rows and keeps inline rows in order', async () => {
      const matrixPath = write(
        'matrix.yaml',
        '- vars:\n    language: French\n- vars:\n    language: Spanish\n',
      );

      const expanded = await expandScenarioConfigValues(
        [{ $values: `file://${matrixPath}` }, { vars: { language: 'German' } }],
        tmpDir,
      );

      expect(expanded).toEqual([
        { vars: { language: 'French' } },
        { vars: { language: 'Spanish' } },
        { vars: { language: 'German' } },
      ]);
    });

    it('resolves relative $values refs against the provided base path', async () => {
      write('nested/matrix.yaml', '- vars:\n    language: French\n');

      const expanded = await expandScenarioConfigValues(
        [{ $values: 'file://matrix.yaml' }],
        path.join(tmpDir, 'nested'),
      );

      expect(expanded).toEqual([{ vars: { language: 'French' } }]);
    });

    it('wraps a single-object matrix file into one row', async () => {
      const matrixPath = write('single.yaml', 'vars:\n  language: French\n');

      const expanded = await expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]);

      expect(expanded).toEqual([{ vars: { language: 'French' } }]);
    });

    it('expands globbed matrices above the JavaScript argument limit', async () => {
      write('large-matrix.json', JSON.stringify(Array.from({ length: 150_000 }, () => ({}))));

      const expanded = await expandScenarioConfigValues([
        { $values: `file://${path.join(tmpDir, 'large-*.json')}` },
      ]);

      expect(expanded).toHaveLength(150_000);
    });

    it('supports JSON matrix files', async () => {
      const matrixPath = write('matrix.json', JSON.stringify([{ vars: { topic: 'billing' } }]));

      const expanded = await expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]);

      expect(expanded).toEqual([{ vars: { topic: 'billing' } }]);
    });

    it('canonicalizes inline scenario provider file refs against the config base', async () => {
      const expanded = await expandScenarioConfigValues(
        [
          { provider: 'file://providers/string.cjs' },
          {
            provider: {
              id: 'file://providers/options.cjs',
              label: 'options',
              config: { payload: 'file://payloads/options.txt' },
            },
          },
          {
            provider: {
              'file://providers/map.cjs': {
                label: 'map',
                config: { payload: 'file://payloads/map.txt' },
              },
            },
          },
        ],
        tmpDir,
      );

      expect(expanded).toEqual([
        { provider: `file://${path.join(tmpDir, 'providers/string.cjs')}` },
        {
          provider: {
            id: `file://${path.join(tmpDir, 'providers/options.cjs')}`,
            label: 'options',
            config: { payload: `file://${path.join(tmpDir, 'payloads/options.txt')}` },
          },
        },
        {
          provider: {
            [`file://${path.join(tmpDir, 'providers/map.cjs')}`]: {
              label: 'map',
              config: { payload: `file://${path.join(tmpDir, 'payloads/map.txt')}` },
            },
          },
        },
      ]);
    });

    it('canonicalizes matrix provider file refs against the config base', async () => {
      const matrixPath = write(
        'matrices/providers.yaml',
        '- vars:\n    case: matrix\n  provider: file://providers/matrix.cjs\n',
      );

      const expanded = await expandScenarioConfigValues(
        [{ $values: `file://${matrixPath}` }],
        tmpDir,
      );

      expect(expanded).toEqual([
        {
          vars: { case: 'matrix' },
          provider: `file://${path.join(tmpDir, 'providers/matrix.cjs')}`,
        },
      ]);
    });

    it('preserves live provider identity while canonicalizing scenario rows', async () => {
      const liveProvider = {
        id: () => 'live-provider',
        callApi: vi.fn().mockResolvedValue({ output: 'same instance' }),
        config: { nested: { value: 'unchanged' } },
      };

      const expanded = await expandScenarioConfigValues([{ provider: liveProvider }], tmpDir);

      expect(expanded[0].provider).toBe(liveProvider);
    });

    it('preserves __proto__ as provider-map data without changing the prototype', async () => {
      const provider = JSON.parse('{"__proto__":{"id":"echo","polluted":"yes"}}');

      const expanded = await expandScenarioConfigValues([{ provider }], tmpDir);
      const resolvedProvider = expanded[0].provider as Record<string, unknown>;

      expect(Object.getPrototypeOf(resolvedProvider)).toBe(Object.prototype);
      expect(Object.keys(resolvedProvider)).toEqual(['__proto__']);
      expect(Object.prototype.hasOwnProperty.call(resolvedProvider, 'id')).toBe(false);
      expect(resolvedProvider.id).toBeUndefined();
      expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
    });

    it('expands glob $values refs across files', async () => {
      write('matrices/a.yaml', '- vars:\n    language: French\n');
      write('matrices/b.yaml', '- vars:\n    language: Spanish\n');

      const expanded = await expandScenarioConfigValues([
        { $values: `file://${path.join(tmpDir, 'matrices', '*.yaml')}` },
      ]);

      expect(expanded).toHaveLength(2);
      expect(expanded).toEqual(
        expect.arrayContaining([
          { vars: { language: 'French' } },
          { vars: { language: 'Spanish' } },
        ]),
      );
    });

    it('rejects $expand with a pointer to $values', async () => {
      await expect(expandScenarioConfigValues([{ $expand: 'file://matrix.yaml' }])).rejects.toThrow(
        /do not support \$expand; use \$values/,
      );
    });

    it('rejects $values mixed with other keys', async () => {
      await expect(
        expandScenarioConfigValues([{ $values: 'file://matrix.yaml', description: 'oops' }]),
      ).rejects.toThrow(/\$values as its only key/);
    });

    it('bounds attacker-controlled key lists in diagnostics', async () => {
      const malformedRef: Record<string, unknown> = { $values: 'file://matrix.yaml' };
      for (let index = 0; index < 10_000; index++) {
        malformedRef[`attacker-key-${index}`] = true;
      }
      malformedRef['late-secret-sentinel'] = true;

      let error: unknown;
      try {
        await expandScenarioConfigValues([malformedRef]);
      } catch (caught) {
        error = caught;
      }

      const message = String(error);
      expect(error).toBeInstanceOf(ConfigResolutionError);
      expect(message.length).toBeLessThan(1_024);
      expect(message).toContain('+9994 more');
      expect(message).not.toContain('late-secret-sentinel');
    });

    it('rejects non-file:// $values refs', async () => {
      await expect(expandScenarioConfigValues([{ $values: 'matrix.yaml' }])).rejects.toThrow(
        /must be a file:\/\/ reference/,
      );
    });

    it('rejects non-string $values', async () => {
      await expect(expandScenarioConfigValues([{ $values: 42 }])).rejects.toThrow(
        /must be a file:\/\/ reference/,
      );
    });

    it('rejects string config values with a pointer to $values syntax', async () => {
      await expect(expandScenarioConfigValues('file://matrix.yaml')).rejects.toThrow(
        /config: \[\{ \$values: "file:\/\/matrix\.yaml" \}\]/,
      );
    });

    it('rejects empty matrix files instead of injecting null rows', async () => {
      const matrixPath = write('empty.yaml', '# only comments\n');

      await expect(
        expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]),
      ).rejects.toThrow(ConfigResolutionError);
      await expect(
        expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]),
      ).rejects.toThrow(/is empty/);
    });

    it('rejects non-object matrix rows instead of spreading them into tests', async () => {
      const matrixPath = write('strings.yaml', '- French\n- Spanish\n');

      await expect(
        expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]),
      ).rejects.toThrow(/must be an object/);
    });

    it.each([
      ['vars', { vars: 'super-secret-vars-value' }],
      ['assert', { assert: { type: 'equals', value: 'super-secret-assert-value' } }],
      ['options', { options: 'super-secret-options-value' }],
      ['threshold', { threshold: 'super-secret-threshold-value' }],
    ])('rejects invalid %s values without echoing matrix contents', async (_field, row) => {
      const matrixPath = write('invalid-row.json', JSON.stringify([row]));

      let error: unknown;
      try {
        await expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]);
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(ConfigResolutionError);
      expect(String(error)).toContain('invalid test case field values');
      expect(String(error)).not.toContain('super-secret');
    });

    it('reports cyclic malformed refs without serializing their values', async () => {
      const cyclic: Record<string, unknown> = { $values: 42 };
      cyclic.self = cyclic;

      await expect(expandScenarioConfigValues([cyclic])).rejects.toThrow(ConfigResolutionError);
      await expect(expandScenarioConfigValues([cyclic])).rejects.not.toThrow(
        /Converting circular structure to JSON/,
      );
    });

    it.each([
      null,
      { vars: { topic: 'billing' } },
    ])('rejects non-array scenario config values: %j', async (config) => {
      await expect(expandScenarioConfigValues(config)).rejects.toThrow(
        /Scenario config must be an array/,
      );
    });

    it('rejects nested $values rows instead of passing them through silently', async () => {
      write('outer.yaml', '- $values: file://inner.yaml\n');

      await expect(
        expandScenarioConfigValues([{ $values: `file://${path.join(tmpDir, 'outer.yaml')}` }]),
      ).rejects.toThrow(/Nested \$values references are not supported/);
    });

    it('flattens one level of nested arrays in matrix files', async () => {
      const matrixPath = write(
        'nested-arrays.json',
        JSON.stringify([[{ vars: { a: '1' } }], [{ vars: { a: '2' } }]]),
      );

      const expanded = await expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]);

      expect(expanded).toEqual([{ vars: { a: '1' } }, { vars: { a: '2' } }]);
    });

    it('rejects rows with no recognized test case fields (flat-CSV mistake)', async () => {
      const matrixPath = write('flat.yaml', '- language: French\n');

      await expect(
        expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]),
      ).rejects.toThrow(/no recognized test case fields.*nest them under "vars"/);
    });

    it('warns once per file about unrecognized fields on otherwise-valid rows', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
      const matrixPath = write(
        'typo.yaml',
        '- vars:\n    language: French\n  asserts:\n    - type: contains\n- vars:\n    language: Spanish\n  asserts:\n    - type: contains\n',
      );

      const expanded = await expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]);

      expect(expanded).toHaveLength(2);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('unrecognized test case fields [asserts]'),
      );
    });

    it('allows empty-object rows', async () => {
      const matrixPath = write('empty-row.yaml', '- {}\n- vars:\n    language: French\n');

      const expanded = await expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]);

      expect(expanded).toEqual([{}, { vars: { language: 'French' } }]);
    });

    it('rejects matrix files that contribute no rows', async () => {
      const matrixPath = write('no-rows.json', '[]');

      await expect(
        expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]),
      ).rejects.toThrow(/contributed no rows/);
    });

    it('passes through missing-file errors with the resolved path', async () => {
      await expect(
        expandScenarioConfigValues([{ $values: `file://${path.join(tmpDir, 'nope.yaml')}` }]),
      ).rejects.toThrow(/nope\.yaml/);
    });

    it('prefers an existing literal matrix path over matching glob siblings', async () => {
      const exactPath = write('configs [prod]/matrix.yaml', '- vars:\n    source: exact\n');
      write('configs p/matrix.yaml', '- vars:\n    source: decoy\n');

      await expect(
        expandScenarioConfigValues([{ $values: `file://${exactPath}` }]),
      ).resolves.toEqual([{ vars: { source: 'exact' } }]);
    });

    it('expands relative globs beneath a literal base directory with glob characters', async () => {
      const weirdDir = path.join(tmpDir, 'configs [prod]');
      write('configs [prod]/matrices/a.yaml', '- vars:\n    source: bracket-base\n');

      await expect(
        expandScenarioConfigValues([{ $values: 'file://matrices/*.yaml' }], weirdDir, {}),
      ).resolves.toEqual([{ vars: { source: 'bracket-base' } }]);
    });

    it('expands absolute globs with existing literal magic in parent directories', async () => {
      const weirdDir = path.join(tmpDir, 'configs [prod]');
      write('configs [prod]/matrices/a.yaml', '- vars:\n    source: absolute-bracket-base\n');

      await expect(
        expandScenarioConfigValues(
          [{ $values: `file://${path.join(weirdDir, 'matrices', '*.yaml')}` }],
          tmpDir,
          {},
        ),
      ).resolves.toEqual([{ vars: { source: 'absolute-bracket-base' } }]);
    });

    it('prefers a literal magic filename when both its base and child contain magic', async () => {
      const weirdDir = path.join(tmpDir, 'configs [prod]');
      write('configs [prod]/matrix[ab].yaml', '- vars:\n    source: exact-child\n');
      write('configs [prod]/matrixa.yaml', '- vars:\n    source: decoy-child\n');

      await expect(
        expandScenarioConfigValues([{ $values: 'file://matrix[ab].yaml' }], weirdDir, {}),
      ).resolves.toEqual([{ vars: { source: 'exact-child' } }]);
    });

    it.runIf(process.platform !== 'win32')(
      'preserves existing POSIX filenames containing a backslash and glob character',
      async () => {
        const exactPath = write('matrix\\*.yaml', '- vars:\n    source: exact\n');
        write('matrix/decoy.yaml', '- vars:\n    source: decoy\n');

        await expect(
          expandScenarioConfigValues([{ $values: `file://${exactPath}` }]),
        ).resolves.toEqual([{ vars: { source: 'exact' } }]);
      },
    );
  });

  describe('readScenarioTests', () => {
    it('parses scalar CSV refs through the standard test reader', async () => {
      const csvPath = write('tests.csv', 'question,__expected\nfirst,first\nsecond,second\n');

      const tests = await readScenarioTests(`file://${csvPath}`, tmpDir);

      expect(tests).toHaveLength(2);
      expect(tests?.map((test) => test.vars?.question)).toEqual(['first', 'second']);
      expect(tests?.map((test) => test.assert?.[0])).toEqual([
        { type: 'equals', value: 'first' },
        { type: 'equals', value: 'second' },
      ]);
    });

    it('executes generator objects with their config', async () => {
      const generatorPath = write(
        'generate.cjs',
        'module.exports = ({ prefix }) => [{ vars: { name: `${prefix}-one` } }, { vars: { name: `${prefix}-two` } }];\n',
      );

      const tests = await readScenarioTests({
        path: `file://${generatorPath}`,
        config: { prefix: 'generated' },
      });

      expect(tests?.map((test) => test.vars?.name)).toEqual(['generated-one', 'generated-two']);
    });

    it('rejects malformed or empty generator contributions', async () => {
      const emptyGeneratorPath = write('empty.cjs', 'module.exports = () => [];\n');
      const objectGeneratorPath = write(
        'object.cjs',
        'module.exports = () => ({ vars: { invalid: true } });\n',
      );
      const nonPlainGeneratorPath = write(
        'non-plain.cjs',
        'module.exports = () => [new Date(0)];\n',
      );

      await expect(readScenarioTests({ path: 42 })).rejects.toThrow(
        /generator must have a string path/,
      );
      await expect(readScenarioTests({ config: { prefix: 'missing-path' } })).rejects.toThrow(
        /generator must have a string path/,
      );
      await expect(readScenarioTests({ path: `file://${emptyGeneratorPath}` })).rejects.toThrow(
        /contributed no tests/,
      );
      await expect(readScenarioTests({ path: `file://${objectGeneratorPath}` })).rejects.toThrow(
        /expected an array of test cases/,
      );
      await expect(readScenarioTests({ path: `file://${nonPlainGeneratorPath}` })).rejects.toThrow(
        /test case 1 must be a plain object/,
      );
    });

    it('normalizes relative vars files from local JSON scenario tests', async () => {
      const testsPath = write('nested/tests.json', JSON.stringify([{ vars: 'vars.yaml' }]));
      write('nested/vars.yaml', 'loaded: from-json-vars-file\n');

      await expect(readScenarioTests(`file://${testsPath}`, tmpDir)).resolves.toEqual([
        expect.objectContaining({ vars: { loaded: 'from-json-vars-file' } }),
      ]);
    });

    it('preserves partial tests from local YAML scenario files', async () => {
      const testsPath = write('partial-tests.yaml', '- prompts:\n    - only-this-prompt\n- {}\n');

      await expect(readScenarioTests(`file://${testsPath}`, tmpDir)).resolves.toEqual([
        expect.objectContaining({ prompts: ['only-this-prompt'] }),
        expect.objectContaining({}),
      ]);
    });

    it.each([
      ['JSON', 'primitive-tests.json', JSON.stringify([42])],
      ['JSONL', 'primitive-tests.jsonl', '42\n'],
      ['YAML', 'primitive-tests.yaml', '- 42\n'],
      ['scalar YAML', 'primitive-scalar.yaml', '42\n'],
    ])('rejects primitive rows from local %s scenario tests', async (_format, file, contents) => {
      const testsPath = write(file, contents);

      await expect(readScenarioTests(`file://${testsPath}`, tmpDir)).rejects.toThrow(
        ConfigResolutionError,
      );
    });

    it('preserves ordinary inline tests that rely on scenario defaults', async () => {
      const inline = { prompts: ['only-this-prompt'], providerOutput: '' };

      await expect(readScenarioTests([inline])).resolves.toEqual([expect.objectContaining(inline)]);
    });

    it('preserves CLI compatibility for inline scenario tests with vars files', async () => {
      write('vars.yaml', 'loaded: from-file\n');

      await expect(
        readScenarioTests([{ vars: 'vars.yaml', prompts: ['only-this-prompt'] }], tmpDir),
      ).resolves.toEqual([
        expect.objectContaining({
          vars: { loaded: 'from-file' },
          prompts: ['only-this-prompt'],
        }),
      ]);
    });
  });

  describe('loadScenarioConfigs', () => {
    it('returns undefined for missing scenarios', async () => {
      await expect(loadScenarioConfigs(undefined)).resolves.toBeUndefined();
    });

    it('resolves inline scenario $values refs against the base path', async () => {
      const scenarios: ScenarioInput[] = [
        { config: [{ $values: 'file://matrix.yaml' }], tests: [{}] },
      ];

      const loaded = await loadScenarioConfigs(scenarios, tmpDir);

      expect(loaded?.[0].config[0]).toEqual({
        $values: `file://${path.join(tmpDir, 'matrix.yaml')}`,
      });
    });

    it('resolves $values refs in file scenarios against the scenario file directory', async () => {
      write(
        'scenarios/scenario.yaml',
        '- config:\n    - $values: file://matrix.yaml\n  tests:\n    - {}\n',
      );

      const loaded = await loadScenarioConfigs(
        [`file://${path.join(tmpDir, 'scenarios', 'scenario.yaml')}`],
        tmpDir,
      );

      expect(loaded?.[0].config[0]).toEqual({
        $values: `file://${path.join(tmpDir, 'scenarios', 'matrix.yaml')}`,
      });
    });

    it('resolves generator paths and nested config refs against the declaring scenario file', async () => {
      write(
        'scenarios/scenario.yaml',
        '- config:\n    - vars:\n        topic: billing\n  tests:\n    - path: file://generate.cjs\n      config:\n        prefix: nested\n',
      );

      const loaded = await loadScenarioConfigs(
        [`file://${path.join(tmpDir, 'scenarios', 'scenario.yaml')}`],
        tmpDir,
      );

      const tests = loaded?.[0].tests;
      expect(Array.isArray(tests) ? tests[0] : undefined).toEqual({
        path: `file://${path.join(tmpDir, 'scenarios', 'generate.cjs')}`,
        config: { prefix: 'nested' },
      });
    });

    it('resolves file refs nested in generator config against the scenario file', async () => {
      write(
        'scenarios/scenario.yaml',
        '- config:\n    - {}\n  tests:\n    - path: file://generate.cjs\n      config:\n        data: file://data.json\n',
      );

      const loaded = await loadScenarioConfigs(
        [`file://${path.join(tmpDir, 'scenarios', 'scenario.yaml')}`],
        tmpDir,
      );

      const tests = loaded?.[0].tests;
      expect(Array.isArray(tests) ? tests[0] : undefined).toEqual({
        path: `file://${path.join(tmpDir, 'scenarios', 'generate.cjs')}`,
        config: { data: `file://${path.join(tmpDir, 'scenarios', 'data.json')}` },
      });
    });

    it('resolves inline test vars files against the declaring scenario file', async () => {
      write(
        'scenarios/scenario.yaml',
        '- config:\n    - {}\n  tests:\n    - vars: vars.yaml\n    - vars: file://vars.yaml\n',
      );
      write('scenarios/vars.yaml', 'source: nested-scenario\n');

      const loaded = await loadScenarioConfigs(
        [`file://${path.join(tmpDir, 'scenarios', 'scenario.yaml')}`],
        tmpDir,
      );
      const tests = await readScenarioTests(loaded?.[0].tests, tmpDir);

      expect(tests).toEqual([
        expect.objectContaining({ vars: { source: 'nested-scenario' } }),
        expect.objectContaining({ vars: { source: 'nested-scenario' } }),
      ]);
    });

    it('preserves non-plain values in programmatic generator config', async () => {
      const when = new Date('2020-01-01T00:00:00.000Z');
      const loaded = await loadScenarioConfigs(
        [
          {
            config: [{}],
            tests: { path: 'file://generate.cjs', config: { when } },
          } as ScenarioInput,
        ],
        tmpDir,
      );

      const tests = loaded?.[0].tests;
      const config = Array.isArray(tests)
        ? (tests[0] as { config?: { when?: unknown } }).config
        : (tests as { config?: { when?: unknown } } | undefined)?.config;
      expect(config?.when).toBe(when);
    });

    it('renders templated scenario file refs before loading them', async () => {
      const scenarioPath = write(
        'scenarios/scenario.yaml',
        '- config:\n    - vars:\n        topic: billing\n  tests:\n    - {}\n',
      );
      vi.stubEnv('PROMPTFOO_SCENARIO_FILE_TEST_PATH', scenarioPath);

      const loaded = await loadScenarioConfigs([
        'file://{{ env.PROMPTFOO_SCENARIO_FILE_TEST_PATH }}',
      ]);

      expect(loaded).toHaveLength(1);
      expect(loaded?.[0].config).toEqual([{ vars: { topic: 'billing' } }]);
    });

    it('resolves $values per matched file for glob scenarios', async () => {
      write(
        'scenarios/unit/scenario.yaml',
        '- config:\n    - $values: file://matrix.yaml\n  tests:\n    - {}\n',
      );
      write(
        'scenarios/integration/scenario.yaml',
        '- config:\n    - $values: file://matrix.yaml\n  tests:\n    - {}\n',
      );

      const loaded = await loadScenarioConfigs(
        [`file://${path.join(tmpDir, 'scenarios', '**', 'scenario.yaml')}`],
        tmpDir,
      );

      const refs = loaded?.map((scenario) =>
        'config' in scenario ? scenario.config[0] : undefined,
      );
      expect(refs).toEqual(
        expect.arrayContaining([
          { $values: `file://${path.join(tmpDir, 'scenarios', 'unit', 'matrix.yaml')}` },
          { $values: `file://${path.join(tmpDir, 'scenarios', 'integration', 'matrix.yaml')}` },
        ]),
      );
    });

    it('rejects bare scenario strings instead of mangling them', async () => {
      await expect(loadScenarioConfigs(['scenario.yaml'], tmpDir)).rejects.toThrow(
        /must be objects or file:\/\/ references/,
      );
    });

    it('loads plain refs from directories whose names contain glob metacharacters', async () => {
      const weirdDir = path.join(tmpDir, 'configs [prod]');
      fs.mkdirSync(weirdDir, { recursive: true });
      fs.writeFileSync(
        path.join(weirdDir, 'scenario.yaml'),
        '- config:\n    - vars:\n        a: "1"\n  tests:\n    - {}\n',
      );

      const loaded = await loadScenarioConfigs(['file://scenario.yaml'], weirdDir);

      expect(loaded).toHaveLength(1);
      expect(loaded?.[0].config).toEqual([{ vars: { a: '1' } }]);
    });

    it('loads refs whose own path contains glob metacharacters in a directory name', async () => {
      // combineConfigs absolutizes scenario refs, baking bracketed parent dirs into
      // the ref itself; the glob branch must fall back to the literal file.
      const weirdDir = path.join(tmpDir, 'configs [prod]');
      fs.mkdirSync(weirdDir, { recursive: true });
      fs.writeFileSync(
        path.join(weirdDir, 'scenario.yaml'),
        '- config:\n    - vars:\n        a: "1"\n  tests:\n    - {}\n',
      );

      const loaded = await loadScenarioConfigs(
        [`file://${path.join(weirdDir, 'scenario.yaml')}`],
        tmpDir,
      );

      expect(loaded).toHaveLength(1);
      expect(loaded?.[0].config).toEqual([{ vars: { a: '1' } }]);
    });

    it('prefers an existing literal scenario path over matching glob siblings', async () => {
      const exactPath = write(
        'configs [prod]/scenario.yaml',
        '- config:\n    - vars:\n        source: exact\n  tests:\n    - {}\n',
      );
      write(
        'configs p/scenario.yaml',
        '- config:\n    - vars:\n        source: decoy\n  tests:\n    - {}\n',
      );

      const loaded = await loadScenarioConfigs([`file://${exactPath}`], tmpDir);

      expect(loaded?.[0].config).toEqual([{ vars: { source: 'exact' } }]);
    });

    it('expands scenario globs beneath literal base directories with glob characters', async () => {
      const weirdDir = path.join(tmpDir, 'configs [prod]');
      write(
        'configs [prod]/scenarios/a.yaml',
        '- config:\n    - vars:\n        source: bracket-base\n  tests:\n    - {}\n',
      );

      const loaded = await loadScenarioConfigs(['file://scenarios/*.yaml'], weirdDir, {});

      expect(loaded?.[0].config).toEqual([{ vars: { source: 'bracket-base' } }]);
    });

    it('rejects scenario files containing non-object entries', async () => {
      write('bad-scenario.yaml', '- just-a-string\n');

      await expect(
        loadScenarioConfigs([`file://${path.join(tmpDir, 'bad-scenario.yaml')}`], tmpDir),
      ).rejects.toThrow(/must contain scenario objects.*string/);
    });

    it('throws a clear error when a scenario glob matches nothing', async () => {
      await expect(
        loadScenarioConfigs([`file://${path.join(tmpDir, 'missing', '*.yaml')}`], tmpDir),
      ).rejects.toThrow(/No files found matching pattern/);
    });

    it('rejects scenario files that contribute no scenarios', async () => {
      const emptyPath = write('empty-scenarios.json', '[]');

      await expect(loadScenarioConfigs([`file://${emptyPath}`], tmpDir, {})).rejects.toThrow(
        /contributed no scenarios/,
      );
    });
  });

  describe('resolveScenarioConfigValuesRefs', () => {
    it('leaves plain rows untouched and resolves only $values rows', () => {
      const scenario: ScenarioInput = {
        config: [{ vars: { a: '1' } }, { $values: 'file://matrix.yaml' }],
        tests: [{}],
      };

      const resolved = resolveScenarioConfigValuesRefs('/base', scenario);

      expect(resolved.config).toEqual([
        { vars: { a: '1' } },
        { $values: `file://${path.resolve('/base', 'matrix.yaml')}` },
      ]);
    });
  });
});
