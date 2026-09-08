import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';

import type { InMemoryEvaluation } from '../../../src/evaluator/inMemoryStore';
import type { EvaluatorRuntime } from '../../../src/evaluator/runtime';
import type { EvaluateResult, TestSuite } from '../../../src/types/index';

// This process has no Vitest setup, migrations, model-backed store, or default Node runtime.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier.includes('node/evaluatorRuntime') ||
      specifier.includes('node/evaluatorProgress')
    ) {
      throw new Error(`Explicit evaluation imported ${specifier} from ${context.parentURL}`);
    }
    return nextResolve(specifier, context);
  },
});

const { evaluate } = await import('../../../src/evaluator/engine');
const { InMemoryEvaluationStore } = await import('../../../src/evaluator/inMemoryStore');

function record(id: string): InMemoryEvaluation {
  return {
    id,
    config: {},
    persisted: false,
    prompts: [],
    results: [],
    vars: [],
    resultPersistenceFailed: false,
    finalResults: [],
    failedResults: [],
  };
}

const written: Record<string, unknown[]> = {};
const closed: string[] = [];
function runtime(id: string): EvaluatorRuntime<InMemoryEvaluation, EvaluateResult> {
  written[id] = [];
  return {
    createEvaluationStore: (evaluation) => new InMemoryEvaluationStore(evaluation),
    createResultWriters: () => [
      {
        async write(row) {
          written[id].push(row);
        },
        async close() {
          closed.push(id);
        },
      },
    ],
  };
}

let releaseFirst: (() => void) | undefined;
const firstStarted = new Promise<void>((resolve) => {
  releaseFirst = resolve;
});
let releaseBoth: (() => void) | undefined;
const bothStarted = new Promise<void>((resolve) => {
  releaseBoth = resolve;
});
function suite(id: string): TestSuite {
  return {
    providers: [
      {
        id: () => id,
        async callApi(prompt) {
          if (id === 'first') {
            releaseFirst?.();
            await bothStarted;
          } else {
            await firstStarted;
            releaseBoth?.();
          }
          return { output: prompt };
        },
      },
    ],
    prompts: [{ raw: '{{value}}', label: id }],
    tests: [{ vars: { value: id }, assert: [{ type: 'equals', value: id }] }],
  };
}

const first = record('first');
const second = record('second');
const [firstReturned, secondReturned] = await Promise.all([
  evaluate(suite('first'), first, { eventSource: 'library' }, runtime('first')),
  evaluate(suite('second'), second, { eventSource: 'library' }, runtime('second')),
]);
assert.equal(firstReturned, first);
assert.equal(secondReturned, second);
for (const evaluation of [first, second]) {
  assert.equal(evaluation.results.length, 1);
  assert.equal(evaluation.results[0].response?.output, evaluation.id);
  assert.equal(evaluation.results[0].success, true);
  assert.equal(evaluation.results[0].score, 1);
  assert.equal(evaluation.results[0].error, undefined);
  assert.equal(written[evaluation.id].length, 1);
}
assert.deepEqual(closed.sort(), ['first', 'second']);

// A runtime resolver owns suite resolution; the original suite/config retain their values.
const original = suite('resolved');
original.tests = [{ vars: { value: 'original' } }];
const resolvedRuntime = runtime('resolved');
resolvedRuntime.resolveRuntimeTestSuite = (input) => {
  assert.equal(input, original);
  return { ...input, tests: [{ vars: { value: 'resolved' } }] };
};
const resolved = record('resolved');
await evaluate(original, resolved, { eventSource: 'library' }, resolvedRuntime);
assert.equal(resolved.results[0].response?.output, 'resolved');
assert.deepEqual(original.tests, [{ vars: { value: 'original' } }]);

// Setup errors retain object identity and cannot fall back to Node persistence.
const failure = new Error('fixture store failure');
const failingRuntime = runtime('failure');
failingRuntime.createEvaluationStore = () => {
  throw failure;
};
assert.throws(
  () => evaluate(original, record('failure'), {}, failingRuntime),
  (error) => error === failure,
);

const configDir = process.env.PROMPTFOO_CONFIG_DIR!;
function databaseFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? databaseFiles(path.join(directory, entry.name))
      : /\.(db|sqlite)(-|$)/.test(entry.name)
        ? [entry.name]
        : [],
  );
}
assert.deepEqual(databaseFiles(configDir), []);
assert.equal(process.exitCode, undefined);
console.log(
  JSON.stringify({
    standalone: true,
    overlappingEvaluations: 2,
    databaseFiles: 0,
    resolverIsolation: true,
    errorIdentity: true,
  }),
);
