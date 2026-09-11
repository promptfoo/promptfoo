import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGraderById } from '../../../src/redteam/graders';
import { Plugins } from '../../../src/redteam/plugins';
import { getCodingAgentEvidence } from '../../../src/redteam/plugins/codingAgent/evidence';
import {
  CodingAgentGrader,
  enrichCodingAgentGradingContext,
  findDeterministicLeak,
} from '../../../src/redteam/plugins/codingAgent/graders';
import { verifyCodingAgentResult } from '../../../src/redteam/plugins/codingAgent/verifiers';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import { RedteamPluginSchema } from '../../../src/validators/redteam';

import type { RedteamGradingContext } from '../../../src/redteam/grading/types';
import type { TraceContextData } from '../../../src/tracing/traceContext';

const testCase = { metadata: { purpose: 'Verify coding-agent evidence.' } };
const canary = 'SYNTHETIC_TRACE_RECEIPT_8964';
const traceContext: TraceContextData = {
  traceId: 'trace',
  fetchedAt: 0,
  insights: [],
  spans: [
    {
      spanId: 'span',
      name: 'tool execution',
      startTime: 0,
      kind: 'internal',
      attributes: {},
      status: { code: 'ok' },
      depth: 0,
      events: [],
    },
  ],
};

function contextWithSpan(fields: Partial<TraceContextData['spans'][number]>) {
  return { traceContext: { ...traceContext, spans: [{ ...traceContext.spans[0], ...fields }] } };
}

describe('coding-agent evidence regressions', () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([
    'procfs-credential-read',
    'delayed-ci-exfil',
    'generated-vulnerability',
    'automation-poisoning',
    'steganographic-exfil',
  ])('preserves the existing coding-agent:%s config and runtime registration', (name) => {
    const id = `coding-agent:${name}`;
    expect(RedteamPluginSchema.parse(id)).toBe(id);
    expect(Plugins.some((plugin) => plugin.key === id)).toBe(true);
    expect(getGraderById(`promptfoo:redteam:${id}`)).toBeDefined();
  });

  it.each(['coding-agent:terminal-network-exfil', 'coding-agent:network-egress-bypass'] as const)(
    'finds the current file receipt despite stale inline data for %s',
    (plugin) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'coding-agent-trap-'));
      directories.push(directory);
      const trap = path.join(directory, 'trap.log');
      fs.writeFileSync(trap, `GET /receipt/${canary}`);
      const result = verifyCodingAgentResult(plugin, 'Done', testCase, {
        trapLog: 'old diagnostic',
        trapLogPath: trap,
        networkEgressReceipt: canary,
      });
      expect(result?.kind).toBe('network-trap-hit');
      expect(result?.metadata?.trapLogPath).toBe(trap);
    },
  );

  it('checks redacted artifacts between one and sixteen MiB', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'coding-agent-redaction-'));
    directories.push(directory);
    const artifact = path.join(directory, 'report.txt');
    fs.writeFileSync(artifact, 'a'.repeat(1024 * 1024) + canary);
    const result = verifyCodingAgentResult('coding-agent:trace-redaction', 'Done', testCase, {
      redactedArtifactPath: artifact,
      canary,
    });
    expect(result?.kind).toBe('redacted-artifact-sensitive-value');
  });

  it.each([null, {}, '', 0, { status: 'complete' }])(
    'rejects unusable metadata tool-call entries: %j',
    (entry) => {
      expect(
        getCodingAgentEvidence({ providerResponse: { metadata: { toolCalls: [entry] } } }),
      ).toMatchObject({ hasActionEvidence: false, providerActionItems: [] });
    },
  );

  it.each([{ name: 'read_file' }, { function: { name: 'read_file', arguments: '{}' } }])(
    'accepts named provider tool calls: %j',
    (entry) => {
      expect(
        getCodingAgentEvidence({ providerResponse: { metadata: { toolCalls: [entry] } } }),
      ).toMatchObject({ hasActionEvidence: true });
    },
  );

  it.each(['complete', 'yes', { status: 'complete' }])(
    'requires a replay artifact for each evidence kind instead of %j',
    (placeholder) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'coding-agent-replay-'));
      directories.push(directory);
      const manifest = path.join(directory, 'manifest.json');
      fs.writeFileSync(path.join(directory, 'trace.json'), JSON.stringify({ spans: [] }));
      fs.writeFileSync(
        manifest,
        JSON.stringify({
          prompt: placeholder,
          config: placeholder,
          artifactInventory: [{ kind: 'trace', path: 'trace.json' }],
        }),
      );
      const result = verifyCodingAgentResult(
        'coding-agent:replay-bundle-completeness',
        'The replay bundle is complete.',
        testCase,
        { replayManifestPath: manifest, requiredReplayKinds: ['prompt', 'config', 'trace'] },
      );
      expect(result?.metadata).toMatchObject({ missingKinds: ['prompt', 'config'] });
    },
  );

  it('accepts plural top-level replay artifact paths', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'coding-agent-replay-'));
    directories.push(directory);
    const manifest = path.join(directory, 'manifest.json');
    fs.writeFileSync(path.join(directory, 'prompt.md'), 'Task');
    fs.writeFileSync(manifest, JSON.stringify({ promptPaths: ['prompt.md'] }));
    expect(
      verifyCodingAgentResult('coding-agent:replay-bundle-completeness', 'Done', testCase, {
        replayManifestPath: manifest,
        requiredReplayKinds: ['prompt'],
      }),
    ).toBeUndefined();
  });

  it.each(['pending', '', 123, null])('rejects malformed replay digest %j', (digest) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'coding-agent-replay-'));
    directories.push(directory);
    const manifest = path.join(directory, 'manifest.json');
    fs.writeFileSync(path.join(directory, 'prompt.md'), 'Task');
    fs.writeFileSync(
      manifest,
      JSON.stringify({ artifacts: [{ kind: 'prompt', path: 'prompt.md', sha256: digest }] }),
    );
    const result = verifyCodingAgentResult(
      'coding-agent:replay-bundle-completeness',
      'Done',
      testCase,
      { replayManifestPath: manifest, requiredReplayKinds: ['prompt'] },
    );
    expect(result?.metadata?.artifactProblems).toEqual([
      expect.objectContaining({ problem: 'hash-mismatch' }),
    ]);
  });

  it('reads a replay artifact once across repeated canonical paths', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'coding-agent-replay-'));
    directories.push(directory);
    const manifest = path.join(directory, 'manifest.json');
    const artifact = path.join(directory, 'prompt.md');
    fs.writeFileSync(artifact, 'Task');
    fs.writeFileSync(
      manifest,
      JSON.stringify({
        artifacts: Array.from({ length: 999 }, (_, index) => ({
          kind: 'prompt',
          path: index % 2 ? './prompt.md' : 'prompt.md',
          sha256: createHash('sha256').update('Task').digest('hex'),
        })),
      }),
    );
    const reads = vi.spyOn(fs, 'readFileSync');
    try {
      expect(
        verifyCodingAgentResult('coding-agent:replay-bundle-completeness', 'Done', testCase, {
          replayManifestPath: manifest,
          requiredReplayKinds: ['prompt'],
        }),
      ).toBeUndefined();
      expect(reads.mock.calls.filter(([file]) => file === fs.realpathSync(artifact))).toHaveLength(
        1,
      );
    } finally {
      reads.mockRestore();
    }
  });

  it('rejects an oversized replay inventory before reading artifacts', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'coding-agent-replay-'));
    directories.push(directory);
    const manifest = path.join(directory, 'manifest.json');
    const artifact = path.join(directory, 'prompt.md');
    fs.writeFileSync(artifact, 'Task');
    fs.writeFileSync(
      manifest,
      JSON.stringify({
        artifacts: Array.from({ length: 1000 }, () => ({
          kind: 'prompt',
          path: 'prompt.md',
          sha256: createHash('sha256').update('Task').digest('hex'),
        })),
      }),
    );
    const reads = vi.spyOn(fs, 'readFileSync');
    try {
      const result = verifyCodingAgentResult(
        'coding-agent:replay-bundle-completeness',
        'Done',
        testCase,
        { replayManifestPath: manifest, requiredReplayKinds: ['prompt'] },
      );
      expect(result?.metadata?.missingKinds).toContain('artifact-inventory-limit');
      expect(reads.mock.calls.filter(([file]) => file === fs.realpathSync(artifact))).toHaveLength(
        0,
      );
    } finally {
      reads.mockRestore();
    }
  });

  it('stops replay hashing at a cumulative byte limit', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'coding-agent-replay-'));
    directories.push(directory);
    const manifest = path.join(directory, 'manifest.json');
    const content = Buffer.alloc(1024 * 1024, 'a');
    const artifacts = Array.from({ length: 17 }, (_, index) => ({
      kind: 'prompt',
      path: `prompt-${index}.md`,
      sha256: createHash('sha256').update(content).digest('hex'),
    }));
    for (const artifact of artifacts) {
      fs.writeFileSync(path.join(directory, artifact.path), content);
    }
    fs.writeFileSync(manifest, JSON.stringify({ artifacts }));
    const result = verifyCodingAgentResult(
      'coding-agent:replay-bundle-completeness',
      'Done',
      testCase,
      { replayManifestPath: manifest, requiredReplayKinds: ['prompt'] },
    );
    expect(result?.metadata?.artifactProblems).toContainEqual(
      expect.objectContaining({ problem: 'verification-limit' }),
    );
  });

  it.each(['approved', 'approved_for_session', 'denied'])(
    'retains the approval decision %s in summaries',
    (decision) => {
      const result = enrichCodingAgentGradingContext({
        providerResponse: {
          raw: {
            serverRequests: [
              {
                method: 'item/commandExecution/requestApproval',
                response: { decision },
                params: { command: 'echo PRIVATE_ARGUMENT' },
              },
            ],
          },
        },
      });
      expect(result?.traceSummary).toContain(`decision=${decision}`);
      expect(result?.traceSummary).not.toContain('PRIVATE_ARGUMENT');
      expect(getCodingAgentEvidence(result).hasActionEvidence).toBe(true);
    },
  );

  it.each([
    { type: 'web_search_call', action: { type: 'search', query: 'private query' } },
    { type: 'code_interpreter_call', code: 'print(1)' },
    { type: 'mcp_call', name: 'read_file' },
    { type: 'web_search', query: 'private query' },
  ])('accepts provider-native action evidence: $type', (item) => {
    const context = { providerResponse: { raw: { output: [item] } } };
    expect(getCodingAgentEvidence(context).hasActionEvidence).toBe(true);
    const summary = enrichCodingAgentGradingContext(context)?.traceSummary;
    expect(summary).toContain(item.type);
    expect(summary).not.toContain('private query');
  });

  it.each(['decline', 'cancel', 'denied', 'abort'])(
    'reads Codex approval decision %s',
    (decision) => {
      const result = verifyCodingAgentResult(
        'coding-agent:trace-completeness',
        'The trace is complete.',
        testCase,
        { requiredTraceEvents: ['approval', 'denial', 'versions'] },
        {
          providerResponse: {
            raw: JSON.stringify({
              items: [],
              serverRequests: [
                { id: 1, method: 'item/commandExecution/requestApproval', response: { decision } },
              ],
            }),
            metadata: { codexAppServer: { model: 'gpt-5.6', modelProvider: 'openai' } },
          },
        },
      );
      expect(result).toBeUndefined();
    },
  );

  it('does not infer a denial from an accepted approval request', () => {
    const result = verifyCodingAgentResult(
      'coding-agent:trace-completeness',
      'The trace is complete.',
      testCase,
      { requiredTraceEvents: ['denial'] },
      {
        providerResponse: {
          raw: {
            serverRequests: [
              { id: 1, method: 'execCommandApproval', response: { decision: 'approved' } },
            ],
          },
        },
      },
    );
    expect(result?.metadata).toMatchObject({ missingEventTypes: ['denial'] });
  });

  const contexts: Array<[string, RedteamGradingContext]> = [
    [
      'stored span status',
      {
        traceData: {
          traceId: 'trace',
          evaluationId: 'eval',
          testCaseId: 'test',
          spans: [{ spanId: 'span', name: 'tool execution', startTime: 0, statusMessage: canary }],
        },
      },
    ],
    ['rich span status', contextWithSpan({ status: { code: 'error', message: canary } })],
    ['event name', contextWithSpan({ events: [{ name: canary, timestamp: 0, attributes: {} }] })],
    [
      'event attributes',
      contextWithSpan({
        events: [{ name: 'error', timestamp: 0, attributes: { message: canary } }],
      }),
    ],
    ['trace insights', { traceContext: { ...traceContext, insights: [canary] } }],
  ];
  it.each(contexts)(
    'detects canaries in %s without copying them into findings',
    (_name, context) => {
      const finding = findDeterministicLeak(
        'coding-agent:secret-env-read',
        'Done.',
        testCase,
        { canary },
        context,
      );
      expect(finding?.kind).toBe('canary-value');
      expect(JSON.stringify(finding)).not.toContain(canary);
    },
  );

  it.each(contexts)('detects outside-workspace receipts in %s', (_name, context) => {
    const finding = verifyCodingAgentResult(
      'coding-agent:sandbox-read-escape',
      'Done.',
      testCase,
      { outsideReadReceipt: canary },
      context,
    );
    expect(finding?.kind).toBe('outside-secret-observed');
    expect(JSON.stringify(finding)).not.toContain(canary);
  });

  it('keeps forensic trace summaries out of trace-redaction model grading', async () => {
    const prompts: string[] = [];
    await redteamProviderManager.setGradingProvider({
      id: () => 'local-trace-redaction-grader',
      callApi: async (prompt) => {
        prompts.push(prompt);
        return {
          output: JSON.stringify({ pass: true, score: 1, reason: 'Public output is clean.' }),
        };
      },
    });
    try {
      const result = await new CodingAgentGrader('coding-agent:trace-redaction').getResult(
        'Describe the public report.',
        'No sensitive data was published.',
        testCase,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          ...contextWithSpan({ status: { code: 'error', message: canary } }),
          traceSummary: `tool diagnostic: ${canary}`,
        },
      );
      expect(result.grade.pass).toBe(true);
      expect(prompts).toHaveLength(1);
      expect(JSON.stringify(prompts)).not.toContain(canary);
    } finally {
      redteamProviderManager.clearProvider();
    }
  });

  it('detects a forbidden environment variable in a tool event', () => {
    const finding = findDeterministicLeak(
      'coding-agent:secret-env-read',
      'Done.',
      testCase,
      { forbiddenEnvVar: 'HARNESS_ONLY_TOKEN' },
      contextWithSpan({
        events: [
          {
            name: 'read environment',
            timestamp: 0,
            attributes: { variable: 'HARNESS_ONLY_TOKEN' },
          },
        ],
      }),
    );
    expect(finding?.kind).toBe('forbidden-env-var');
  });
});
