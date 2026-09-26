/**
 * Temporary fixture copies for agent evaluations.
 *
 * A copy must outlive its provider response because assertions and afterEach hooks
 * inspect files after callApi returns. Evaluation owners release idle copies at the
 * end of the evaluation; active calls release themselves after the SDK settles.
 */
import { rmSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

type Owner = string | object;

const copiesByOwner = new Map<Owner, Set<WorkingDirectoryCopy>>();
let exitCleanupRegistered = false;

// A call still running when the process exits (e.g. after an eval timeout) never settles,
// so its copy would outlive the process. `exit` handlers must be synchronous.
function registerExitCleanup(): void {
  if (exitCleanupRegistered) {
    return;
  }
  exitCleanupRegistered = true;
  process.once('exit', () => {
    for (const copies of copiesByOwner.values()) {
      for (const copy of copies) {
        copy.removeSync();
      }
    }
  });
}

/** Whether `dir` is the workspace of a copy this process created and has not removed. */
export function isWorkingDirectoryCopy(dir: string): boolean {
  const resolved = path.resolve(dir);
  for (const copies of copiesByOwner.values()) {
    for (const copy of copies) {
      if (copy.workingDir === resolved) {
        return true;
      }
    }
  }
  return false;
}

async function assertRegularTree(root: string): Promise<void> {
  const visit = async (entryPath: string): Promise<void> => {
    const stat = await fs.lstat(entryPath);
    if (stat.isSymbolicLink()) {
      throw new Error('Symbolic links are not supported in copied working_dir: ' + entryPath);
    }
    if (stat.isDirectory()) {
      for (const entry of await fs.readdir(entryPath)) {
        await visit(path.join(entryPath, entry));
      }
      return;
    }
    if (!stat.isFile()) {
      throw new Error('Special files are not supported in copied working_dir: ' + entryPath);
    }
  };
  await visit(root);
}

export class WorkingDirectoryCopy {
  readonly workingDir: string;
  private active = true;
  private released = false;
  private removal?: Promise<void>;

  constructor(
    private readonly owner: Owner,
    private readonly root: string,
  ) {
    this.workingDir = path.join(root, 'workspace');
    const copies = copiesByOwner.get(owner) ?? new Set<WorkingDirectoryCopy>();
    copies.add(this);
    copiesByOwner.set(owner, copies);
    registerExitCleanup();
  }

  removeSync(): void {
    try {
      rmSync(this.root, { recursive: true, force: true });
    } catch {
      // Best effort: the process is exiting.
    }
  }

  private async remove(): Promise<void> {
    if (!this.removal) {
      this.removal = fs
        .rm(this.root, { recursive: true, force: true })
        .then(() => {
          const copies = copiesByOwner.get(this.owner);
          copies?.delete(this);
          if (copies?.size === 0) {
            copiesByOwner.delete(this.owner);
          }
        })
        .catch((error) => {
          // Keep the lease registered so a later cleanup can retry removal.
          this.removal = undefined;
          throw error;
        });
    }
    await this.removal;
  }

  async settle(keepForAssertions: boolean): Promise<void> {
    this.active = false;
    if (!keepForAssertions || this.released) {
      await this.remove();
    }
  }

  async release(): Promise<void> {
    this.released = true;
    if (!this.active) {
      await this.remove();
    }
  }
}

export async function copyWorkingDirectory(
  source: string,
  owner: Owner,
): Promise<WorkingDirectoryCopy> {
  await assertRegularTree(source);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-claude-agent-sdk-copy-'));
  const copy = new WorkingDirectoryCopy(owner, root);
  try {
    await fs.cp(source, copy.workingDir, {
      recursive: true,
      dereference: false,
      errorOnExist: true,
      force: false,
    });
    // A source changed during copying must not introduce a link into the SDK workspace.
    await assertRegularTree(copy.workingDir);
    return copy;
  } catch (error) {
    await copy.settle(false);
    throw error;
  }
}

/** Release one evaluation's copies without deleting a workspace still used by an SDK call. */
export async function releaseWorkingDirectoryCopies(owner: Owner): Promise<unknown[]> {
  const copies = Array.from(copiesByOwner.get(owner) ?? []);
  const results = await Promise.allSettled(copies.map((copy) => copy.release()));
  return results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
}
