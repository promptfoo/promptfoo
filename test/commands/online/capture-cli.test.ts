import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCapture } from '../../../src/commands/online/capture';
import { MAX_EVENT_BYTES, readJson } from '../../../src/commands/online/store';

let directory: string;
const payload = JSON.stringify({ sessionId: 's', turnId: 't', input: 'task', output: 'reply' });
const args = () => ['--agent', 'generic', '--dir', directory];

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(tmpdir(), 'online-capture-cli-'));
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await fs.rm(directory, { recursive: true, force: true });
});

describe('capture hook protocol', () => {
  it.each(['argument', 'buffer stdin', 'string stdin'])('captures JSON from %s', async (source) => {
    if (source !== 'argument') {
      const chunk = source === 'buffer stdin' ? Buffer.from(payload) : payload;
      vi.spyOn(process, 'stdin', 'get').mockReturnValue(
        Readable.from([chunk]) as typeof process.stdin,
      );
    }
    await runCapture([...args(), ...(source === 'argument' ? [payload] : [])]);
    expect(process.stdout.write).toHaveBeenCalledWith('{}\n');
    expect(process.stderr.write).not.toHaveBeenCalled();
    const files = await fs.readdir(path.join(directory, 'events'));
    expect(files).toHaveLength(1);
    expect(await readJson(path.join(directory, 'events', files[0]))).toMatchObject({
      input: 'task',
      output: 'reply',
    });
  });

  it.each(['malformed', 'oversized argument', 'oversized stdin', 'tty', 'invalid option'])(
    'fails open without disclosing the payload for %s',
    async (source) => {
      const command = args();
      if (source === 'malformed') {
        command.push('{private-secret');
      }
      if (source === 'oversized argument') {
        command.push('x'.repeat(MAX_EVENT_BYTES + 1));
      }
      if (source === 'oversized stdin') {
        vi.spyOn(process, 'stdin', 'get').mockReturnValue(
          Readable.from([Buffer.alloc(MAX_EVENT_BYTES + 1)]) as typeof process.stdin,
        );
      }
      if (source === 'tty') {
        const stdin = Readable.from([]) as typeof process.stdin;
        Object.defineProperty(stdin, 'isTTY', { value: true });
        vi.spyOn(process, 'stdin', 'get').mockReturnValue(stdin);
      }
      if (source === 'invalid option') {
        command.push('--unknown');
      }
      await runCapture(command);
      expect(process.stdout.write).toHaveBeenCalledWith('{}\n');
      expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('capture failed'));
      expect(JSON.stringify(vi.mocked(process.stderr.write).mock.calls)).not.toContain(
        'private-secret',
      );
      expect(await fs.readdir(directory)).toEqual([]);
    },
  );

  it('bounds a hook whose stdin never closes', async () => {
    vi.useFakeTimers();
    const stdin = new PassThrough();
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(stdin as unknown as typeof process.stdin);
    const capture = runCapture(args());
    await vi.advanceTimersByTimeAsync(5000);
    await capture;
    expect(stdin.destroyed).toBe(true);
    expect(process.stdout.write).toHaveBeenCalledWith('{}\n');
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('capture failed'));
  });

  it('shows help without treating it as a failed hook', async () => {
    await runCapture(['--help']);
    expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    expect(process.stderr.write).not.toHaveBeenCalled();
  });
});
