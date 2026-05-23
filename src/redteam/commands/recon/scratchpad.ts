import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import dedent from 'dedent';

import type { Scratchpad } from './types';

/**
 * Creates an isolated temporary working directory for the recon agent.
 *
 * The OpenAI provider applies a read-only sandbox to this directory and the
 * target codebase; it is automatically cleaned up after recon completes.
 */
export function createScratchpad(): Scratchpad {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-recon-'));
  const scratchpadPath = path.join(dir, 'notes.md');

  fs.writeFileSync(
    scratchpadPath,
    dedent`
      # Recon Workspace

      Temporary workspace marker for a read-only reconnaissance run.
      This directory will be deleted after the run completes.

      ---

    ` + '\n',
  );

  return {
    dir,
    path: scratchpadPath,
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}
