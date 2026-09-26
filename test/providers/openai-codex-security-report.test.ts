import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createCodexSecurityReplayHeader,
  readCodexSecurityReport,
} from '../../src/providers/openai/codex-security-report';
import { normalizeCodexSecurityResult } from '../../src/providers/openai/codex-security-result';

function scanPayload() {
  return {
    manifest: {
      documentType: 'codex-security.scan-manifest',
      schemaVersion: '1.0',
      scan: {
        id: 'recorded-scan',
        status: 'completed',
        target: { revision: 'recorded-revision' },
        scope: { includePaths: ['src'], excludePaths: [], limitations: [] },
      },
    },
    findings: {
      documentType: 'codex-security.findings',
      schemaVersion: '1.0',
      scanId: 'recorded-scan',
      findings: [{ findingId: 'recorded-finding', severity: { level: 'medium' } }],
    },
    coverage: {
      documentType: 'codex-security.coverage',
      schemaVersion: '1.0',
      scanId: 'recorded-scan',
      mode: 'scoped_path',
      completeness: 'partial',
    },
    turn: { model: 'recorded-model' },
    cost: { estimatedUsd: 0.01, inputTokens: 10, outputTokens: 5 },
  };
}

function replay() {
  const payload = scanPayload();
  const result = normalizeCodexSecurityResult(payload, {
    source: { kind: 'sdk' },
    operation: 'deep-security-scan',
    sdkVersion: 'recorded-sdk',
    warnings: ['Runtime warning absent from SDK serialization'],
    diagnostics: { phase: 'scan', warningAvailability: 'observed' },
  });
  return { ...createCodexSecurityReplayHeader(payload, result), payload };
}

describe('Codex Security replay evidence validation', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-security-replay-'));
  });
  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });
  async function load(value: unknown) {
    const file = path.join(directory, 'replay.json');
    await fs.writeFile(file, JSON.stringify(value));
    return readCodexSecurityReport(file);
  }

  it('binds canonical payload bytes and retains runtime-only normalized observations', async () => {
    const envelope = replay();
    const original = structuredClone(envelope);
    expect(envelope.payloadSha256).toBe(
      createHash('sha256').update(JSON.stringify(envelope.payload)).digest('hex'),
    );
    const imported = await load(envelope);
    expect(imported.raw).toEqual(envelope.payload);
    expect(imported.summary).toEqual({
      ...envelope.result,
      source: expect.objectContaining({ kind: 'saved-report', sha256: expect.any(String) }),
    });
    expect(envelope).toEqual(original);
  });

  it('rejects changed payloads without printing their contents', async () => {
    const envelope = replay();
    envelope.payload.findings.findings[0].findingId = 'private-replacement';
    await expect(load(envelope)).rejects.toThrow('payload hash does not match');
  });

  it.each([
    [
      'scan ID',
      (value: ReturnType<typeof replay>) => {
        value.result.scanId = 'different';
      },
    ],
    [
      'status',
      (value: ReturnType<typeof replay>) => {
        value.result.status = 'failed';
      },
    ],
    [
      'findings',
      (value: ReturnType<typeof replay>) => {
        value.result.findings!.total = 0;
      },
    ],
    [
      'severity',
      (value: ReturnType<typeof replay>) => {
        value.result.findings!.bySeverity.high = 1;
      },
    ],
    [
      'coverage',
      (value: ReturnType<typeof replay>) => {
        value.result.coverage.completeness = 'complete';
      },
    ],
    [
      'revision',
      (value: ReturnType<typeof replay>) => {
        value.result.target!.revision = 'different';
      },
    ],
    [
      'scope',
      (value: ReturnType<typeof replay>) => {
        value.result.scope!.includePaths = ['different'];
      },
    ],
    [
      'model',
      (value: ReturnType<typeof replay>) => {
        value.result.model = 'requested-model';
      },
    ],
    [
      'cost',
      (value: ReturnType<typeof replay>) => {
        value.result.cost!.baselineUsd = 0;
      },
    ],
    [
      'usage',
      (value: ReturnType<typeof replay>) => {
        value.result.usage!.total = 0;
      },
    ],
  ])(
    'rejects contradictory normalized %s even with a valid payload hash',
    async (_field, mutate) => {
      const envelope = replay();
      mutate(envelope);
      await expect(load(envelope)).rejects.toThrow('metadata disagrees');
    },
  );

  it('rejects mismatched document scan IDs even after the payload is rebound', async () => {
    const envelope = replay();
    envelope.payload.coverage.scanId = 'different';
    envelope.payloadSha256 = createCodexSecurityReplayHeader(
      envelope.payload,
      envelope.result,
    ).payloadSha256;
    await expect(load(envelope)).rejects.toThrow('mismatched scan IDs');
  });

  it('rejects a replay that removes warnings explicitly reported by the SDK', async () => {
    const original = replay();
    const payload = { ...original.payload, warnings: ['Recorded SDK warning'] };
    const result = normalizeCodexSecurityResult(payload, { source: { kind: 'sdk' } });
    const envelope = { ...createCodexSecurityReplayHeader(payload, result), payload };
    envelope.result.warnings = [];
    await expect(load(envelope)).rejects.toThrow('omits recorded SDK warnings');
  });

  it('rejects a replay that downgrades explicit warning evidence to unavailable', async () => {
    const original = replay();
    const payload = { ...original.payload, warnings: [] };
    const result = normalizeCodexSecurityResult(payload, { source: { kind: 'sdk' } });
    const envelope = { ...createCodexSecurityReplayHeader(payload, result), payload };
    envelope.result.diagnostics!.warningAvailability = 'unknown';
    await expect(load(envelope)).rejects.toThrow('omits recorded warning availability');
  });

  it('rejects unsupported envelope versions', async () => {
    await expect(load({ ...replay(), schemaVersion: 2 })).rejects.toThrow(
      'invalid or unsupported replay',
    );
  });

  it('rejects explicit mocked evidence in either normalized metadata or rebound payload', async () => {
    const envelope = replay();
    envelope.result.source.mocked = true;
    await expect(load(envelope)).rejects.toThrow('mock result');
    const other = replay();
    const payload = { ...other.payload, mock: true };
    await expect(
      load({ ...createCodexSecurityReplayHeader(payload, other.result), payload }),
    ).rejects.toThrow('mock result');
  });

  it('preserves a failed outcome without inventing findings or historical duration', async () => {
    const result = normalizeCodexSecurityResult(undefined, {
      source: { kind: 'sdk' },
      operation: 'security-scan',
      status: 'failed',
      error: 'Publication failed',
      observedCost: { estimatedUsd: 0.1, inputTokens: 100, outputTokens: 50 },
      diagnostics: { phase: 'scan', warningAvailability: 'unknown' },
    });
    const imported = await load({
      ...createCodexSecurityReplayHeader(null, result),
      payload: null,
    });
    expect(imported.raw).toBeNull();
    expect(imported.summary).toMatchObject({
      status: 'failed',
      error: 'Publication failed',
      findings: null,
      elapsedMs: null,
      cost: { baselineUsd: 0.1 },
      usage: { total: 150 },
    });
  });

  it.each(['completed', 'unknown'] as const)(
    'rejects null payloads claiming %s',
    async (status) => {
      const result = normalizeCodexSecurityResult(undefined, { source: { kind: 'sdk' }, status });
      await expect(
        load({ ...createCodexSecurityReplayHeader(null, result), payload: null }),
      ).rejects.toThrow('must record a failed outcome');
    },
  );

  it('rejects missing canonical payloads that claim current findings', async () => {
    const result = replay().result;
    result.status = 'failed';
    result.error = 'Publication failed';
    await expect(
      load({ ...createCodexSecurityReplayHeader(null, result), payload: null }),
    ).rejects.toThrow('must record a failed outcome');
  });

  it('preserves validation disposition and runtime warnings through replay', async () => {
    const payload = { disposition: 'deferred', report: 'Recorded validation decision' };
    const result = normalizeCodexSecurityResult(payload, {
      source: { kind: 'sdk' },
      operation: 'validation',
      status: 'completed',
      sdkVersion: 'recorded-sdk',
      warnings: ['Recorded warning'],
      diagnostics: { phase: 'validation', warningAvailability: 'observed' },
    });
    const imported = await load({ ...createCodexSecurityReplayHeader(payload, result), payload });
    expect(imported.summary).toMatchObject({
      operation: 'validation',
      validation: { disposition: 'deferred' },
      warnings: ['Recorded warning'],
    });
  });
});
