import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';

import { z } from 'zod';
import { CodexSecurityReplaySchema } from '../../contracts/codexSecurity';
import { normalizeCodexSecurityResult } from './codex-security-result';

import type { CodexSecurityReplay, CodexSecurityResult } from '../../contracts/codexSecurity';

const ScanReportSchema = z.object({
  manifest: z.object({
    documentType: z.literal('codex-security.scan-manifest'),
    schemaVersion: z.literal('1.0'),
    scan: z.object({
      id: z.string().min(1),
      status: z.enum(['completed', 'failed', 'canceled', 'interrupted']),
    }),
  }),
  findings: z.object({
    documentType: z.literal('codex-security.findings'),
    schemaVersion: z.literal('1.0'),
    scanId: z.string().min(1),
    findings: z.array(z.object({ findingId: z.string().min(1) })),
  }),
  coverage: z.object({
    documentType: z.literal('codex-security.coverage'),
    schemaVersion: z.literal('1.0'),
    scanId: z.string().min(1),
    mode: z.enum([
      'repository',
      'scoped_path',
      'diff',
      'commit',
      'branch_diff',
      'working_tree',
      'deep_repository',
    ]),
    completeness: z.enum(['complete', 'partial', 'unknown']),
  }),
});

const ValidationReportSchema = z.object({
  disposition: z.enum(['reportable', 'suppressed', 'not_applicable', 'deferred']),
  report: z.string(),
});

const MAX_REPORT_BYTES = 64 * 1024 * 1024;
const READ_CHUNK_BYTES = 64 * 1024;
const REPORT_TOO_LARGE = 'Codex Security report_file exceeds the 64 MiB maximum size.';

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error('Codex Security report_file read was aborted.');
  }
}

async function readReportFile(file: string, signal?: AbortSignal): Promise<Buffer> {
  throwIfAborted(signal);
  // Nonblocking open allows us to reject non-regular files without waiting for a writer.
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    throwIfAborted(signal);
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new Error('Codex Security report_file must be a regular JSON file.');
    }
    if (stat.size > MAX_REPORT_BYTES) {
      throw new Error(REPORT_TOO_LARGE);
    }

    const buffer = Buffer.alloc(READ_CHUNK_BYTES);
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    while (true) {
      throwIfAborted(signal);
      // Read at most one byte beyond the remaining allowance to detect post-stat growth.
      const length = Math.min(READ_CHUNK_BYTES, MAX_REPORT_BYTES - totalBytes + 1);
      const { bytesRead } = await handle.read(buffer, 0, length, null);
      throwIfAborted(signal);
      if (bytesRead === 0) {
        break;
      }
      totalBytes += bytesRead;
      if (totalBytes > MAX_REPORT_BYTES) {
        throw new Error(REPORT_TOO_LARGE);
      }
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
    }
    throwIfAborted(signal);
    return Buffer.concat(chunks, totalBytes);
  } finally {
    await handle.close();
  }
}

function payloadSummary(raw: unknown, source: CodexSecurityResult['source']) {
  const isScan = raw !== null && typeof raw === 'object' && 'manifest' in raw;
  const scan = isScan ? ScanReportSchema.safeParse(raw) : null;
  const validation = isScan ? null : ValidationReportSchema.safeParse(raw);
  if (!(scan?.success || validation?.success)) {
    throw new Error(
      'Codex Security report_file must contain a serialized ScanResult.toJSON() with version 1.0 manifest, findings, and coverage documents, or a validation result with disposition and report.',
    );
  }
  if (
    scan?.success &&
    (scan.data.manifest.scan.id !== scan.data.findings.scanId ||
      scan.data.manifest.scan.id !== scan.data.coverage.scanId)
  ) {
    throw new Error('Codex Security report_file contains mismatched scan IDs.');
  }
  const summary = normalizeCodexSecurityResult(raw, {
    source,
    // Coverage describes the target, not the operation that produced it. For example,
    // both standard and deep scans can produce scoped_path coverage.
    ...(validation?.success ? { operation: 'validation', status: 'completed' } : {}),
  });
  return summary;
}

/** Pair this compact header with response.raw as payload for offline replay. */
export function createCodexSecurityReplayHeader(
  payload: Record<string, unknown> | null,
  result: CodexSecurityResult,
): Omit<CodexSecurityReplay, 'payload'> {
  return {
    documentType: 'promptfoo.codex-security-replay',
    schemaVersion: 1,
    payloadSha256:
      payload === null ? null : createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    result,
  };
}

// Recorded metadata may fill absent SDK fields, but may never contradict reported evidence.
function assertMatchingEvidence(expected: unknown, actual: unknown): void {
  if (expected === null || expected === undefined) {
    return;
  }
  if (typeof expected === 'object' && !Array.isArray(expected)) {
    if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) {
      throw new Error('Codex Security replay metadata disagrees with its SDK payload.');
    }
    for (const [key, value] of Object.entries(expected)) {
      assertMatchingEvidence(value, (actual as Record<string, unknown>)[key]);
    }
  } else if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error('Codex Security replay metadata disagrees with its SDK payload.');
  }
}

function validateReplay(replay: CodexSecurityReplay): void {
  const { payload, result } = replay;
  if (payload === null) {
    if (
      replay.payloadSha256 !== null ||
      !['failed', 'canceled', 'interrupted'].includes(result.status) ||
      !result.error ||
      result.findings !== null ||
      result.validation !== null
    ) {
      throw new Error('Codex Security replay without an SDK payload must record a failed outcome.');
    }
    return;
  }
  if (createCodexSecurityReplayHeader(payload, result).payloadSha256 !== replay.payloadSha256) {
    throw new Error('Codex Security replay SDK payload hash does not match.');
  }
  const intrinsic = payloadSummary(payload, { kind: 'saved-report', mocked: false });
  if (intrinsic.source.mocked || result.source.mocked) {
    throw new Error('Codex Security report_file is marked as a mock result.');
  }
  // Required scan fields and derived finding counts must match exactly, including unknowns.
  for (const key of ['scanId', 'status', 'findings', 'coverage', 'validation'] as const) {
    if (JSON.stringify(intrinsic[key]) !== JSON.stringify(result[key])) {
      throw new Error('Codex Security replay metadata disagrees with its SDK payload.');
    }
  }
  for (const key of [
    'operation',
    'error',
    'model',
    'versions',
    'cost',
    'elapsedMs',
    'usage',
    'target',
    'scope',
  ] as const) {
    assertMatchingEvidence(intrinsic[key], result[key]);
  }
  if (
    intrinsic.diagnostics?.warningAvailability === 'observed' &&
    result.diagnostics?.warningAvailability !== 'observed'
  ) {
    throw new Error('Codex Security replay metadata omits recorded warning availability.');
  }
  if (intrinsic.warnings.some((warning) => !result.warnings.includes(warning))) {
    throw new Error('Codex Security replay metadata omits recorded SDK warnings.');
  }
  if (result.status === 'completed' && result.error !== null) {
    throw new Error('Codex Security replay completed outcome cannot contain an error.');
  }
}

/** Read a bounded SDK result or replay envelope. Referenced artifacts are never opened. */
export async function readCodexSecurityReport(file: string, signal?: AbortSignal) {
  const contents = await readReportFile(file, signal);
  throwIfAborted(signal);
  let raw: unknown;
  try {
    raw = JSON.parse(contents.toString('utf8'));
  } catch {
    // JSON parser messages can include excerpts of private report contents.
    throw new Error('Codex Security report_file is not valid JSON.');
  }
  const source = {
    kind: 'saved-report' as const,
    file,
    sha256: createHash('sha256').update(contents).digest('hex'),
    mocked: false,
  };
  let summary: CodexSecurityResult;
  if (
    raw !== null &&
    typeof raw === 'object' &&
    'documentType' in raw &&
    raw.documentType === 'promptfoo.codex-security-replay'
  ) {
    const parsed = CodexSecurityReplaySchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        'Codex Security report_file contains an invalid or unsupported replay envelope.',
      );
    }
    validateReplay(parsed.data);
    summary = {
      ...parsed.data.result,
      source: { ...source, mocked: parsed.data.result.source.mocked },
    };
    raw = parsed.data.payload;
  } else {
    summary = payloadSummary(raw, source);
  }
  if (summary.source.mocked) {
    throw new Error(
      'Codex Security report_file is marked as a mock result. Supply an authentic SDK report.',
    );
  }
  return { raw, summary };
}
