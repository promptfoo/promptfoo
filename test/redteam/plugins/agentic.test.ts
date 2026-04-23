import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasTraceAwareAssertions } from '../../../src/assertions';
import { fetchWithCache } from '../../../src/cache';
import { AGENTIC_RUNTIME_PLUGINS } from '../../../src/redteam/constants/agentic';
import { getGraderById } from '../../../src/redteam/graders';
import { Plugins } from '../../../src/redteam/plugins';
import { AgenticRuntimePlugin } from '../../../src/redteam/plugins/agentic';
import { neverGenerateRemote } from '../../../src/redteam/remoteGeneration';
import { checkRemoteHealth } from '../../../src/util/apiHealth';

import type { ApiProvider, AtomicTestCase } from '../../../src/types';
import type { TraceData } from '../../../src/types/tracing';

vi.mock('../../../src/cache');
vi.mock('../../../src/redteam/remoteGeneration', async (importOriginal) => ({
  ...(await importOriginal()),
  getRemoteGenerationUrl: vi.fn().mockReturnValue('https://remote.example.test/api/v1/task'),
  getRemoteHealthUrl: vi.fn().mockReturnValue('https://remote.example.test/health'),
  neverGenerateRemote: vi.fn().mockReturnValue(false),
}));
vi.mock('../../../src/util/apiHealth', async (importOriginal) => ({
  ...(await importOriginal()),
  checkRemoteHealth: vi.fn().mockResolvedValue({
    message: 'API is healthy',
    status: 'OK',
  }),
}));

describe('Agentic redteam plugins', () => {
  const provider = {
    id: () => 'test-provider',
    callApi: vi.fn(),
  } as unknown as ApiProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(neverGenerateRemote).mockReturnValue(false);
    vi.mocked(checkRemoteHealth).mockResolvedValue({
      message: 'API is healthy',
      status: 'OK',
    });
    vi.mocked(fetchWithCache).mockImplementation(async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      return {
        cached: false,
        data: {
          result: [
            {
              assert: [
                {
                  metric: 'AgenticRuntimeRemote',
                  type: `promptfoo:redteam:${body.task}`,
                },
              ],
              metadata: {
                agenticScenario: {
                  expectedFinding: `remote expected finding for ${body.task}`,
                  goal: `remote goal for ${body.task}`,
                  id: `remote-${body.task}`,
                },
                pluginId: body.task,
              },
              vars: {
                [body.injectVar]: `remote goal for ${body.task}`,
                agenticExpectedFinding: `remote expected finding for ${body.task}`,
                agenticPluginId: body.task,
                agenticScenarioId: `remote-${body.task}`,
              },
            },
          ],
        },
        status: 200,
        statusText: 'OK',
      };
    });
  });

  it('routes generation for every Agentic runtime plugin through remote generation', async () => {
    for (const pluginId of AGENTIC_RUNTIME_PLUGINS) {
      const factory = Plugins.find((plugin) => plugin.key === pluginId);
      expect(factory, `${pluginId} should be registered`).toBeDefined();

      const tests = await factory!.action({
        config: {},
        delayMs: 0,
        injectVar: 'prompt',
        n: 2,
        provider,
        purpose: 'OpenAI agentic runtime support workflow',
      });

      expect(tests).toHaveLength(1);
      expect(tests[0].vars?.prompt).toBe(`remote goal for ${pluginId}`);
      expect(tests[0].vars?.agenticPluginId).toBe(pluginId);
      expect(tests[0].assert?.[0].type).toBe(`promptfoo:redteam:${pluginId}`);
      expect(tests[0].metadata?.pluginId).toBe(pluginId);
      expect(tests[0].metadata?.pluginConfig).toEqual({ modifiers: {} });
    }
    expect(provider.callApi).not.toHaveBeenCalled();
    expect(fetchWithCache).toHaveBeenCalledTimes(AGENTIC_RUNTIME_PLUGINS.length);
    const requestTasks = vi
      .mocked(fetchWithCache)
      .mock.calls.map((call) => JSON.parse(String(call[1]?.body)).task);
    expect(requestTasks).toEqual([...AGENTIC_RUNTIME_PLUGINS]);
  });

  it('generates local synthetic Agentic runtime scenarios when used directly', async () => {
    const plugin = new AgenticRuntimePlugin(
      provider,
      'OpenAI agentic runtime support workflow',
      'prompt',
      { modifiers: { environment: 'agents-sdk-example' } },
      'agentic:approval-continuity',
    );

    const tests = await plugin.generateTests(4);

    expect(plugin.id).toBe('promptfoo:redteam:agentic:approval-continuity');
    await expect((plugin as any).getTemplate()).resolves.toBe('');
    expect(tests).toHaveLength(4);
    expect(tests.map((test) => test.vars?.agenticScenarioId)).toEqual([
      'approval-reuse-across-tools',
      'nested-agent-approval-collapse',
      'resume-state-approval-broadening',
      'approval-reuse-across-tools',
    ]);
    expect(tests[0].vars?.prompt).toContain('Reuse that approval');
    expect(tests[0].assert).toEqual([
      {
        metric: 'AgenticApprovalContinuity',
        type: 'promptfoo:redteam:agentic:approval-continuity',
      },
    ]);
    expect(tests[3].metadata).toMatchObject({
      pluginConfig: { modifiers: { environment: 'agents-sdk-example' } },
      pluginId: 'agentic:approval-continuity',
      severity: 'high',
      syntheticProviderMarker: 'agentic-agentic:approval-continuity-3',
    });
  });

  it('fails every plugin deterministically when structured evidence contains a matching finding', async () => {
    for (const pluginId of AGENTIC_RUNTIME_PLUGINS) {
      const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
      expect(grader, `${pluginId} grader should be registered`).toBeDefined();

      const output = JSON.stringify({
        agenticEvidence: {
          findings: [
            {
              pluginId,
              kind: pluginId.replace('agentic:', ''),
              location: 'sdk.boundary',
              evidence: `${pluginId} boundary crossed`,
            },
          ],
          mode: 'vulnerable',
          pluginId,
        },
      });

      const result = await grader!.getResult(
        'prompt',
        output,
        {
          metadata: { purpose: 'agentic runtime app' },
        } as AtomicTestCase,
        undefined,
        undefined,
      );

      expect(result.grade.pass, `${pluginId} should fail on matching evidence`).toBe(false);
      expect(result.grade.score).toBe(0);
      expect(result.grade.metadata?.deterministicFailure).toBe(true);
    }
  });

  it('treats Agentic redteam assertions as trace-aware', () => {
    expect(
      hasTraceAwareAssertions([
        {
          type: 'promptfoo:redteam:agentic:approval-continuity',
        } as any,
      ]),
    ).toBe(true);
  });

  it('fails from OTEL agentic finding span attributes', async () => {
    const pluginId = 'agentic:tool-error-feedback-injection';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const traceData: TraceData = {
      evaluationId: 'eval-otel',
      testCaseId: 'case-otel',
      traceId: '0123456789abcdef0123456789abcdef',
      spans: [
        {
          attributes: {
            'promptfoo.agentic.finding.evidence':
              'tool_error_formatter text was followed as an instruction',
            'promptfoo.agentic.finding.kind': 'tool-error-feedback-injection',
            'promptfoo.agentic.finding.location': 'tool_error_formatter',
            'promptfoo.agentic.plugin_id': pluginId,
          },
          name: 'agentic finding',
          spanId: 'span-1',
          startTime: 0,
        },
      ],
    };

    const result = await grader!.getResult(
      'prompt',
      JSON.stringify({ agenticEvidence: { findings: [], mode: 'hardened' } }),
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      { traceData },
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.evidenceSource).toBe('otel');
    expect(result.grade.metadata?.deterministicFailureKind).toBe('tool-error-feedback-injection');
  });

  it('prefers relevant OTEL evidence over provider metadata when trace spans are instrumented', async () => {
    const pluginId = 'agentic:approval-continuity';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const output = JSON.stringify({
      agenticEvidence: {
        findings: [
          {
            pluginId,
            kind: 'approval-continuity',
          },
        ],
        mode: 'vulnerable',
      },
    });

    const result = await grader!.getResult(
      'prompt',
      output,
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        traceData: {
          evaluationId: 'eval-otel-clean',
          testCaseId: 'case-otel-clean',
          traceId: '11111111111111111111111111111111',
          spans: [
            {
              attributes: {
                'agent.name': 'clean_agent',
                'promptfoo.agentic.evidence_json': JSON.stringify({
                  findings: [],
                  mode: 'hardened',
                  pluginId,
                }),
              },
              name: 'agent clean_agent',
              spanId: 'span-1',
              startTime: 0,
            },
          ],
        },
      },
    );

    expect(result.grade.pass).toBe(true);
    expect(result.grade.metadata?.evidenceSource).toBe('otel');
  });

  it('does not treat plugin-id-only OTEL trace markers as verifier evidence', async () => {
    const pluginId = 'agentic:approval-continuity';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      'final answer without verifier evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        traceData: {
          evaluationId: 'eval-marker-only',
          testCaseId: 'case-marker-only',
          traceId: '88888888888888888888888888888888',
          spans: [
            {
              attributes: {
                'promptfoo.agentic.plugin_id': pluginId,
              },
              name: 'agentic verifier marker',
              spanId: 'span-1',
              startTime: 0,
            },
          ],
        },
      },
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.verifierStatus).toBe('missing-evidence');
  });

  it('accepts plugin-scoped Agentic evidence from OTEL span events', async () => {
    const pluginId = 'agentic:handoff-context-leakage';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      JSON.stringify({
        agenticEvidence: {
          findings: [
            {
              kind: 'handoff-context-leakage',
              pluginId,
            },
          ],
          mode: 'vulnerable',
          pluginId,
        },
      }),
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        traceData: {
          evaluationId: 'eval-event-otel-clean',
          testCaseId: 'case-event-otel-clean',
          traceId: '55555555555555555555555555555555',
          spans: [
            {
              attributes: {
                'agent.name': 'handoff_agent',
              },
              events: [
                {
                  attributes: {
                    agenticEvidence: JSON.stringify({
                      findings: [
                        {
                          kind: 'handoff-context-leakage',
                          pluginId,
                        },
                      ],
                      mode: 'vulnerable',
                    }),
                  },
                  name: 'agentic runtime verifier',
                },
              ],
              name: 'agent handoff_agent',
              spanId: 'span-1',
              startTime: 0,
            } as any,
          ],
        },
      },
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.evidenceSource).toBe('otel');
    expect(result.grade.metadata?.deterministicFailureKind).toBe('handoff-context-leakage');
  });

  it('uses clean Agentic evidence from OTEL span events before provider fallback', async () => {
    const pluginId = 'agentic:session-memory-contamination';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      JSON.stringify({
        agenticEvidence: {
          findings: [
            {
              kind: 'session-memory-contamination',
              pluginId,
            },
          ],
          mode: 'vulnerable',
          pluginId,
        },
      }),
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        traceData: {
          evaluationId: 'eval-event-otel-clean',
          testCaseId: 'case-event-otel-clean',
          traceId: '66666666666666666666666666666666',
          spans: [
            {
              attributes: {
                'agent.name': 'memory_agent',
              },
              events: [
                {
                  attributes: {
                    agenticEvidence: JSON.stringify({
                      findings: [],
                      mode: 'hardened',
                      pluginId,
                    }),
                  },
                  name: 'agentic runtime verifier',
                },
              ],
              name: 'agent memory_agent',
              spanId: 'span-1',
              startTime: 0,
            } as any,
          ],
        },
      },
    );

    expect(result.grade.pass).toBe(true);
    expect(result.grade.metadata?.evidenceSource).toBe('otel');
  });

  it('does not let unrelated trace spans mask provider Agentic findings', async () => {
    const pluginId = 'agentic:approval-continuity';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const output = JSON.stringify({
      agenticEvidence: {
        findings: [
          {
            pluginId,
            kind: 'approval-continuity',
          },
        ],
        mode: 'vulnerable',
      },
    });

    const result = await grader!.getResult(
      'prompt',
      output,
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        traceData: {
          evaluationId: 'eval-unrelated-otel',
          testCaseId: 'case-unrelated-otel',
          traceId: '33333333333333333333333333333333',
          spans: [
            {
              attributes: {
                'agent.name': 'generic_agent',
              },
              name: 'agent generic_agent',
              spanId: 'span-1',
              startTime: 0,
            },
          ],
        },
      },
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.evidenceSource).toBe('provider');
  });

  it('does not let unrelated Agentic trace findings mask provider Agentic findings', async () => {
    const pluginId = 'agentic:approval-continuity';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const output = JSON.stringify({
      agenticEvidence: {
        findings: [
          {
            pluginId,
            kind: 'approval-continuity',
          },
        ],
        mode: 'vulnerable',
        pluginId,
      },
    });

    const result = await grader!.getResult(
      'prompt',
      output,
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        traceData: {
          evaluationId: 'eval-unrelated-agentic-otel',
          testCaseId: 'case-unrelated-agentic-otel',
          traceId: '44444444444444444444444444444444',
          spans: [
            {
              attributes: {
                'promptfoo.agentic.finding.kind': 'mcp-schema-injection',
                'promptfoo.agentic.plugin_id': 'agentic:mcp-schema-injection',
              },
              name: 'agentic unrelated finding',
              spanId: 'span-1',
              startTime: 0,
            },
          ],
        },
      },
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.evidenceSource).toBe('provider');
    expect(result.grade.metadata?.deterministicFailureKind).toBe('approval-continuity');
  });

  it('infers guardrail coverage gaps from normalized Codex tool observations', async () => {
    const pluginId = 'agentic:guardrail-coverage-gap';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      JSON.stringify({ agenticEvidence: { findings: [], mode: 'hardened' } }),
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        traceData: {
          evaluationId: 'eval-codex-tool',
          testCaseId: 'case-codex-tool',
          traceId: '22222222222222222222222222222222',
          spans: [
            {
              attributes: {
                'codex.tool.name': 'update_seat',
              },
              name: 'tool update_seat',
              spanId: 'span-1',
              startTime: 0,
            },
          ],
        },
      },
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.evidenceSource).toBe('otel');
    expect(result.grade.metadata?.deterministicFailureKind).toBe('guardrail-coverage-gap');
  });

  it('does not let string false approval attributes suppress guardrail gap inference', async () => {
    const pluginId = 'agentic:guardrail-coverage-gap';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      JSON.stringify({ agenticEvidence: { findings: [], mode: 'hardened' } }),
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        traceData: {
          evaluationId: 'eval-codex-tool-string-false',
          testCaseId: 'case-codex-tool-string-false',
          traceId: '77777777777777777777777777777777',
          spans: [
            {
              attributes: {
                'approval.required': 'false',
                'codex.tool.name': 'update_seat',
              },
              name: 'tool update_seat',
              spanId: 'span-1',
              startTime: 0,
            },
          ],
        },
      },
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.deterministicFailureKind).toBe('guardrail-coverage-gap');
  });

  it('passes when structured Agentic evidence has no matching finding', async () => {
    const pluginId = 'agentic:approval-continuity';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const output = JSON.stringify({
      agenticEvidence: {
        findings: [],
        mode: 'hardened',
        pluginId,
      },
    });

    const result = await grader!.getResult(
      'prompt',
      output,
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
    );

    expect(result.grade.pass).toBe(true);
    expect(result.grade.metadata?.verifierStatus).toBe('passed');
  });

  it('does not pass on unscoped clean Agentic evidence', async () => {
    const pluginId = 'agentic:approval-continuity';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      JSON.stringify({ agenticEvidence: { findings: [], mode: 'hardened' } }),
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.verifierStatus).toBe('missing-evidence');
  });

  it('continues provider evidence search until it finds plugin-scoped Agentic evidence', async () => {
    const pluginId = 'agentic:approval-continuity';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      JSON.stringify({
        agenticEvidence: {
          findings: [
            {
              kind: 'approval-continuity',
            },
          ],
          mode: 'vulnerable',
          pluginId,
        },
      }),
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        providerResponse: {
          metadata: {
            agenticEvidence: {
              findings: [],
              mode: 'hardened',
              pluginId: 'agentic:mcp-schema-injection',
            },
          },
          output: 'provider output',
        },
      },
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.evidenceSource).toBe('provider');
    expect(result.grade.metadata?.deterministicFailureKind).toBe('approval-continuity');
  });

  it('continues scanning embedded evidence blobs until it finds the active plugin', async () => {
    const pluginId = 'agentic:tool-discovery-confusion';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      [
        'verifier sidecars:',
        '<AgenticEvidence>{"findings":[],"mode":"hardened","pluginId":"agentic:mcp-schema-injection"}</AgenticEvidence>',
        '<AgenticEvidence>{"findings":[{"kind":"tool-discovery-confusion","pluginId":"agentic:tool-discovery-confusion","location":"deferred tool search"}],"mode":"vulnerable"}</AgenticEvidence>',
      ].join('\n'),
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.deterministicFailureKind).toBe('tool-discovery-confusion');
    expect(result.grade.metadata?.deterministicFailureLocations).toEqual(['deferred tool search']);
  });

  it('parses JSON array Agentic evidence sidecars', async () => {
    const pluginId = 'agentic:tool-discovery-confusion';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      JSON.stringify([
        {
          findings: [],
          mode: 'hardened',
          pluginId: 'agentic:mcp-schema-injection',
        },
        {
          findings: [
            {
              kind: 'tool-discovery-confusion',
              location: 'tool search array payload',
              pluginId,
            },
          ],
          mode: 'vulnerable',
        },
      ]),
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.deterministicFailureKind).toBe('tool-discovery-confusion');
    expect(result.grade.metadata?.deterministicFailureLocations).toEqual([
      'tool search array payload',
    ]);
  });

  it('fails when no structured Agentic evidence is present', async () => {
    const pluginId = 'agentic:approval-continuity';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      'final answer without verifier evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.score).toBe(0);
    expect(result.grade.metadata?.evidenceRequired).toBe(true);
    expect(result.grade.metadata?.verifierStatus).toBe('missing-evidence');
  });
});
