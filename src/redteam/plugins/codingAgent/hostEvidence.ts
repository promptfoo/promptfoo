import { AsyncLocalStorage } from 'node:async_hooks';
import { type BigIntStats, constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buffer } from 'node:stream/consumers';

import type { ProviderResponse } from '../../../types/index';

export type TrapLogPosition = Pick<BigIntStats, 'dev' | 'ino' | 'size'>;

/** Local observations for one evaluator row. Provider responses cannot supply this state. */
export interface CodingAgentHostEvidence {
  workingDir: string;
  /** SHA-256 for a readable file, undefined for confirmed absence, null when observation failed. */
  baseline: Map<string, string | null | undefined>;
  /** Counts of matching automation statements before this row, keyed by file and statement hash. */
  automationSections?: Map<string, Map<string, number>>;
  /** Occurrence counts for configured markers already present in a receipt artifact. */
  artifactMarkerCounts?: Map<string, Map<string, number>>;
  /** Initial file position, or null if the trap log did not exist. */
  trapLogs?: Map<string, TrapLogPosition | null>;
  workspaceDiff?: string;
  workspaceDiffError?: 'truncated' | 'unavailable';
  turns?: Map<string, { prompt?: string; response: ProviderResponse; spanId?: string }>;
}

const rowEvidence = new AsyncLocalStorage<CodingAgentHostEvidence>();

export function getCodingAgentHostEvidence(): CodingAgentHostEvidence | undefined {
  return rowEvidence.getStore();
}

export function withCodingAgentHostEvidence<T>(evidence: CodingAgentHostEvidence, fn: () => T): T {
  return rowEvidence.run(evidence, fn);
}

/** Read at most one bounded regular file. Check the opened inode before consuming its contents. */
export async function readRowFile(
  filePath: string,
  trustedRoot: string | undefined,
  maxBytes: number,
  after?: TrapLogPosition | null,
): Promise<Buffer | undefined> {
  let handle;
  try {
    const real = await fs.realpath(filePath);
    const root = trustedRoot ?? (await fs.realpath(path.dirname(filePath)));
    const relative = path.relative(root, real);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      return undefined;
    }
    const expected = await fs.lstat(filePath, { bigint: true });
    const start = after?.size ?? 0n;
    if (
      !expected.isFile() ||
      (after && (expected.dev !== after.dev || expected.ino !== after.ino)) ||
      expected.size < start ||
      expected.size - start > maxBytes ||
      start > Number.MAX_SAFE_INTEGER - maxBytes
    ) {
      return undefined;
    }
    handle = await fs.open(
      filePath,
      constants.O_RDONLY |
        (process.platform === 'win32' ? 0 : constants.O_NONBLOCK | constants.O_NOFOLLOW),
    );
    const stat = await handle.stat({ bigint: true });
    if (
      !stat.isFile() ||
      stat.dev !== expected.dev ||
      stat.ino !== expected.ino ||
      stat.size < start ||
      stat.size - start > maxBytes ||
      (await fs.realpath(filePath)) !== real
    ) {
      return undefined;
    }
    // On Linux the kernel can identify the opened file even if a parent directory was replaced.
    if (process.platform === 'linux') {
      const opened = await fs.readlink(`/proc/self/fd/${handle.fd}`).catch(() => undefined);
      if (opened && opened !== real) {
        return undefined;
      }
    }
    const contents = await buffer(
      handle.createReadStream({
        start: Number(start),
        end: Number(start) + maxBytes,
        autoClose: false,
      }),
    );
    return contents.length <= maxBytes ? contents : undefined;
  } catch {
    return undefined;
  } finally {
    await handle?.close();
  }
}
