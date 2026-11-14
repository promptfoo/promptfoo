import { describe, expect, it } from 'vitest';
import { resolveVariables } from '../src/evaluatorHelpers';

// Exhaustive small-graph comparison of resolveVariables against an independent,
// deliberately naive oracle. The oracle re-derives cycle membership from the
// CURRENT (mutated) values on every pass with a plain depth-first search,
// instead of the implementation's precomputed Tarjan SCC set. If the cyclic set
// ever diverges from ground truth - wrong SCC detection, or the
// compute-once-from-initial-values optimization being unsound - some
// configuration here disagrees.

const REF_RE = /\{\{\s*(\w+)\s*\}\}/g;

function refsOf(value: string): string[] {
  return [...value.matchAll(REF_RE)].map((match) => match[1]);
}

// Naive cycle check: can `name`'s own references lead back to `name`?
function naiveReachesSelf(name: string, vars: Record<string, unknown>): boolean {
  const start = vars[name];
  if (typeof start !== 'string') {
    return false;
  }
  const stack = refsOf(start);
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === name) {
      return true;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    const value = vars[current];
    if (typeof value === 'string') {
      stack.push(...refsOf(value));
    }
  }
  return false;
}

// Independent reimplementation: same documented semantics, naive cycle detection
// recomputed from current values on every candidate check.
function oracleResolveVariables(
  varsIn: Record<string, string>,
  skipResolveVars: string[] = [],
): Record<string, string> {
  const vars = { ...varsIn };
  const fromSkipped = new Set<string>();
  let iterations = 0;
  let changed = true;
  while (changed && iterations < 5) {
    changed = false;
    iterations++;
    for (const key of Object.keys(vars)) {
      if (skipResolveVars.includes(key) || fromSkipped.has(key) || typeof vars[key] !== 'string') {
        continue;
      }
      const value = vars[key];
      for (const candidate of value.matchAll(REF_RE)) {
        const varName = candidate[1];
        if (vars[varName] === undefined) {
          continue;
        }
        const candidateIsSkipped = skipResolveVars.includes(varName) || fromSkipped.has(varName);
        if (!candidateIsSkipped && naiveReachesSelf(varName, vars)) {
          continue;
        }
        vars[key] = value.replace(candidate[0], () => vars[varName]);
        if (candidateIsSkipped) {
          fromSkipped.add(key);
        }
        changed = true;
        break;
      }
    }
  }
  return vars;
}

// Every graph variable's value is a subset of these placeholder references
// joined by spaces (or a literal when the subset is empty), so the exhaustive
// space covers self-loops, direct and transitive cycles, disconnected cycles,
// shared successors, and plain chains.
const REF_CHOICES = ['v0', 'v1', 'v2', 'missing'];

function subsets<T>(items: T[]): T[][] {
  const result: T[][] = [[]];
  for (const item of items) {
    result.push(...result.map((subset) => [...subset, item]));
  }
  return result;
}

const VALUE_CHOICES = subsets(REF_CHOICES).map((refs) =>
  refs.length === 0 ? 'lit' : refs.map((ref) => `{{${ref}}}`).join(' '),
);
// Assembly-capable values: '{{v0}}v1}}' with v0='{{' becomes '{{v1}}' only
// after a substitution, forming a reference (or cycle) that was absent from
// the initial graph. The oracle recomputes cycle membership from current
// values every pass, so any staleness in the implementation's cycle set
// diverges on these configs.
VALUE_CHOICES.push('{{', '{{v0}}v1}}');

const MSG_TEMPLATES = ['{{missing}} {{v0}} {{v1}} {{v2}}', 'plain {{v2}} tail'];

function* configs(): Generator<Record<string, string>> {
  for (const v0 of VALUE_CHOICES) {
    for (const v1 of VALUE_CHOICES) {
      for (const v2 of VALUE_CHOICES) {
        for (const msg of MSG_TEMPLATES) {
          yield { v0, v1, v2, msg };
        }
      }
    }
  }
}

describe('resolveVariables exhaustive small-graph oracle comparison', () => {
  it('matches the naive oracle on every 3-variable reference graph', () => {
    let checked = 0;
    for (const config of configs()) {
      const expected = oracleResolveVariables(config);
      expect(resolveVariables({ ...config })).toEqual(expected);
      checked++;
    }
    expect(checked).toBe(VALUE_CHOICES.length ** 3 * MSG_TEMPLATES.length);
  });

  it('matches the naive oracle when a variable is skipped (opaque)', () => {
    for (const config of configs()) {
      const skipped = ['v1'];
      const expected = oracleResolveVariables(config, skipped);
      expect(resolveVariables({ ...config }, skipped, new Set())).toEqual(expected);
    }
  });
});
