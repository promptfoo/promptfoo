import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const cli = path.join(root, 'dist/src/entrypoint.js');
let directory: string;
function run(args: string[], input?: string) {
  return spawnSync(process.execPath, [cli, 'online', ...args], {
    cwd: directory,
    input,
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      ...process.env,
      PROMPTFOO_CONFIG_DIR: path.join(directory, 'runtime'),
      PROMPTFOO_DISABLE_UPDATE: 'true',
      PROMPTFOO_DISABLE_TELEMETRY: 'true',
      PROMPTFOO_DISABLE_SHARING: 'true',
    },
  });
}
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(tmpdir(), 'online-smoke-'));
});
afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('online CLI', () => {
  it('captures hooks without loading working-directory configuration, dotenv or the database', () => {
    fs.writeFileSync(
      path.join(directory, 'promptfooconfig.js'),
      "throw new Error('must not execute project config');",
    );
    fs.writeFileSync(path.join(directory, '.env'), 'PROMPTFOO_CONFIG_DIR=/must-not-use\n');
    const args = ['capture', '--agent', 'claude-code', '--dir', path.join(directory, 'queue')];
    const submit = run(
      args,
      JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 's', prompt: 'task' }),
    );
    const stop = run(
      args,
      JSON.stringify({ hook_event_name: 'Stop', session_id: 's', last_assistant_message: 'reply' }),
    );
    expect(submit.status, submit.stderr).toBe(0);
    expect(stop.status, stop.stderr).toBe(0);
    expect(submit.stdout).toBe('{}\n');
    expect(stop.stdout).toBe('{}\n');
    expect(fs.existsSync(path.join(directory, 'runtime'))).toBe(false);
    expect(fs.readdirSync(path.join(directory, 'queue/events'))).toHaveLength(1);
    const invalid = run(args, '{"secret":"do-not-echo",invalid');
    expect(invalid.status).toBe(0);
    expect(invalid.stdout).toBe('{}\n');
    expect(invalid.stderr).toContain('capture failed');
    expect(invalid.stderr).not.toContain('do-not-echo');
  });

  it('grades captured replies, exports reports and deduplicates across worker restarts', () => {
    const queue = path.join(directory, 'queue');
    const first = run([
      'capture',
      '--agent',
      'codex',
      '--dir',
      queue,
      JSON.stringify({
        type: 'agent-turn-complete',
        'thread-id': 's',
        'turn-id': 't',
        'input-messages': ['say OK'],
        'last-assistant-message': 'OK',
      }),
    ]);
    const second = run(
      ['capture', '--agent', 'generic', '--dir', queue],
      JSON.stringify({ sessionId: 's', turnId: 'empty', input: 'say OK', output: '' }),
    );
    expect(first.status, first.stderr).toBe(0);
    expect(second.status, second.stderr).toBe(0);
    fs.writeFileSync(
      path.join(directory, 'promptfooconfig.js'),
      "throw new Error('must not load implicit project config');",
    );
    const config = path.join(directory, 'grading.json');
    fs.writeFileSync(
      config,
      JSON.stringify({
        prompts: ['{{input}}'],
        providers: ['echo'],
        defaultTest: { assert: [{ type: 'equals', value: 'OK' }] },
      }),
    );
    const result = run(['watch', '--dir', queue, '-c', config, '--once']);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const receipts = fs
      .readdirSync(path.join(queue, 'results'))
      .map((file) => JSON.parse(fs.readFileSync(path.join(queue, 'results', file), 'utf8')));
    expect(receipts).toHaveLength(2);
    expect(receipts.every((r) => r.status === 'completed')).toBe(true);
    expect(receipts.reduce((n, r) => n + r.stats.successes, 0)).toBe(1);
    expect(receipts.reduce((n, r) => n + r.stats.failures, 0)).toBe(1);
    for (const receipt of receipts) {
      const report = JSON.parse(
        fs.readFileSync(path.join(queue, 'reports', `${receipt.eventId}.json`), 'utf8'),
      );
      expect(report.evalId).toBe(receipt.evalId);
      expect(report.results.results[0].metadata.online).toBe(true);
      expect(
        fs.statSync(path.join(queue, 'reports', `${receipt.eventId}.html`)).size,
      ).toBeGreaterThan(100);
    }
    const again = run(['watch', '--dir', queue, '-c', config, '--once']);
    expect(again.status, again.stderr).toBe(0);
    expect(again.stdout).not.toContain('Starting evaluation');
    expect(fs.readdirSync(path.join(queue, 'results'))).toHaveLength(2);
  });
});
