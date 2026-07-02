import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const forbiddenSuppressions = [
  ['.github/workflows/main.yml', 'PROMPTFOO_IGNORE_UNHANDLED_TEST_ERRORS'],
  ['vitest.config.ts', 'dangerouslyIgnoreUnhandledErrors'],
] as const;

describe('unhandled test error policy', () => {
  it.each(forbiddenSuppressions)('keeps %s free of %s', (relativePath, suppression) => {
    const source = readFileSync(path.join(repoRoot, relativePath), 'utf8');

    expect(source).not.toContain(suppression);
  });
});
