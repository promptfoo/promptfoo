import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGradingProvider } from '../../src/matchers/providers';
import Eval from '../../src/models/eval';
import { EvalEvaluationStore } from '../../src/node/evaluationStore';
import { resolveProvider } from '../../src/providers';
import { isApiProvider } from '../../src/types/providers';
import { REDACTED, sanitizeObject } from '../../src/util/sanitizer';
import { createTempDir, removeTempDir } from '../util/utils';

import type { AtomicTestCase, GradingConfig } from '../../src/types/index';

type Slot = 'assertion' | 'options' | 'assert-set';

const resolveGrader = (provider: unknown) => getGradingProvider('text', provider, null);

function withProvider(slot: Slot, provider: GradingConfig['provider']): AtomicTestCase {
  if (slot === 'options') {
    return { options: { provider } };
  }
  const assertion = { type: 'llm-rubric' as const, value: 'fixture', provider };
  return {
    assert: slot === 'assert-set' ? [{ type: 'assert-set', assert: [assertion] }] : [assertion],
  };
}

function getProvider(slot: Slot, test: AtomicTestCase): GradingConfig['provider'] {
  if (slot === 'options') {
    return test.options?.provider;
  }
  const assertion = test.assert?.[0];
  return assertion?.type === 'assert-set' ? assertion.assert[0]?.provider : assertion?.provider;
}

function persisted(test: AtomicTestCase): AtomicTestCase {
  return JSON.parse(JSON.stringify(sanitizeObject(test, { maxDepth: Number.POSITIVE_INFINITY })));
}

describe('persisted grading provider references', () => {
  let directory: string;
  let reference: string;
  let constructions: string;
  let store: EvalEvaluationStore;

  beforeEach(() => {
    directory = createTempDir('grading-provider-reference-');
    constructions = path.join(directory, 'constructions');
    fs.writeFileSync(constructions, '');
    const file = path.join(directory, 'grader.cjs');
    reference = `file://${file}`;
    fs.writeFileSync(
      file,
      `const fs = require('node:fs');
module.exports = class FixtureGrader {
  constructor(options) {
    fs.appendFileSync(${JSON.stringify(constructions)}, 'x');
    if (options.config.fixture) this.fixture = options.config.fixture;
  }
  id() { return 'offline-file-grader'; }
  async callApi() { return { output: 'fixture completion' }; }
};`,
    );
    store = new EvalEvaluationStore(new Eval({}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    removeTempDir(directory);
  });

  it.each(['value', 'transform', 'contextTransform', 'assertScoringFunction'] as const)(
    'preserves a literal function-marker string in %s',
    async (field) => {
      const literal = '[Function] literal fixture';
      const current: AtomicTestCase =
        field === 'assertScoringFunction'
          ? { assertScoringFunction: literal }
          : { assert: [{ type: 'javascript', value: 'true', [field]: literal }] };
      const inputs = await store.resolveGradingInputs(
        { output: 'target' },
        current,
        current,
        resolveGrader,
      );
      expect(inputs.test).toEqual(current);
    },
  );

  it.each(
    (['assertion', 'options', 'assert-set'] as const).flatMap((slot) =>
      (['string', 'options'] as const).map((descriptor) => ({ slot, descriptor })),
    ),
  )(
    'restores a loaded $slot grader from its current $descriptor declaration',
    async ({ slot, descriptor }) => {
      const current =
        descriptor === 'string' ? reference : { id: reference, config: { fixture: 'configured' } };
      const initial = await resolveProvider(current, {});
      const saved = persisted(withProvider(slot, initial));
      expect(getProvider(slot, saved)).not.toHaveProperty('id');
      const restored = await store.resolveGradingInputs(
        { output: 'target' },
        saved,
        withProvider(slot, current),
        resolveGrader,
      );
      const grader = getProvider(slot, restored.test);
      expect(isApiProvider(grader)).toBe(true);
      if (!isApiProvider(grader)) {
        throw new Error('Expected the current declared grader to be reloaded');
      }
      expect(grader.id()).toBe('offline-file-grader');
      expect(await grader.callApi('benign fixture')).toEqual({ output: 'fixture completion' });
      expect(fs.readFileSync(constructions, 'utf8')).toBe('xx');
    },
  );

  it('restores the selected typed entry without loading an unchanged unused declaration', async () => {
    const initial = await resolveProvider(reference, {});
    const unused = `file://${path.join(directory, 'must-not-load.cjs')}`;
    const saved = persisted({ options: { provider: { text: initial, embedding: unused } } });
    const restored = await store.resolveGradingInputs(
      { output: 'target' },
      saved,
      { options: { provider: { text: reference, embedding: unused } } },
      resolveGrader,
    );
    const typed = restored.test.options?.provider;
    expect(typed).toEqual({
      text: expect.objectContaining({ id: expect.any(Function) }),
      embedding: unused,
    });
    expect(fs.readFileSync(constructions, 'utf8')).toBe('xx');
  });

  it('retains a hook-modified provider descriptor that differs from the current loaded projection', async () => {
    const descriptor = { config: { fixture: 'changed by hook' } };
    const saved = { options: { provider: descriptor } } as AtomicTestCase;
    const restored = await store.resolveGradingInputs(
      { output: 'target' },
      saved,
      withProvider('options', reference),
      resolveGrader,
    );
    expect(restored.test.options?.provider).toEqual(descriptor);
  });

  it.each(['string', 'options'] as const)(
    'keeps a valid saved %s declaration without loading the replaced current provider',
    async (kind) => {
      const replacement =
        kind === 'string' ? reference : { id: reference, config: { fixture: 'saved hook choice' } };
      const missing = `file://${path.join(directory, 'must-not-load.cjs')}`;
      const current = kind === 'string' ? missing : { id: missing };
      const restored = await store.resolveGradingInputs(
        { output: 'target' },
        withProvider('options', replacement),
        withProvider('options', current),
        resolveGrader,
      );
      expect(restored.test.options?.provider).toEqual(replacement);
      expect(fs.readFileSync(constructions, 'utf8')).toBe('');
    },
  );

  it('does not interpret a vars.provider value as a grading provider declaration', async () => {
    const saved = { vars: { provider: { label: '' } } };
    const restored = await store.resolveGradingInputs(
      { output: 'target' },
      saved,
      { vars: { provider: reference } },
      resolveGrader,
    );
    expect(restored.test.vars).toEqual(saved.vars);
    expect(fs.readFileSync(constructions, 'utf8')).toBe('');
  });

  it('retains runtime restoration for the config on an assertion set', async () => {
    const current: AtomicTestCase = {
      assert: [{ type: 'assert-set', config: { apiKey: 'fixture-only-key' }, assert: [] }],
    };
    const saved = persisted(current);
    expect(saved.assert?.[0].config?.apiKey).toBe(REDACTED);
    const restored = await store.resolveGradingInputs(
      { output: 'target' },
      saved,
      current,
      resolveGrader,
    );
    expect(restored.test.assert?.[0].config?.apiKey).toBe('fixture-only-key');
    expect(fs.readFileSync(constructions, 'utf8')).toBe('');
  });
});
