import fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

import type { Assertion, TestSuite } from '../../src/types';

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

  it.each([
    ['inline scripts', { type: 'javascript', value: 'output === process.env.EXPECTED' }],
    ['provider-backed graders', { type: 'llm-rubric', value: 'Be correct', provider: 'grader' }],
    ['webhooks', { type: 'webhook', value: 'https://example.test/grade' }],
    ['manual grading', { type: 'human' }],
  ])('rejects %s as mutable criteria', (_name, assertion) => {
    const suite = createSuite();
    suite.tests![0].assert = [assertion as Assertion];

    expect(() => createEvalBar(suite, { repeat: 1 })).toThrow(
      'only support data-only assertion criteria',
    );
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
