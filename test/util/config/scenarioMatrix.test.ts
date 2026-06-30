import fs from 'fs';
import { syncBuiltinESMExports } from 'module';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import logger from '../../../src/logger';
import { ConfigResolutionError } from '../../../src/util/config/errors';
import { toSerializableScenarioTestCase } from '../../../src/util/config/persistableScenario';
import {
  getScenarioDependencyContext,
  getScenarioSourceContext,
  getScenarioTestSourceContext,
  PERSISTED_SCENARIO_SOURCE_KEY,
  setScenarioOriginalValue,
  setScenarioTestSourceContext,
} from '../../../src/util/config/scenarioContext';
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

    it('preserves executable function names while resolving refs', () => {
      expect(resolveFileRefFromBase('/base/dir', 'file://score.js:customScore')).toBe(
        `file://${path.resolve('/base/dir', 'score.js')}:customScore`,
      );
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

  describe('scenario dependency tracking', () => {
    it('tracks literal magic filenames exactly and uses the nearest glob directory', () => {
      const exactPath = write('configs [prod]/scenario[one].yaml', '[]\n');
      write('configs [prod]/matrices/a.yaml', '- vars:\n    source: a\n');

      expect(getScenarioDependencyContext(exactPath, tmpDir)).toEqual({
        dependencies: [exactPath],
      });
      expect(
        getScenarioDependencyContext(path.join(tmpDir, 'configs [prod]/matrices/*.yaml'), tmpDir),
      ).toEqual({
        dependencies: [path.join(tmpDir, 'configs [prod]/matrices/a.yaml')],
        watchRoots: [path.join(tmpDir, 'configs [prod]/matrices')],
      });
    });

    it('does not let persisted context markers bypass disabled process-env templating', async () => {
      vi.stubEnv('PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS', 'true');
      vi.stubEnv('PR9695_MARKER_SECRET', 'must-not-be-injected');
      const scenario = {
        config: [{}],
        tests: [{}],
        [PERSISTED_SCENARIO_SOURCE_KEY]: {
          version: 1,
          basePath: tmpDir,
          processEnvKeys: ['PR9695_MARKER_SECRET'],
        },
      };

      const [loaded] = (await loadScenarioConfigs([scenario as never], tmpDir)) ?? [];

      expect(loaded).toBeDefined();
      expect(getScenarioSourceContext(loaded!)?.envOverrides?.PR9695_MARKER_SECRET).toBeUndefined();
    });

    it('tracks nested files consumed by matrix rows but not opaque metadata', async () => {
      const matrixPath = write(
        'matrices/rows.yaml',
        `- vars:
    body: file://body.txt
  provider: file://provider.cjs
  metadata:
    artifact: file://opaque.txt
`,
      );
      const bodyPath = write('matrices/body.txt', 'body');
      const providerPath = write('matrices/provider.cjs', 'module.exports = {}');
      const opaquePath = write('matrices/opaque.txt', 'opaque');

      const [row] = await expandScenarioConfigValues([{ $values: `file://${matrixPath}` }], tmpDir);
      const context = getScenarioTestSourceContext(row);

      expect(context?.dependencies).toEqual(
        expect.arrayContaining([matrixPath, bodyPath, providerPath]),
      );
      expect(context?.dependencies).not.toContain(opaquePath);
    });
  });

  describe('scenario persistence', () => {
    it('serializes cyclic assertion sets without retaining a JSON cycle', () => {
      const assertion: Record<string, unknown> = { type: 'assert-set', assert: [] };
      (assertion.assert as unknown[]).push(assertion);

      const serialized = toSerializableScenarioTestCase({ assert: [assertion] });

      expect(() => JSON.stringify(serialized)).not.toThrow();
      expect(serialized).toEqual({ assert: [{ type: 'assert-set', assert: [] }] });
    });

    it('preserves credential templates while redacting rendered provider secrets', () => {
      const template = '{{ env.PR9695_PROVIDER_SECRET }}';
      const bearerTemplate = 'Bearer {{ env.PR9695_PROVIDER_SECRET }}';
      const literalSecret = 'sk-live-{{literal}}-abcdefghijklmnop';
      const mixedSecret = 'Bearer literal-secret-canary-9695 {{ env.NONSECRET }}';
      const fallbackSecret = '{{ env.PR9695_PROVIDER_SECRET or "literal-secret-fallback" }}';

      const serialized = toSerializableScenarioTestCase({
        provider: {
          id: 'echo',
          config: {
            apiKey: template,
            authorization: bearerTemplate,
            password: literalSecret,
            token: mixedSecret,
            clientSecret: fallbackSecret,
          },
        },
      });

      expect(serialized).toEqual({
        provider: {
          id: 'echo',
          config: {
            apiKey: template,
            authorization: bearerTemplate,
            password: '[REDACTED]',
            token: '[REDACTED]',
            clientSecret: '[REDACTED]',
          },
        },
      });
      expect(JSON.stringify(serialized)).not.toContain(literalSecret);
      expect(JSON.stringify(serialized)).not.toContain(mixedSecret);
      expect(JSON.stringify(serialized)).not.toContain('literal-secret-fallback');
    });

    it('merges persisted source env over replay env after secret values are omitted', async () => {
      const runtimeRow = {
        vars: { safe: 'source-safe', token: 'source-secret' },
      };
      setScenarioOriginalValue(runtimeRow, {
        vars: { safe: '{{ env.SAFE }}', token: '{{ env.SECRET }}' },
      });
      setScenarioTestSourceContext(runtimeRow, {
        basePath: tmpDir,
        envOverrides: { SAFE: 'source-safe', SECRET: 'source-secret' },
      });
      const serialized = toSerializableScenarioTestCase(runtimeRow);

      const expanded = await expandScenarioConfigValues([serialized], tmpDir, {
        SAFE: 'replay-safe',
        SECRET: 'rotated-secret',
      });

      expect(expanded).toEqual([{ vars: { safe: 'source-safe', token: 'rotated-secret' } }]);
    });

    it('restores mixed and filtered env templates in arbitrary scenario fields', () => {
      const runtimeRow = {
        vars: {
          endpoint: 'https://example.test/?token=initial-secret',
          normalized: 'INITIAL-SECRET',
        },
      };
      setScenarioOriginalValue(runtimeRow, {
        vars: {
          endpoint: 'https://example.test/?token={{ env.SECRET }}',
          normalized: '{{ env.SECRET | trim | upper }}',
        },
      });

      expect(toSerializableScenarioTestCase(runtimeRow)).toEqual({
        vars: {
          endpoint: 'https://example.test/?token={{ env.SECRET }}',
          normalized: '{{ env.SECRET | trim | upper }}',
        },
      });
    });

    it('preserves provider templates from inline scenario tests', async () => {
      const [scenario] = (await loadScenarioConfigs(
        [
          {
            config: [{}],
            tests: [
              {
                provider: {
                  id: 'echo',
                  config: { apiKey: '{{ env.INLINE_TEST_SECRET }}' },
                },
              },
            ],
          },
        ],
        tmpDir,
        { INLINE_TEST_SECRET: 'initial-secret-value' },
      ))!;
      const [runtimeTest] = (await readScenarioTests(scenario.tests, tmpDir, {
        INLINE_TEST_SECRET: 'initial-secret-value',
      }))!;

      expect(toSerializableScenarioTestCase(runtimeTest)).toMatchObject({
        provider: {
          id: 'echo',
          config: { apiKey: '{{ env.INLINE_TEST_SECRET }}' },
        },
      });
    });
  });

  describe('expandScenarioConfigValues', () => {
    it('redacts sensitive rendered env values from matrix path errors and causes', async () => {
      const secret = 'super-secret-canary-9695';
      const processSecret = 'process-secret-canary-9695';
      vi.stubEnv('PROCESS_PATH_SECRET', processSecret);

      let error: unknown;
      try {
        await expandScenarioConfigValues(
          [{ $values: 'file://{{ env.PATH_SECRET }}/missing.json' }],
          tmpDir,
          { PATH_SECRET: secret },
        );
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(ConfigResolutionError);
      expect(String(error)).not.toContain(secret);
      expect(String((error as Error & { cause?: unknown }).cause)).not.toContain(secret);

      let processError: unknown;
      try {
        await expandScenarioConfigValues(
          [{ $values: 'file://{{ env.PROCESS_PATH_SECRET }}/missing.json' }],
          tmpDir,
        );
      } catch (caught) {
        processError = caught;
      }

      expect(processError).toBeInstanceOf(ConfigResolutionError);
      expect(String(processError)).not.toContain(processSecret);
      expect(String((processError as Error & { cause?: unknown }).cause)).not.toContain(
        processSecret,
      );

      const filterSecret = 'sk-live/secret+abcdefghijklmnop';
      let filteredError: unknown;
      try {
        await expandScenarioConfigValues(
          [{ $values: 'file://{{ env.FILTER_SECRET | urlencode }}/missing.json' }],
          tmpDir,
          { FILTER_SECRET: filterSecret },
        );
      } catch (caught) {
        filteredError = caught;
      }

      expect(filteredError).toBeInstanceOf(ConfigResolutionError);
      expect(String(filteredError)).not.toContain(encodeURIComponent(filterSecret));
      expect(String((filteredError as Error & { cause?: unknown }).cause)).not.toContain(
        encodeURIComponent(filterSecret),
      );
    });

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

    it('canonicalizes matrix provider file refs against the matrix file', async () => {
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
          provider: `file://${path.join(tmpDir, 'matrices/providers/matrix.cjs')}`,
        },
      ]);
    });

    it('canonicalizes prefixed matrix provider paths against the matrix file', async () => {
      const matrixPath = write(
        'matrices/script-providers.yaml',
        `- vars:
    case: provider-string
  provider: python:./target.py
- vars:
    case: provider-basename
  provider: python:provider.py
- vars:
    case: provider-basename-function
  provider: python:provider.py:custom
- vars:
    case: provider-object
  provider:
    id: exec:./target.sh
- vars:
    case: provider-exec-command
  provider: exec:node ./provider.js --endpoint https://api.example/v1
- vars:
    case: provider-exec-basename-arg
  provider: exec:node handler.js --endpoint https://api.example/v1
- vars:
    case: provider-exec-basename-command
  provider: exec:handler.js
- vars:
    case: provider-map
  provider:
    "golang:./target.go":
      label: local-go-provider
- vars:
    case: provider-ruby-map
  provider:
    "ruby:provider.rb":
      label: local-ruby-provider
`,
      );

      const expanded = await expandScenarioConfigValues(
        [{ $values: `file://${matrixPath}` }],
        tmpDir,
      );

      expect(expanded).toEqual([
        {
          vars: { case: 'provider-string' },
          provider: `python:${path.join(tmpDir, 'matrices/target.py')}`,
        },
        {
          vars: { case: 'provider-basename' },
          provider: `python:${path.join(tmpDir, 'matrices/provider.py')}`,
        },
        {
          vars: { case: 'provider-basename-function' },
          provider: `python:${path.join(tmpDir, 'matrices/provider.py')}:custom`,
        },
        {
          vars: { case: 'provider-object' },
          provider: {
            id: `exec:${path.join(tmpDir, 'matrices/target.sh')}`,
          },
        },
        {
          vars: { case: 'provider-exec-command' },
          provider: `exec:node ${path.join(tmpDir, 'matrices/provider.js')} --endpoint https://api.example/v1`,
        },
        {
          vars: { case: 'provider-exec-basename-arg' },
          provider: `exec:node ${path.join(tmpDir, 'matrices/handler.js')} --endpoint https://api.example/v1`,
        },
        {
          vars: { case: 'provider-exec-basename-command' },
          provider: `exec:${path.join(tmpDir, 'matrices/handler.js')}`,
        },
        {
          vars: { case: 'provider-map' },
          provider: {
            [`golang:${path.join(tmpDir, 'matrices/target.go')}`]: {
              label: 'local-go-provider',
            },
          },
        },
        {
          vars: { case: 'provider-ruby-map' },
          provider: {
            [`ruby:${path.join(tmpDir, 'matrices/provider.rb')}`]: {
              label: 'local-ruby-provider',
            },
          },
        },
      ]);
    });

    it('preserves quoted exec arguments while canonicalizing only local path tokens', async () => {
      const matrixPath = write(
        'matrices/exec.yaml',
        `- provider: >-
    exec:node ./provider.js --config '{"message":"hello world"}' "" --label "two words"
`,
      );

      const [expanded] = await expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]);

      expect(expanded.provider).toBe(
        `exec:node ${path.join(tmpDir, 'matrices/provider.js')} --config '{"message":"hello world"}' "" --label "two words"`,
      );
    });

    it('keeps ProviderOptionsMap config strings opaque while resolving explicit file refs', async () => {
      const matrixPath = write(
        'matrices/provider-map-config.yaml',
        `- provider:
    http:
      config:
        body:
          callback: ./callback.js
          runtime: python:./nested.py
          payload: file://payload.json
`,
      );

      const [expanded] = await expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]);

      expect(expanded.provider).toEqual({
        http: {
          config: {
            body: {
              callback: './callback.js',
              runtime: 'python:./nested.py',
              payload: `file://${path.join(tmpDir, 'matrices/payload.json')}`,
            },
          },
        },
      });
    });

    it('canonicalizes bare matrix provider map keys against the matrix file', async () => {
      const matrixPath = write(
        'matrices/provider-map.yaml',
        `- vars:
    case: provider-map
  provider:
    "./provider.cjs":
      label: local-provider
`,
      );

      const expanded = await expandScenarioConfigValues(
        [{ $values: `file://${matrixPath}` }],
        tmpDir,
      );

      expect(expanded).toEqual([
        {
          vars: { case: 'provider-map' },
          provider: {
            [path.join(tmpDir, 'matrices/provider.cjs')]: {
              label: 'local-provider',
            },
          },
        },
      ]);
    });

    it('materializes matrix row file refs against the matrix file', async () => {
      const matrixPath = write(
        'matrices/rows.yaml',
        `- vars:
    case: files
  providerOutput: file://output.txt
  assertScoringFunction: file://score.js:customScore
  assert:
    - type: contains
      value: file://expected.txt
    - type: javascript
      value: file://script.js
`,
      );
      write('matrices/output.txt', 'MODEL_OUTPUT');
      write('matrices/expected.txt', 'EXPECTED');
      write('matrices/script.js', 'module.exports = () => true;\n');

      const [expanded] = await expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]);
      const matrixDir = path.dirname(matrixPath);

      expect(expanded).toEqual({
        vars: { case: 'files' },
        providerOutput: 'MODEL_OUTPUT',
        assertScoringFunction: `file://${path.join(matrixDir, 'score.js')}:customScore`,
        assert: [
          { type: 'contains', value: 'EXPECTED' },
          { type: 'javascript', value: `file://${path.join(matrixDir, 'script.js')}` },
        ],
      });
    });

    it('renders matrix scoring function templates before validating rows', async () => {
      const matrixPath = write(
        'matrices/scorers.yaml',
        `- vars:
    case: scorer
  assertScoringFunction: file://{{ env.SCORE_FILE }}:customScore
`,
      );
      write('matrices/score.js', 'module.exports = () => ({ pass: true, score: 1 });\n');

      const [expanded] = await expandScenarioConfigValues(
        [{ $values: `file://${matrixPath}` }],
        tmpDir,
        { SCORE_FILE: 'score.js' },
      );

      expect(expanded).toMatchObject({
        vars: { case: 'scorer' },
        assertScoringFunction: `file://${path.join(path.dirname(matrixPath), 'score.js')}:customScore`,
      });
    });

    it('renders matrix provider templates with the source env', async () => {
      const previousConfig = cliState.config;
      cliState.config = { env: { PROVIDER_ID: 'wrong-provider' } };
      const matrixPath = write(
        'matrices/providers.yaml',
        `- vars:
    case: env-provider
  provider: "{{ env.PROVIDER_ID }}"
  options:
    provider:
      id: "{{ env.GRADER_ID }}"
`,
      );

      try {
        const [expanded] = await expandScenarioConfigValues(
          [{ $values: `file://${matrixPath}` }],
          tmpDir,
          {
            PROVIDER_ID: 'echo',
            GRADER_ID: 'openai:gpt-4o-mini',
          },
        );

        expect(expanded.provider).toBe('echo');
        expect(expanded.options?.provider).toEqual({ id: 'openai:gpt-4o-mini' });
      } finally {
        cliState.config = previousConfig;
      }
    });

    it('renders matrix provider and prompt filters with the source env', async () => {
      const matrixPath = write(
        'matrices/filters.yaml',
        `- vars:
    case: filters
  providers:
    - "{{ env.PROVIDER_LABEL }}"
  prompts:
    - "{{ env.PROMPT_ID }}"
`,
      );

      const [expanded] = await expandScenarioConfigValues(
        [{ $values: `file://${matrixPath}` }],
        tmpDir,
        { PROVIDER_LABEL: 'scenario-provider', PROMPT_ID: 'main-prompt' },
      );

      expect(expanded).toMatchObject({
        vars: { case: 'filters' },
        providers: ['scenario-provider'],
        prompts: ['main-prompt'],
      });
    });

    it('renders matrix row data with the source env', async () => {
      const matrixPath = write(
        'matrices/env-data.yaml',
        `- vars:
    tenant: "{{ env.TENANT }}"
  providerOutput: "{{ env.PROVIDER_OUTPUT }}"
  assert:
    - type: contains
      value: "{{ env.EXPECTED_OUTPUT }}"
`,
      );

      const [expanded] = await expandScenarioConfigValues(
        [{ $values: `file://${matrixPath}` }],
        tmpDir,
        {
          TENANT: 'acme',
          PROVIDER_OUTPUT: 'hello acme',
          EXPECTED_OUTPUT: 'hello',
        },
      );

      expect(expanded).toMatchObject({
        vars: { tenant: 'acme' },
        providerOutput: 'hello acme',
        assert: [{ type: 'contains', value: 'hello' }],
      });
    });

    it('resolves bare typed grader refs in matrix rows against the matrix file', async () => {
      const matrixPath = write(
        'matrices/typed-graders.yaml',
        `- vars:
    case: typed-grader
  options:
    provider:
      text: ./grader.cjs
  assert:
    - type: llm-rubric
      value: pass
      provider:
        text: ./assert-grader.cjs
`,
      );

      const [expanded] = await expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]);
      const matrixDir = path.dirname(matrixPath);

      expect(expanded.options?.provider).toEqual({
        text: path.join(matrixDir, 'grader.cjs'),
      });
      expect(expanded.assert?.[0]).toMatchObject({
        provider: {
          text: path.join(matrixDir, 'assert-grader.cjs'),
        },
      });
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

    it('loads file refs in rows that also contain live providers', async () => {
      const liveProvider = {
        id: () => 'live-provider',
        callApi: vi.fn().mockResolvedValue({ output: 'same instance' }),
      };
      write('output.txt', 'MODEL_OUTPUT');
      write('expected.txt', 'EXPECTED');

      const [expanded] = await expandScenarioConfigValues(
        [
          {
            provider: liveProvider,
            providerOutput: 'file://output.txt',
            assert: [{ type: 'contains', value: 'file://expected.txt' }],
          },
        ],
        tmpDir,
      );

      expect(expanded.provider).toBe(liveProvider);
      expect(expanded.providerOutput).toBe('MODEL_OUTPUT');
      expect(expanded.assert).toEqual([{ type: 'contains', value: 'EXPECTED' }]);
    });

    it('preserves live grader provider identity inside typed provider maps', async () => {
      const liveProvider = {
        id: () => 'live-grader',
        callApi: vi.fn().mockResolvedValue({ output: 'same instance' }),
      };

      const [expanded] = await expandScenarioConfigValues([
        { options: { provider: { text: liveProvider } } },
      ]);
      const providerMap = expanded.options?.provider as { text: typeof liveProvider };

      expect(providerMap.text).toBe(liveProvider);
    });

    it('rejects cyclic assertion sets before recursive materialization', async () => {
      const assertion: Record<string, unknown> = {
        type: 'assert-set',
        provider: 'file://grader.cjs',
        assert: [],
      };
      (assertion.assert as unknown[]).push(assertion);

      await expect(
        expandScenarioConfigValues([{ vars: { case: 'cyclic' }, assert: [assertion] }], tmpDir),
      ).rejects.toThrow(/contains a cycle/);
    });

    it('bounds deeply nested assertion and typed-provider config values', async () => {
      let assertion: Record<string, unknown> = { type: 'equals', value: 'ok' };
      let providerConfig: unknown = 'ok';
      for (let index = 0; index < 110; index++) {
        assertion = { type: 'assert-set', assert: [assertion] };
        providerConfig = { nested: providerConfig };
      }

      await expect(expandScenarioConfigValues([{ assert: [assertion] }], tmpDir)).rejects.toThrow(
        /maximum nesting depth/,
      );
      await expect(
        readScenarioTests(
          [{ options: { provider: { text: { id: 'echo', config: providerConfig } } } }],
          tmpDir,
        ),
      ).rejects.toThrow(/maximum nesting depth/);
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

    it('ignores inherited provider fields from a polluted prototype', async () => {
      const inheritedKeys = ['provider', 'options', 'assert', 'id', 'callApi', 'payload'] as const;
      for (const key of inheritedKeys) {
        Object.defineProperty(Object.prototype, key, {
          get: () => {
            throw new Error(`inherited ${key} getter ran`);
          },
          configurable: true,
        });
      }
      try {
        const [expanded] = await expandScenarioConfigValues(
          [
            {
              vars: { safe: true },
              options: {
                provider: {
                  id: 'file://grader.cjs',
                  config: { payload: 'file://payload.txt' },
                },
              },
              assert: [{ type: 'equals', value: 'safe' }],
            },
          ],
          tmpDir,
        );

        expect(expanded.vars).toEqual({ safe: true });
        expect(expanded.options?.provider).toEqual({
          id: `file://${path.join(tmpDir, 'grader.cjs')}`,
          config: { payload: `file://${path.join(tmpDir, 'payload.txt')}` },
        });
      } finally {
        for (const key of inheritedKeys) {
          delete (Object.prototype as Record<string, unknown>)[key];
        }
      }
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

    it('allows empty files when another globbed matrix contributes rows', async () => {
      write('matrices/a.yaml', '# intentionally empty\n');
      write('matrices/b.yaml', '- vars:\n    language: French\n');

      await expect(
        expandScenarioConfigValues([
          { $values: `file://${path.join(tmpDir, 'matrices', '*.yaml')}` },
        ]),
      ).resolves.toEqual([{ vars: { language: 'French' } }]);
    });

    it('resolves provider refs against each concrete globbed matrix file', async () => {
      write('matrices/a/rows.yaml', '- vars:\n    source: a\n  provider: file://provider.cjs\n');
      write('matrices/b/rows.yaml', '- vars:\n    source: b\n  provider: file://provider.cjs\n');

      const expanded = await expandScenarioConfigValues([
        { $values: `file://${path.join(tmpDir, 'matrices', '**', 'rows.yaml')}` },
      ]);

      expect(expanded).toEqual(
        expect.arrayContaining([
          {
            vars: { source: 'a' },
            provider: `file://${path.join(tmpDir, 'matrices/a/provider.cjs')}`,
          },
          {
            vars: { source: 'b' },
            provider: `file://${path.join(tmpDir, 'matrices/b/provider.cjs')}`,
          },
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

    it('rejects Date rows and cyclic or excessively deep values before evaluation', async () => {
      await expect(expandScenarioConfigValues([new Date() as never])).rejects.toThrow(
        /must be an object/,
      );

      const cyclicVars: Record<string, unknown> = {};
      cyclicVars.self = cyclicVars;
      await expect(expandScenarioConfigValues([{ vars: cyclicVars }])).rejects.toThrow(/cycle/);

      const deepVars: Record<string, unknown> = {};
      let cursor = deepVars;
      for (let depth = 0; depth < 100; depth++) {
        cursor.child = {};
        cursor = cursor.child as Record<string, unknown>;
      }
      await expect(expandScenarioConfigValues([{ vars: deepVars }])).rejects.toThrow(
        /maximum nesting depth/,
      );
    });

    it('attributes malformed flat rows to their concrete file and row number', async () => {
      const matrixPath = write(
        'matrices/invalid-row.json',
        JSON.stringify([{ vars: { valid: true } }, { language: 'French' }]),
      );

      await expect(
        expandScenarioConfigValues([{ $values: `file://${matrixPath}` }]),
      ).rejects.toThrow(/row 2 from file:\/\/.*invalid-row\.json.*no recognized test case fields/);
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

    it('skips glob matches that disappear after enumeration', async () => {
      write('matrices/a.yaml', '- vars:\n    source: kept\n');
      const disappearingPath = write('matrices/b.yaml', '- vars:\n    source: disappearing\n');
      const readFileSync = fs.readFileSync.bind(fs);
      fs.readFileSync = ((filePath, ...args) => {
        if (path.resolve(String(filePath)) === disappearingPath) {
          throw Object.assign(new Error('simulated disappearance'), { code: 'ENOENT' });
        }
        return Reflect.apply(readFileSync, fs, [filePath, ...args]);
      }) as typeof fs.readFileSync;
      syncBuiltinESMExports();

      try {
        await expect(
          expandScenarioConfigValues([{ $values: 'file://matrices/*.yaml' }], tmpDir, {}),
        ).resolves.toEqual([{ vars: { source: 'kept' } }]);
      } finally {
        fs.readFileSync = readFileSync;
        syncBuiltinESMExports();
      }
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

    it('supports brace-only matrix globs and excludes matching directories', async () => {
      write('matrices/a.yaml', '- vars:\n    source: a\n');
      write('matrices/b.yaml', '- vars:\n    source: b\n');
      fs.mkdirSync(path.join(tmpDir, 'matrices', 'directory.yaml'));

      await expect(
        expandScenarioConfigValues([{ $values: 'file://matrices/{a,b}.yaml' }], tmpDir, {}),
      ).resolves.toEqual(
        expect.arrayContaining([{ vars: { source: 'a' } }, { vars: { source: 'b' } }]),
      );

      await expect(
        expandScenarioConfigValues([{ $values: 'file://matrices/*.yaml' }], tmpDir, {}),
      ).resolves.toHaveLength(2);
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

    it('resolves grader refs in file-backed scenario tests against the test file', async () => {
      const testsPath = write(
        'tests/cases.yaml',
        `- vars:
    case: grader
  options:
    provider:
      id: file://grader.cjs
      config:
        payload: file://payload.txt
  assert:
    - type: llm-rubric
      value: pass
      provider: file://assert-grader.yaml
`,
      );

      const tests = await readScenarioTests(`file://${testsPath}`, tmpDir);
      const testDir = path.dirname(testsPath);

      expect(tests).toEqual([
        expect.objectContaining({
          options: {
            provider: {
              id: `file://${path.join(testDir, 'grader.cjs')}`,
              config: { payload: `file://${path.join(testDir, 'payload.txt')}` },
            },
          },
          assert: [
            expect.objectContaining({
              provider: `file://${path.join(testDir, 'assert-grader.yaml')}`,
            }),
          ],
        }),
      ]);
    });

    it('resolves scoring functions in file-backed scenario tests against the test file', async () => {
      const testsPath = write(
        'tests/scorers.yaml',
        `- vars:
    case: scorer
  assertScoringFunction: file://score.js:customScore
`,
      );
      write('tests/score.js', 'module.exports = () => ({ pass: true, score: 1 });\n');

      const tests = await readScenarioTests(`file://${testsPath}`, tmpDir);

      expect(tests?.[0].assertScoringFunction).toBe(
        `file://${path.join(path.dirname(testsPath), 'score.js')}:customScore`,
      );
    });

    it('loads vars file refs in file-backed scenario tests against the test file', async () => {
      const testsPath = write(
        'tests/cases.yaml',
        `- vars: file://vars.yaml
`,
      );
      write('tests/vars.yaml', 'source: file-backed\n');

      const tests = await readScenarioTests(`file://${testsPath}`, tmpDir);

      expect(tests).toEqual([expect.objectContaining({ vars: { source: 'file-backed' } })]);
    });

    it('keeps file-backed scenario test provider refs serializable', async () => {
      const testsPath = write(
        'tests/provider-ref.yaml',
        `- vars:
    case: provider-ref
  provider: file://provider.cjs
`,
      );
      write(
        'tests/provider.cjs',
        'module.exports = class FixtureProvider { id() { return "runtime-provider"; } async callApi() { return { output: "ok" }; } };\n',
      );

      const tests = await readScenarioTests(`file://${testsPath}`, tmpDir);

      expect(tests?.[0].provider).toBe(
        `file://${path.join(path.dirname(testsPath), 'provider.cjs')}`,
      );
    });

    it('does not instantiate file-backed scenario providers while reading tests', async () => {
      const stateKey = '__promptfooScenarioReaderProvider';
      const state = { constructed: 0 };
      (globalThis as Record<string, unknown>)[stateKey] = state;
      const testsPath = write(
        'tests/lazy-provider.yaml',
        '- vars:\n    case: lazy\n  provider: file://provider.cjs\n',
      );
      write(
        'tests/provider.cjs',
        `const state = globalThis[${JSON.stringify(stateKey)}];
module.exports = class LazyProvider {
  constructor() { state.constructed += 1; }
  id() { return 'lazy-provider'; }
  async callApi() { return { output: 'ok' }; }
};
`,
      );

      try {
        const tests = await readScenarioTests(`file://${testsPath}`, tmpDir);

        expect(tests?.[0].provider).toBe(
          `file://${path.join(path.dirname(testsPath), 'provider.cjs')}`,
        );
        expect(state.constructed).toBe(0);
      } finally {
        delete (globalThis as Record<string, unknown>)[stateKey];
      }
    });

    it('uses source env while loading nested refs in file-backed scenario tests', async () => {
      const expectedPath = write('tests/expected.txt', 'EXPECTED_FROM_SOURCE_ENV');
      const testsPath = write(
        'tests/env-refs.yaml',
        `- vars:
    case: env-ref
  assert:
    - type: contains
      value: file://{{ env.EXPECTED_FILE }}
`,
      );

      const tests = await readScenarioTests(`file://${testsPath}`, tmpDir, {
        EXPECTED_FILE: expectedPath,
      });

      expect(tests?.[0].assert?.[0]).toMatchObject({
        value: 'EXPECTED_FROM_SOURCE_ENV',
      });
    });

    it('retains concrete nested dependencies from file-backed scenario tests', async () => {
      const varsPath = write('tests/vars.yaml', 'source: nested\n');
      const transformPath = write('tests/transform.cjs', 'module.exports = (output) => output;\n');
      const testsPath = write(
        'tests/dependencies.yaml',
        '- vars: file://vars.yaml\n  options:\n    transform: file://transform.cjs\n',
      );

      const tests = await readScenarioTests(`file://${testsPath}`, tmpDir);
      const context = getScenarioTestSourceContext(tests![0]);

      expect(context?.basePath).toBe(path.dirname(testsPath));
      expect(context?.dependencies).toEqual(
        expect.arrayContaining([testsPath, varsPath, transformPath]),
      );
    });

    it('renders source env in inline scenario tests without file refs', async () => {
      const tests = await readScenarioTests(
        [
          {
            vars: {
              tenant: '{{ env.TENANT }}',
            },
            assert: [
              {
                type: 'contains',
                value: '{{ env.EXPECTED }}',
              },
            ],
          },
        ],
        tmpDir,
        { EXPECTED: 'expected-from-env', TENANT: 'tenant-from-env' },
      );

      expect(tests).toEqual([
        expect.objectContaining({
          vars: { tenant: 'tenant-from-env' },
          assert: [expect.objectContaining({ value: 'expected-from-env' })],
        }),
      ]);
    });

    it('loads nested relative refs against local scenario test files', async () => {
      const previousBasePath = cliState.basePath;
      cliState.basePath = tmpDir;
      try {
        write('tests/expected.txt', 'EXPECTED_FROM_TEST_FILE_DIR');
        const testsPath = write(
          'tests/relative-refs.yaml',
          `- vars:
    case: relative-ref
  assert:
    - type: contains
      value: file://expected.txt
`,
        );

        const tests = await readScenarioTests(`file://${testsPath}`, tmpDir);

        expect(tests?.[0].assert?.[0]).toMatchObject({
          value: 'EXPECTED_FROM_TEST_FILE_DIR',
        });
      } finally {
        cliState.basePath = previousBasePath;
      }
    });

    it('still loads nested data fields named provider in scenario test assertions', async () => {
      const expectedPath = write('tests/expected.txt', 'EXPECTED_DATA');
      const testsPath = write(
        'tests/provider-data.yaml',
        `- vars:
    case: provider-data
  assert:
    - type: equals
      value:
        provider: file://${expectedPath}
`,
      );

      const tests = await readScenarioTests(`file://${testsPath}`, tmpDir);

      expect(tests?.[0].assert?.[0]).toMatchObject({
        value: { provider: 'EXPECTED_DATA' },
      });
    });

    it('preserves script assertion file refs in file-backed scenario tests', async () => {
      const assertionPath = write('tests/assert.js', 'module.exports = () => true;\n');
      const testsPath = write(
        'tests/script-assertion.yaml',
        `- vars:
    case: script
  assert:
    - type: javascript
      value: file://${assertionPath}
`,
      );

      const tests = await readScenarioTests(`file://${testsPath}`, tmpDir);

      expect(tests?.[0].assert?.[0]).toMatchObject({ value: `file://${assertionPath}` });
    });

    it('preserves executable transform refs and opaque metadata file URIs', async () => {
      const transformPath = write('tests/transform.cjs', 'module.exports = (output) => output;\n');
      const testsPath = write(
        'tests/transforms.yaml',
        `- metadata:
    artifact: file://${path.join(tmpDir, 'does-not-exist.txt')}
  options:
    transform: file://transform.cjs
  assert:
    - type: equals
      value: ok
      transform: file://transform.cjs
      contextTransform: file://transform.cjs
`,
      );

      const tests = await readScenarioTests(`file://${testsPath}`, tmpDir);

      expect(tests?.[0]).toMatchObject({
        metadata: { artifact: `file://${path.join(tmpDir, 'does-not-exist.txt')}` },
        options: { transform: `file://${transformPath}` },
        assert: [
          {
            transform: `file://${transformPath}`,
            contextTransform: `file://${transformPath}`,
          },
        ],
      });
    });

    it('canonicalizes additional option file refs without dereferencing them', async () => {
      const testsPath = write(
        'tests/options.yaml',
        `- options:
    response_format: file://schemas/missing.json
    tools: file://tools/missing.yaml
    functions: file://functions/missing.json
    rubricPrompt: file://rubrics/missing.txt
`,
      );

      const tests = await readScenarioTests(`file://${testsPath}`, tmpDir);
      const testDir = path.dirname(testsPath);

      expect(tests?.[0].options).toMatchObject({
        response_format: `file://${path.join(testDir, 'schemas/missing.json')}`,
        tools: `file://${path.join(testDir, 'tools/missing.yaml')}`,
        functions: `file://${path.join(testDir, 'functions/missing.json')}`,
        rubricPrompt: `file://${path.join(testDir, 'rubrics/missing.txt')}`,
      });
    });

    it('prefers literal scenario-test and vars filenames containing glob characters', async () => {
      const testsPath = write(
        'tests/tests[prod].yaml',
        '- vars: vars[prod].yaml\n  metadata:\n    source: exact\n',
      );
      write('tests/testsp.yaml', '- vars:\n    source: decoy-test\n');
      write('tests/vars[prod].yaml', 'source: exact-vars\n');
      write('tests/varsp.yaml', 'source: decoy-vars\n');

      await expect(readScenarioTests(`file://${testsPath}`, tmpDir)).resolves.toEqual([
        expect.objectContaining({
          vars: { source: 'exact-vars' },
          metadata: { source: 'exact' },
        }),
      ]);
    });

    it('loads globbed JSON and JSONL scenario tests through the standard reader', async () => {
      write('tests/json/a.json', JSON.stringify([{ vars: { source: 'json-a' } }]));
      write('tests/json/b.json', JSON.stringify([{ vars: { source: 'json-b' } }]));
      write('tests/jsonl/a.jsonl', '{"vars":{"source":"jsonl-a"}}\n');
      write('tests/jsonl/b.jsonl', '{"vars":{"source":"jsonl-b"}}\n');

      const jsonTests = await readScenarioTests(
        `file://${path.join(tmpDir, 'tests/json/*.json')}`,
        tmpDir,
      );
      const jsonlTests = await readScenarioTests(
        `file://${path.join(tmpDir, 'tests/jsonl/*.jsonl')}`,
        tmpDir,
      );

      expect(jsonTests?.map((test) => test.vars?.source).sort()).toEqual(['json-a', 'json-b']);
      expect(jsonlTests?.map((test) => test.vars?.source).sort()).toEqual(['jsonl-a', 'jsonl-b']);
    });

    it.runIf(process.platform !== 'win32')(
      'treats colons in non-script test paths as literal filename characters',
      async () => {
        const testsPath = write(
          'tests:production/cases.json',
          JSON.stringify([{ vars: { source: 'colon-directory' } }]),
        );

        await expect(readScenarioTests(`file://${testsPath}`, tmpDir)).resolves.toEqual([
          expect.objectContaining({ vars: { source: 'colon-directory' } }),
        ]);
      },
    );

    it('redacts signed source URLs from nested scenario-test errors', async () => {
      const signedSecret = 'signed-query-secret-sentinel';
      const source = `http://127.0.0.1:1/tests.json?sig=${signedSecret}`;

      let error: unknown;
      try {
        await readScenarioTests(source, tmpDir);
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(ConfigResolutionError);
      expect(String(error)).not.toContain(signedSecret);
      expect(String((error as Error & { cause?: unknown }).cause)).not.toContain(signedSecret);
      expect(String(error)).toContain('Failed to load scenario test file');
    });

    it('accepts structurally valid programmatic scenario test class instances', async () => {
      class ScenarioTest {
        vars = { source: 'class-instance' };
        metadata = { preserved: true };
      }

      await expect(readScenarioTests([new ScenarioTest() as never])).resolves.toEqual([
        expect.objectContaining({
          vars: { source: 'class-instance' },
          metadata: { preserved: true },
        }),
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

    it('retains generator module and config file dependencies', async () => {
      const payloadPath = write('generator/payload.txt', 'payload');
      const generatorPath = write(
        'generator/generate.cjs',
        'module.exports = ({ payload }) => [{ vars: { payload } }];\n',
      );

      const tests = await readScenarioTests(
        {
          path: `file://${generatorPath}`,
          config: { payload: `file://${payloadPath}` },
        },
        tmpDir,
      );
      const context = getScenarioTestSourceContext(tests![0]);

      expect(context?.dependencies).toEqual(expect.arrayContaining([generatorPath, payloadPath]));
    });

    it('renders source env in scenario test generator config', async () => {
      const generatorPath = write(
        'generate-env.cjs',
        'module.exports = ({ prefix }) => [{ vars: { name: `${prefix}-generated` } }];\n',
      );

      const tests = await readScenarioTests(
        {
          path: `file://${generatorPath}`,
          config: { prefix: '{{ env.PREFIX }}' },
        },
        tmpDir,
        { PREFIX: 'source-env' },
      );

      expect(tests?.map((test) => test.vars?.name)).toEqual(['source-env-generated']);
    });

    it('executes programmatic class-instance generator descriptors', async () => {
      const generatorPath = write(
        'class-generate.cjs',
        'module.exports = ({ prefix }) => [{ vars: { name: `${prefix}-generated` } }];\n',
      );
      class GeneratorDescriptor {
        path = `file://${generatorPath}`;
        config = { prefix: 'class' };
      }

      const scenarios = await loadScenarioConfigs(
        [{ config: [{}], tests: new GeneratorDescriptor() as never }],
        tmpDir,
      );
      const tests = await readScenarioTests(scenarios?.[0].tests, tmpDir);

      expect(tests?.map((test) => test.vars?.name)).toEqual(['class-generated']);
    });

    it.runIf(process.platform !== 'win32')(
      'loads scenario test globs declared below directories with glob metacharacters',
      async () => {
        const scenarioPath = write(
          'configs [prod]/scenario.yaml',
          '- config:\n    - {}\n  tests: file://tests/*.yaml\n',
        );
        write('configs [prod]/tests/cases.yaml', '- vars:\n    source: globbed\n');

        const scenarios = await loadScenarioConfigs([`file://${scenarioPath}`], tmpDir);
        const tests = await readScenarioTests(scenarios?.[0].tests, tmpDir);

        expect(tests).toEqual([expect.objectContaining({ vars: { source: 'globbed' } })]);
      },
    );

    it.runIf(process.platform !== 'win32')(
      'loads vars globs declared below scenario directories with glob metacharacters',
      async () => {
        const scenarioPath = write(
          'configs [prod]/scenario.yaml',
          '- config:\n    - {}\n  tests:\n    - vars: file://vars/*.yaml\n',
        );
        write('configs [prod]/vars/a.yaml', 'a: one\n');
        write('configs [prod]/vars/b.yaml', 'b: two\n');

        const scenarios = await loadScenarioConfigs([`file://${scenarioPath}`], tmpDir);
        const tests = await readScenarioTests(scenarios?.[0].tests, tmpDir);

        expect(tests).toEqual([expect.objectContaining({ vars: { a: 'one', b: 'two' } })]);
      },
    );

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
      write('matrix.yaml', '- vars:\n    source: inline\n');
      const scenarios: ScenarioInput[] = [
        { config: [{ $values: 'file://matrix.yaml' }], tests: [{}] },
      ];

      const loaded = await loadScenarioConfigs(scenarios, tmpDir);

      expect(loaded?.[0].config[0]).toEqual({
        $values: `file://${path.join(tmpDir, 'matrix.yaml')}`,
      });
      await expect(
        expandScenarioConfigValues(loaded?.[0].config, path.join(tmpDir, 'wrong-base')),
      ).resolves.toEqual([{ vars: { source: 'inline' } }]);
    });

    it('resolves $values refs in file scenarios against the scenario file directory', async () => {
      write(
        'scenarios/scenario.yaml',
        '- config:\n    - $values: file://matrix.yaml\n  tests:\n    - {}\n',
      );
      write('scenarios/matrix.yaml', '- vars:\n    source: external\n');

      const loaded = await loadScenarioConfigs(
        [`file://${path.join(tmpDir, 'scenarios', 'scenario.yaml')}`],
        tmpDir,
      );

      expect(loaded?.[0].config[0]).toEqual({
        $values: `file://${path.join(tmpDir, 'scenarios', 'matrix.yaml')}`,
      });
      await expect(
        expandScenarioConfigValues(loaded?.[0].config, path.join(tmpDir, 'wrong-base')),
      ).resolves.toEqual([{ vars: { source: 'external' } }]);
    });

    it('canonicalizes target and grader providers against the matrix file', async () => {
      write(
        'scenarios/scenario.yaml',
        '- config:\n    - $values: file://matrices/matrix.json\n  tests:\n    - {}\n',
      );
      write(
        'scenarios/matrices/matrix.json',
        JSON.stringify([
          {
            vars: { source: 'matrix' },
            provider: {
              id: 'file://target.cjs',
              config: { payload: 'file://target.txt' },
            },
            options: {
              provider: {
                id: 'file://options-grader.cjs',
                config: { rubric: 'file://options-rubric.txt' },
              },
            },
            assert: [
              {
                type: 'llm-rubric',
                value: 'direct',
                provider: 'file://direct-grader.cjs',
              },
              {
                type: 'assert-set',
                assert: [
                  {
                    type: 'llm-rubric',
                    value: 'nested',
                    provider: {
                      id: 'file://nested-grader.cjs',
                      config: { rubric: 'file://nested-rubric.txt' },
                    },
                  },
                ],
              },
            ],
          },
        ]),
      );

      const loaded = await loadScenarioConfigs(
        [`file://${path.join(tmpDir, 'scenarios', 'scenario.yaml')}`],
        tmpDir,
      );
      const scenarioDir = path.join(tmpDir, 'scenarios');
      const matrixDir = path.join(scenarioDir, 'matrices');
      const expanded = await expandScenarioConfigValues(
        loaded?.[0].config,
        path.join(tmpDir, 'wrong-base'),
      );

      expect(expanded).toEqual([
        {
          vars: { source: 'matrix' },
          provider: {
            id: `file://${path.join(matrixDir, 'target.cjs')}`,
            config: { payload: `file://${path.join(matrixDir, 'target.txt')}` },
          },
          options: {
            provider: {
              id: `file://${path.join(matrixDir, 'options-grader.cjs')}`,
              config: { rubric: `file://${path.join(matrixDir, 'options-rubric.txt')}` },
            },
          },
          assert: [
            {
              type: 'llm-rubric',
              value: 'direct',
              provider: `file://${path.join(matrixDir, 'direct-grader.cjs')}`,
            },
            {
              type: 'assert-set',
              assert: [
                {
                  type: 'llm-rubric',
                  value: 'nested',
                  provider: {
                    id: `file://${path.join(matrixDir, 'nested-grader.cjs')}`,
                    config: { rubric: `file://${path.join(matrixDir, 'nested-rubric.txt')}` },
                  },
                },
              ],
            },
          ],
        },
      ]);
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
      write('scenarios/unit/matrix.yaml', '- vars:\n    source: unit\n');
      write('scenarios/integration/matrix.yaml', '- vars:\n    source: integration\n');

      const loaded = await loadScenarioConfigs(
        [`file://${path.join(tmpDir, 'scenarios', '**', 'scenario.yaml')}`],
        tmpDir,
      );

      expect(loaded?.map((scenario) => scenario.config[0])).toEqual(
        expect.arrayContaining([
          { $values: `file://${path.join(tmpDir, 'scenarios', 'unit', 'matrix.yaml')}` },
          { $values: `file://${path.join(tmpDir, 'scenarios', 'integration', 'matrix.yaml')}` },
        ]),
      );
      const expanded = await Promise.all(
        (loaded ?? []).map((scenario) =>
          expandScenarioConfigValues(scenario.config, path.join(tmpDir, 'wrong-base')),
        ),
      );
      expect(expanded.flat()).toEqual(
        expect.arrayContaining([{ vars: { source: 'unit' } }, { vars: { source: 'integration' } }]),
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

    it('resolves inline provider refs against the external scenario directory', async () => {
      const scenarioPath = write(
        'scenarios/scenario.yaml',
        `- config:
    - vars:
        source: config
      provider:
        id: file://provider.cjs
        config:
          payload: file://config-payload.txt
  tests:
    - vars: file://vars.yaml
      provider:
        id: file://provider.cjs
        config:
          payload: file://test-payload.txt
`,
      );

      const loaded = await loadScenarioConfigs([`file://${scenarioPath}`], tmpDir);
      const scenarioDir = path.join(tmpDir, 'scenarios');
      const configRow = loaded?.[0].config[0];
      const configProvider =
        configRow && !('$values' in configRow)
          ? (configRow.provider as { id: string; config: { payload: string } })
          : undefined;
      const scenarioTests = loaded?.[0].tests;
      const test = (Array.isArray(scenarioTests) ? scenarioTests[0] : undefined) as
        | {
            vars: string;
            provider: { id: string; config: { payload: string } };
          }
        | undefined;

      expect(configProvider).toEqual({
        id: `file://${path.join(scenarioDir, 'provider.cjs')}`,
        config: { payload: `file://${path.join(scenarioDir, 'config-payload.txt')}` },
      });
      expect(test).toEqual({
        vars: path.join(scenarioDir, 'vars.yaml'),
        provider: {
          id: `file://${path.join(scenarioDir, 'provider.cjs')}`,
          config: { payload: `file://${path.join(scenarioDir, 'test-payload.txt')}` },
        },
      });
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
