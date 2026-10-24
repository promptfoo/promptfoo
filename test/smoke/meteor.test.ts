import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, expect, it } from 'vitest';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-meteor-'));
afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

it('loads the real NLP dependency and scores whitespace and stem matches in the built CLI', () => {
  const configPath = path.join(directory, 'config.json');
  const outputPath = path.join(directory, 'results.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      prompts: ['{{output}}'],
      providers: ['echo'],
      tests: [
        { vars: { output: '  hello world\n' }, assert: [{ type: 'meteor', value: 'hello world' }] },
        { vars: { output: 'cats running' }, assert: [{ type: 'meteor', value: 'cat runs' }] },
      ],
    }),
  );
  const result = spawnSync(
    process.execPath,
    [
      path.resolve('dist/src/entrypoint.js'),
      'eval',
      '-c',
      configPath,
      '-o',
      outputPath,
      '--no-cache',
      '--no-write',
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, PROMPTFOO_CONFIG_DIR: path.join(directory, 'state') },
      timeout: 30000,
    },
  );
  expect(result.status, result.error?.message || result.stderr || result.stdout).toBe(0);
  const rows = JSON.parse(fs.readFileSync(outputPath, 'utf8')).results.results;
  expect(rows).toHaveLength(2);
  for (const row of rows) {
    expect(row.success).toBe(true);
    expect(row.score).toBe(0.9375);
    expect(row.gradingResult.componentResults[0].reason).toBe('METEOR assertion passed');
  }
});
