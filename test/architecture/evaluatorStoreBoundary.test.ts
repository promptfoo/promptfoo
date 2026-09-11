import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { extractModuleSpecifiers } from '../../scripts/architectureUtils';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('evaluator store boundary', () => {
  it('keeps the evaluator independent from the concrete Eval model', () => {
    const evaluatorPath = 'src/evaluator.ts';
    const source = readFileSync(path.join(repoRoot, evaluatorPath), 'utf8');

    expect(extractModuleSpecifiers(source, evaluatorPath)).not.toContain('./models/eval');
  });
});
