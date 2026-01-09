import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import dedent from 'dedent';

import type { Scratchpad } from './types';

/**
 * Creates a temporary scratchpad directory and notes file for the agent to use during analysis.
 *
 * The scratchpad provides a place for the agent to take notes while analyzing the codebase.
 * It is automatically cleaned up after the recon completes.
 */
export function createScratchpad(): Scratchpad {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-recon-'));
  const scratchpadPath = path.join(dir, 'notes.md');

  fs.writeFileSync(
    scratchpadPath,
    dedent`
      # Recon Scratchpad

      Use this file to keep notes during your analysis.
      This file will be deleted after the recon completes.

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
