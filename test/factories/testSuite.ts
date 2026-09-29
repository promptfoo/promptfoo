import type { AtomicTestCase, Prompt } from '../../src/types/index';

export function createPrompt(raw = 'Test prompt', overrides: Partial<Prompt> = {}): Prompt {
  const effectiveRaw = overrides.raw ?? raw;
  return {
    ...overrides,
    raw: effectiveRaw,
    label: overrides.label ?? effectiveRaw,
  };
}

export function createAtomicTestCase(overrides: Partial<AtomicTestCase> = {}): AtomicTestCase {
  return {
    vars: {},
    ...overrides,
  };
}
