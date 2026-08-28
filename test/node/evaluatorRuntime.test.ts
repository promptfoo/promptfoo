import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import Eval from '../../src/models/eval';
import {
  getVarValuesFingerprint,
  loadVarValuesFromFile,
  nodeEvaluatorRuntime,
} from '../../src/node/evaluatorRuntime';
import { mockProcessEnv } from '../util/utils';

import type { EvaluateResult, TestSuite } from '../../src/types/index';

describe('nodeEvaluatorRuntime', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.clearAllMocks();
    for (const tempDir of tempDirs.splice(0)) {
      // On Windows, file handles can linger briefly after a stream is closed, so an
      // immediate recursive delete may throw ENOTEMPTY/EBUSY/EPERM. Retry with a short
      // backoff (a no-op on POSIX, where these errors don't occur).
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it('fingerprints file-backed matrix values and detects ordering changes', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-matrix-fingerprint-'));
    tempDirs.push(tempDir);
    const valuesPath = path.join(tempDir, 'languages.yaml');
    fs.writeFileSync(valuesPath, '- English\n- French\n');
    const suite = {
      tests: [{ vars: { language: { $values: 'file://languages.yaml' } } }],
    };

    const originalFingerprint = getVarValuesFingerprint([suite], tempDir);
    fs.writeFileSync(valuesPath, '- French\n- English\n');

    expect(getVarValuesFingerprint([suite], tempDir)).not.toBe(originalFingerprint);
  });

  it('includes mixed, default, and scenario matrix references in the fingerprint', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-matrix-fingerprint-'));
    tempDirs.push(tempDir);
    for (const fileName of ['mixed.yaml', 'default.yaml', 'scenario.yaml']) {
      fs.writeFileSync(path.join(tempDir, fileName), '- one\n- two\n');
    }
    const suite = {
      tests: [
        'file://external-tests.yaml',
        { vars: { mixed: ['literal', { $values: 'file://mixed.yaml' }], scalar: 'value' } },
      ],
      defaultTest: { vars: { fallback: { $values: 'file://default.yaml' } } },
      scenarios: [
        null,
        {
          config: [{ vars: { scenario: { $values: 'file://scenario.yaml' } } }],
          tests: [{ vars: { duplicate: { $values: 'file://mixed.yaml' } } }],
        },
      ],
    };

    const originalFingerprint = getVarValuesFingerprint([suite], tempDir);
    fs.writeFileSync(path.join(tempDir, 'scenario.yaml'), '- changed\n');

    expect(getVarValuesFingerprint([suite], tempDir)).not.toBe(originalFingerprint);
  });

  it('returns undefined without matrix references and wraps file read failures', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-matrix-fingerprint-'));
    tempDirs.push(tempDir);

    expect(getVarValuesFingerprint([{ tests: [{ vars: { language: 'English' } }] }], tempDir)).toBe(
      undefined,
    );
    expect(() =>
      getVarValuesFingerprint(
        [{ tests: [{ vars: { language: { $values: 'file://missing.yaml' } } }] }],
        tempDir,
      ),
    ).toThrow('Failed to load $values');
  });

  it('shares the fingerprinted matrix snapshot with later expansion', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-matrix-fingerprint-'));
    tempDirs.push(tempDir);
    const valuesPath = path.join(tempDir, 'languages.yaml');
    fs.writeFileSync(valuesPath, '- English\n- French\n');
    const directive = { $values: 'file://languages.yaml' };
    const cache = new Map();

    getVarValuesFingerprint([{ tests: [{ vars: { language: directive } }] }], tempDir, cache);
    fs.writeFileSync(valuesPath, '- German\n');

    expect(loadVarValuesFromFile(directive, 'language', tempDir, cache)).toEqual([
      'English',
      'French',
    ]);
  });

  it('ignores matrix references overridden by effective test variables', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-matrix-fingerprint-'));
    tempDirs.push(tempDir);
    fs.writeFileSync(path.join(tempDir, 'used.yaml'), '- English\n');
    const directSuite = {
      defaultTest: { vars: { language: { $values: 'file://missing-default.yaml' } } },
      tests: [{ vars: { language: { $values: 'file://used.yaml' } } }],
    };
    const scenarioSuite = {
      defaultTest: { vars: { language: { $values: 'file://missing-default.yaml' } } },
      scenarios: [
        {
          config: [{ vars: { language: { $values: 'file://missing-scenario.yaml' } } }],
          tests: [{ vars: { language: { $values: 'file://used.yaml' } } }],
        },
      ],
    };

    expect(() => getVarValuesFingerprint([directSuite, scenarioSuite], tempDir)).not.toThrow();
  });

  it.each([
    {
      name: 'ignores credentials from a previous evaluation',
      disabled: false,
      processValue: undefined,
      expected: '{{ env.TEMPO_TOKEN }}',
    },
    {
      name: 'allows explicitly permitted process environment credentials',
      disabled: false,
      processValue: 'current-process-secret',
      expected: 'current-process-secret',
    },
    {
      name: 'respects disabled process environment access',
      disabled: true,
      processValue: 'current-process-secret',
      expected: '{{ env.TEMPO_TOKEN }}',
    },
  ])(
    '$name during programmatic trace-provider resolution',
    ({ disabled, processValue, expected }) => {
      const previousConfig = cliState.config;
      const restoreEnvironment = mockProcessEnv({
        PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS: disabled ? 'true' : 'false',
        PROMPTFOO_SELF_HOSTED: 'false',
        TEMPO_TOKEN: processValue,
      });
      cliState.config = {
        env: { TEMPO_TOKEN: 'previous-evaluation-secret' } as NonNullable<TestSuite['env']>,
      };

      try {
        const suite: TestSuite = {
          providers: [],
          prompts: [],
          tracing: {
            enabled: true,
            provider: {
              id: 'tempo',
              endpoint: 'https://tempo.example.com',
              auth: { token: '{{ env.TEMPO_TOKEN }}' },
            },
          },
        };

        const resolved = nodeEvaluatorRuntime.resolveRuntimeTestSuite!(suite);

        expect(resolved.tracing?.provider?.auth?.token).toBe(expected);
        expect(JSON.stringify(resolved.tracing)).not.toContain('previous-evaluation-secret');
      } finally {
        cliState.config = previousConfig;
        restoreEnvironment();
      }
    },
  );

  it('creates and closes JSONL writers for JSONL output paths only', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-evaluator-runtime-'));
    tempDirs.push(tempDir);
    const jsonlPath = path.join(tempDir, 'results.jsonl');
    const uppercaseJsonlPath = path.join(tempDir, 'uppercase.JSONL');
    const csvPath = path.join(tempDir, 'results.csv');

    const writers = nodeEvaluatorRuntime.createResultWriters(
      [jsonlPath, uppercaseJsonlPath, csvPath],
      { append: false },
    );

    expect(writers).toHaveLength(2);
    await writers[0].write({ output: 'hello' });
    await writers[1].write({ output: 'uppercase' });
    await writers[0].close();
    await writers[1].close();
    expect(fs.readFileSync(jsonlPath, 'utf8')).toBe('{"output":"hello"}\n');
    expect(fs.readFileSync(uppercaseJsonlPath, 'utf8')).toBe('{"output":"uppercase"}\n');
  });

  it('truncates by default and appends when resuming', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-evaluator-runtime-'));
    tempDirs.push(tempDir);
    const jsonlPath = path.join(tempDir, 'results.jsonl');

    fs.writeFileSync(jsonlPath, 'stale row\n');
    const [writer] = nodeEvaluatorRuntime.createResultWriters(jsonlPath, { append: false });
    await writer.write({ output: 'fresh' });
    await writer.close();
    expect(fs.readFileSync(jsonlPath, 'utf8')).toBe('{"output":"fresh"}\n');

    const [appender] = nodeEvaluatorRuntime.createResultWriters(jsonlPath, { append: true });
    await appender.write({ output: 'resumed' });
    await appender.close();
    expect(fs.readFileSync(jsonlPath, 'utf8')).toBe('{"output":"fresh"}\n{"output":"resumed"}\n');
  });

  it('creates an Eval-backed evaluation store', async () => {
    const result = { success: true } as EvaluateResult;
    const evaluation = new Eval({});
    const addResult = vi.spyOn(evaluation, 'addResult').mockResolvedValue(undefined);
    const store = nodeEvaluatorRuntime.createEvaluationStore(evaluation);

    await store.appendResult(result);

    expect(store.evaluation).toBe(evaluation);
    expect(addResult).toHaveBeenCalledWith(result);
  });
});
