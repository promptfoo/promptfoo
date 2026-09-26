import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';

import { z } from 'zod';
import { normalizeCodexSecurityResult } from './codex-security-result';

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

/** Read one serialized SDK result, at most 64 MiB. Referenced artifacts are never opened. */
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
    source: {
      kind: 'saved-report',
      file,
      sha256: createHash('sha256').update(contents).digest('hex'),
    },
    // Coverage describes the target, not the operation that produced it. For example,
    // both standard and deep scans can produce scoped_path coverage.
    ...(validation?.success ? { operation: 'validation', status: 'completed' } : {}),
  });
  if (summary.source.mocked) {
    throw new Error(
      'Codex Security report_file is marked as a mock result. Supply an authentic SDK report.',
    );
  }
  return { raw, summary };
}
