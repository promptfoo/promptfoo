import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importModule } from '../../src/esm';
import { maybeLoadToolsFromExternalFile } from '../../src/util/file';

describe('executable tools import cancellation', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'promptfoo-tools-import-'));
    await writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it.each([false, true])(
    'does not invoke after a cancelled real import (array: %s)',
    async (asArray) => {
      const controlFile = path.join(directory, 'control.js');
      await writeFile(
        controlFile,
        `export const started = Promise.withResolvers();
export const held = Promise.withResolvers();
export const calls = [];
`,
      );
      const control = await importModule(controlFile);
      const toolFile = path.join(directory, 'tools.js');
      await writeFile(
        toolFile,
        `import { started, held, calls } from './control.js';
started.resolve();
await held.promise;
export function get_tools() { calls.push('invoked'); return []; }
`,
      );
      const controller = new AbortController();
      const reason = new Error('cancel before invocation');
      const fileReference = `file://${toolFile}:get_tools`;
      const pending = maybeLoadToolsFromExternalFile(
        asArray ? [fileReference] : fileReference,
        undefined,
        controller.signal,
      );
      const outcome = pending.catch((error: unknown) => error);
      await control.started.promise;
      controller.abort(reason);
      control.held.resolve();
      const failure = await outcome;
      expect(control.calls).toEqual([]);
      expect(failure).toBe(reason);
    },
  );

  it('does not start importing a pre-aborted executable tools file', async () => {
    const file = path.join(directory, 'never-import.js');
    await writeFile(
      file,
      'throw new Error("executable module started"); export function get_tools() {}',
    );
    const controller = new AbortController();
    const reason = new Error('already cancelled');
    controller.abort(reason);
    await expect(
      maybeLoadToolsFromExternalFile(`file://${file}:get_tools`, undefined, controller.signal),
    ).rejects.toBe(reason);
  });
});
