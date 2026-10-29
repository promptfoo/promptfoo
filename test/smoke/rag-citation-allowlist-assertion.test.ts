/**
 * Smoke test for the citation-allowlist javascript assertion documented in
 * site/docs/guides/rag-failure-modes.md ("5. Fabricated citation or source").
 *
 * Regression coverage for a false-failure bug: the assertion used to scan the
 * raw provider output for bare `*.md`/`*.pdf` file tokens, which also matched
 * the basename of any already-allowlisted URL (e.g. matching "quarterly.pdf"
 * inside "https://kb.example.com/reports/quarterly.pdf"). That caused a
 * legitimately cited, allowlisted URL to fail the check. The fix strips
 * matched URLs out of the text before scanning for bare file tokens.
 *
 * @see docs/plans/smoke-tests.md for the full checklist
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const CLI_PATH = path.resolve(__dirname, '../../dist/src/main.js');
const ROOT_DIR = path.resolve(__dirname, '../..');
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');
const OUTPUT_DIR = path.resolve(__dirname, '.temp-output-rag-citation-allowlist');

function runCli(
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync('node', [CLI_PATH, ...args], {
    cwd: options.cwd || ROOT_DIR,
    encoding: 'utf-8',
    env: { ...process.env, ...options.env, NO_COLOR: '1' },
    timeout: 60000,
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1,
  };
}

describe('RAG Citation Allowlist Assertion Smoke Test', () => {
  beforeAll(() => {
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error(`Built CLI not found at ${CLI_PATH}. Run 'npm run build' first.`);
    }
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  it('correctly allows allowlisted citations and rejects fabricated ones', () => {
    const configPath = path.join(FIXTURES_DIR, 'configs/rag-citation-allowlist-assertion.yaml');
    const outputPath = path.join(OUTPUT_DIR, 'rag-citation-allowlist-output.json');

    const { exitCode } = runCli(['eval', '-c', configPath, '-o', outputPath, '--no-cache']);

    // The CLI exits non-zero when any test fails, so a clean exit here already
    // proves all four scenarios below graded as expected.
    expect(exitCode).toBe(0);

    const content = fs.readFileSync(outputPath, 'utf-8');
    const parsed = JSON.parse(content);
    const results = parsed.results.results;

    expect(results).toHaveLength(4);
    for (const result of results) {
      expect(result.success).toBe(true);
    }

    const byDescription = Object.fromEntries(
      results.map((r: { testCase: { description: string } }, i: number) => [
        r.testCase?.description ?? i,
        r,
      ]),
    );

    expect(
      byDescription[
        'allowlisted URL citation (basename not separately allowlisted as a file) passes'
      ].success,
    ).toBe(true);
    expect(byDescription['allowlisted bare file citation still passes'].success).toBe(true);
    expect(byDescription['fabricated file citation is rejected'].success).toBe(true);
    expect(byDescription['fabricated URL citation is rejected'].success).toBe(true);
  });
});
