import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const cliPath = path.resolve(__dirname, '../../dist/src/main.js');
const fixturePath = path.resolve(
  __dirname,
  'fixtures/configs/rag-citation-allowlist-assertion.yaml',
);

describe('RAG citation allowlist', () => {
  it('grades the structured citations documented in the RAG failure modes guide', () => {
    expect(existsSync(cliPath), 'build the CLI before running this smoke test').toBe(true);
    const outputDir = mkdtempSync(path.join(tmpdir(), 'promptfoo-rag-citations-'));
    const outputPath = path.join(outputDir, 'results.json');

    try {
      const run = spawnSync(
        process.execPath,
        [cliPath, 'eval', '-c', fixturePath, '-o', outputPath, '--no-cache'],
        { encoding: 'utf8', timeout: 25_000 },
      );
      expect(run.error, run.stderr).toBeUndefined();
      expect(run.status, run.stderr || run.stdout).toBe(100);
      const { results } = JSON.parse(readFileSync(outputPath, 'utf8'));
      expect(results.stats).toMatchObject({ successes: 2, failures: 3, errors: 0 });
      expect(
        results.results.map(
          ({ testCase, success }: { testCase: { description: string }; success: boolean }) => [
            testCase.description,
            success,
          ],
        ),
      ).toEqual([
        ['allowlisted file', true],
        ['allowlisted URL with parentheses', true],
        ['fabricated file suffix', false],
        ['fabricated URL', false],
        ['missing citations', false],
      ]);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
