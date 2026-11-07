import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { captureEvent } from '../../../src/commands/online/capture';
import { enqueue, MAX_EVENT_BYTES, readJson, writeJson } from '../../../src/commands/online/store';

let directory: string;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(tmpdir(), 'online-capture-'));
});
afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

const submit = (session_id = 'session') => ({
  hook_event_name: 'UserPromptSubmit',
  session_id,
  prompt: 'What is 2+2?',
});
const stop = (session_id = 'session', output = '4') => ({
  hook_event_name: 'Stop',
  session_id,
  last_assistant_message: output,
});

async function events() {
  const folder = path.join(directory, 'events');
  return Promise.all((await fs.readdir(folder)).map((file) => readJson(path.join(folder, file))));
}

describe('Agent hook capture', () => {
  it('pairs Claude hooks and captures only the allowlisted fields', async () => {
    await captureEvent(directory, 'claude-code', {
      ...submit(),
      transcript_path: '/do/not/read',
      apiKey: 'private',
    });
    await captureEvent(directory, 'claude-code', stop());
    expect(await events()).toEqual([
      expect.objectContaining({
        agent: 'claude-code',
        sessionId: 'session',
        input: 'What is 2+2?',
        output: '4',
      }),
    ]);
    expect(JSON.stringify(await events())).not.toContain('private');
    const folder = path.join(directory, 'events');
    const file = (await fs.readdir(folder))[0];
    if (process.platform !== 'win32') {
      expect((await fs.stat(path.join(folder, file))).mode & 0o777).toBe(0o600);
    }
  });

  it('deduplicates concurrent deliveries of the same Stop', async () => {
    await captureEvent(directory, 'claude-code', submit());
    const ids = await Promise.all(
      Array.from({ length: 8 }, () => captureEvent(directory, 'claude-code', stop())),
    );
    expect(new Set(ids).size).toBe(1);
    expect(await events()).toHaveLength(1);
    await captureEvent(directory, 'claude-code', submit());
    await captureEvent(directory, 'claude-code', stop());
    expect(await events()).toHaveLength(2); // Identical replies in distinct turns are not duplicates.
  });

  it('isolates Agent, session and Codex turn ids, including out-of-order Stops', async () => {
    await captureEvent(directory, 'codex', { ...submit(), turn_id: 'one' });
    await captureEvent(directory, 'codex', { ...submit(), turn_id: 'two', prompt: 'Second' });
    await captureEvent(directory, 'claude-code', { ...submit(), prompt: 'Claude' });
    await captureEvent(directory, 'codex', { ...stop(), turn_id: 'one' });
    await captureEvent(directory, 'codex', { ...stop(), turn_id: 'two' });
    await captureEvent(directory, 'claude-code', stop());
    expect((await events()).map((x) => (x as { input: string }).input).sort()).toEqual([
      'Claude',
      'Second',
      'What is 2+2?',
    ]);
  });

  it('supports the Codex notify JSON contract without a stored prompt', async () => {
    await captureEvent(directory, 'codex', {
      type: 'agent-turn-complete',
      'thread-id': 'thread',
      'turn-id': 'turn',
      'input-messages': ['First', 'Second'],
      'last-assistant-message': 'Done',
    });
    expect(await events()).toEqual([
      expect.objectContaining({ input: 'First\n\nSecond', output: 'Done', turnId: 'turn' }),
    ]);
  });

  it('requires matching input and a text reply, but preserves an empty reply for grading', async () => {
    await expect(captureEvent(directory, 'claude-code', stop())).rejects.toThrow();
    await captureEvent(directory, 'claude-code', submit());
    await expect(
      captureEvent(directory, 'claude-code', { ...stop(), last_assistant_message: null }),
    ).rejects.toThrow();
    await captureEvent(directory, 'claude-code', stop('session', ''));
    expect(await events()).toEqual([expect.objectContaining({ output: '' })]);
    await expect(captureEvent(directory, 'claude-code', stop('another'))).rejects.toThrow();
  });

  it('does not interpret session identifiers or extra fields as paths or configuration', async () => {
    await captureEvent(directory, 'generic', {
      sessionId: '../../outside',
      turnId: '../turn',
      input: '{{env.SECRET}}',
      output: 'answer',
      providers: ['exec: malicious'],
      assert: [{ type: 'javascript', value: 'malicious()' }],
    });
    const [event] = await events();
    expect(event).toMatchObject({ input: '{{env.SECRET}}', output: 'answer' });
    expect(event).not.toHaveProperty('providers');
    expect(event).not.toHaveProperty('assert');
    expect((await fs.readdir(path.join(directory, 'events')))[0]).toMatch(/^[a-f0-9]{64}\.json$/);
  });

  it('rejects malformed and oversized captured output instead of truncating it', async () => {
    await expect(
      captureEvent(directory, 'generic', {
        sessionId: 's',
        turnId: 't',
        input: 'x',
        output: 'a'.repeat(MAX_EVENT_BYTES),
      }),
    ).rejects.toThrow();
    await expect(
      captureEvent(directory, 'codex', { ...submit(), hook_event_name: 'PostToolUse' }),
    ).rejects.toThrow();
    await expect(captureEvent(directory, 'generic', {})).rejects.toThrow();
  });

  it('refuses symlinked records and directories and oversized files', async () => {
    const target = path.join(directory, 'target.json');
    await fs.writeFile(target, '{}');
    const link = path.join(directory, 'link.json');
    await fs.symlink(target, link);
    await expect(readJson(link)).rejects.toThrow();
    await fs.mkdir(path.join(directory, 'other'), { mode: 0o700 });
    await fs.symlink(path.join(directory, 'other'), path.join(directory, 'events'));
    await expect(
      enqueue(directory, {
        version: 1,
        agent: 'generic',
        sessionId: 's',
        turnId: 't',
        input: 'x',
        output: 'y',
        capturedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow();
    await fs.writeFile(target, 'a'.repeat(MAX_EVENT_BYTES + 1));
    await expect(readJson(target)).rejects.toThrow();
  });

  it('does not overwrite an already published event and never leaves temporary files', async () => {
    const file = path.join(directory, 'event.json');
    await writeJson(file, { first: true });
    await writeJson(file, { first: false });
    expect(await readJson(file)).toEqual({ first: true });
    expect(await fs.readdir(directory)).toEqual(['event.json']);
  });
});

it('does not reuse a completed Claude request when a new prompt was missed', async () => {
  await captureEvent(directory, 'claude-code', submit());
  await captureEvent(directory, 'claude-code', stop());
  await expect(
    captureEvent(directory, 'claude-code', stop('session', 'unrelated reply')),
  ).rejects.toThrow('No new user prompt');
  await expect(
    captureEvent(directory, 'claude-code', { ...submit(), prompt: '' }),
  ).rejects.toThrow();
  await expect(captureEvent(directory, 'claude-code', stop())).rejects.toThrow();
  expect(await events()).toHaveLength(1);
});
