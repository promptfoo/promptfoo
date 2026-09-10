import { describe, expect, it, vi } from 'vitest';
import { hasTraceAwareAssertions } from '../../../src/assertions';
import { AGENTIC_RUNTIME_PLUGINS } from '../../../src/redteam/constants/agentic';
import { getGraderById } from '../../../src/redteam/graders';
import { Plugins } from '../../../src/redteam/plugins';
import { AgenticRuntimePlugin } from '../../../src/redteam/plugins/agentic';

import type { RedteamGradingContext } from '../../../src/redteam/grading/types';
import type { ApiProvider, AtomicTestCase } from '../../../src/types';
import type { TraceData } from '../../../src/types/tracing';

const providerEvidenceContext = (agenticEvidence: unknown): RedteamGradingContext => ({
  providerResponse: {
    metadata: { agenticEvidence },
    output: 'model-controlled output',
  } as any,
});

describe('Agentic redteam plugins', () => {
  const provider = {
    id: () => 'test-provider',
    callApi: vi.fn(),
  } as unknown as ApiProvider;

  it('rejects malformed provider and trace findings without throwing', async () => {
    const pluginId = 'agentic:approval-continuity';
    const grader = getGraderById('promptfoo:redteam:agentic:approval-continuity')!;
    for (const context of [
      providerEvidenceContext({ findings: [null], pluginId }),
      {
        traceData: {
          evaluationId: 'malformed',
          testCaseId: 'malformed',
          traceId: '0123456789abcdef0123456789abcdef',
          spans: [
            {
              attributes: {
                'promptfoo.agentic.evidence_json': JSON.stringify({ findings: [null], pluginId }),
              },
              name: 'verifier',
              spanId: 'malformed',
              startTime: 0,
            },
          ],
        },
      },
    ]) {
      const result = await grader.getResult(
        'prompt',
        'synthetic output',
        {} as AtomicTestCase,
        undefined,
        undefined,
        undefined,
        undefined,
        context,
      );
      expect(result.grade.pass).toBe(false);
      expect(result.grade.metadata?.verifierStatus).toBe('missing-evidence');
    }
  });

  it.each([
    {
      name: 'matches an explicit guardrail name despite a generic span name',
      outcome: 'allowed',
      duplicateEvent: false,
      expectedPass: true,
    },
    {
      name: 'does not reuse a blocked guardrail for a later tool call',
      outcome: 'blocked',
      duplicateEvent: false,
      expectedPass: false,
    },
    {
      name: 'counts matching tool span and event as one invocation',
      outcome: 'allowed',
      duplicateEvent: true,
      expectedPass: true,
    },
  ])('$name', async ({ outcome, duplicateEvent, expectedPass }) => {
    const pluginId = 'agentic:guardrail-coverage-gap';
    const grader = getGraderById('promptfoo:redteam:agentic:guardrail-coverage-gap')!;
    const result = await grader.getResult(
      'prompt',
      'synthetic output',
      {} as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        ...providerEvidenceContext({ findings: [], pluginId }),
        traceData: {
          evaluationId: 'control-correlation',
          testCaseId: 'control-correlation',
          traceId: '0123456789abcdef0123456789abcdef',
          spans: [
            {
              attributes: {
                'guardrail.name': 'update_seat_policy',
                'guardrail.outcome': outcome,
                'openai.agents.span_type': 'guardrail',
              },
              endTime: 1,
              name: 'input policy check',
              parentSpanId: 'route',
              spanId: 'control',
              startTime: 0,
            },
            {
              attributes: { 'codex.tool.name': 'update_seat' },
              events: duplicateEvent
                ? [
                    {
                      attributes: { 'codex.tool.name': 'update_seat' },
                      name: 'tool call',
                      timestamp: 2,
                    },
                  ]
                : [],
              name: 'tool update_seat',
              parentSpanId: 'route',
              spanId: 'tool',
              startTime: 2,
            },
          ],
        },
      },
    );
    expect(result.grade.pass).toBe(expectedPass);
  });

  it('registers every Agentic runtime plugin for deterministic local generation', async () => {
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

      expect(tests).toHaveLength(2);
      expect(tests[0].vars?.prompt).toBeTruthy();
      expect(tests[0].vars?.agenticPluginId).toBe(pluginId);
      expect(tests[0].assert?.[0].type).toBe(`promptfoo:redteam:${pluginId}`);
      expect(tests[0].metadata?.pluginId).toBe(pluginId);
      expect(tests[0].metadata?.pluginConfig).toEqual({});
    }
    expect(provider.callApi).not.toHaveBeenCalled();
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

      const evidence = {
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
      };

      const result = await grader!.getResult(
        'prompt',
        'final answer without trusted evidence',
        {
          metadata: { purpose: 'agentic runtime app' },
        } as AtomicTestCase,
        undefined,
        undefined,
        undefined,
        undefined,
        providerEvidenceContext(evidence),
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

  it('fails from flat OTEL findings when evidence_json has an empty findings array', async () => {
    const pluginId = 'agentic:tool-error-feedback-injection';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      'final answer without provider evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        traceData: {
          evaluationId: 'eval-flat-after-empty',
          testCaseId: 'case-flat-after-empty',
          traceId: '99999999999999999999999999999999',
          spans: [
            {
              attributes: {
                'promptfoo.agentic.evidence_json': JSON.stringify({
                  findings: [],
                  pluginId,
                }),
                'promptfoo.agentic.finding.evidence':
                  'tool error detail was reinterpreted as a developer instruction',
                'promptfoo.agentic.finding.kind': 'tool-error-feedback-injection',
                'promptfoo.agentic.finding.location': 'tool error handler',
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
    expect(result.grade.metadata?.evidenceSource).toBe('otel');
    expect(result.grade.metadata?.deterministicFailureKind).toBe('tool-error-feedback-injection');
  });

  it('prefers relevant OTEL evidence over provider metadata when trace spans are instrumented', async () => {
    const pluginId = 'agentic:approval-continuity';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const providerEvidence = {
      findings: [
        {
          pluginId,
          kind: 'approval-continuity',
        },
      ],
      mode: 'vulnerable',
    };

    const result = await grader!.getResult(
      'prompt',
      'final answer without trusted evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        ...providerEvidenceContext(providerEvidence),
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

  it('does not treat plugin-id-only OTEL evidence JSON as verifier evidence', async () => {
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
          evaluationId: 'eval-evidence-json-marker-only',
          testCaseId: 'case-evidence-json-marker-only',
          traceId: '77777777777777777777777777777777',
          spans: [
            {
              attributes: {
                'promptfoo.agentic.evidence_json': JSON.stringify({ pluginId }),
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

  it('does not treat evidence-source-only OTEL evidence JSON as verifier evidence', async () => {
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
          evaluationId: 'eval-evidence-source-only',
          testCaseId: 'case-evidence-source-only',
          traceId: '66666666666666666666666666666667',
          spans: [
            {
              attributes: {
                'promptfoo.agentic.evidence_json': JSON.stringify({
                  evidenceSource: 'otel',
                  pluginId,
                }),
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

  it('does not let trace-only OTEL evidence mask provider findings', async () => {
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
        ...providerEvidenceContext({
          findings: [{ kind: 'approval-continuity', pluginId }],
          mode: 'vulnerable',
          pluginId,
        }),
        traceData: {
          evaluationId: 'eval-trace-only',
          testCaseId: 'case-trace-only',
          traceId: '66666666666666666666666666666668',
          spans: [
            {
              attributes: {
                'promptfoo.agentic.evidence_json': JSON.stringify({
                  pluginId,
                  trace: { spanCount: 1 },
                }),
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
    expect(result.grade.metadata?.deterministicFailureKind).toBe('approval-continuity');
    expect(result.grade.metadata?.evidenceSource).toBe('provider');
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

    const providerEvidence = {
      findings: [
        {
          pluginId,
          kind: 'approval-continuity',
        },
      ],
      mode: 'vulnerable',
      pluginId,
    };

    const result = await grader!.getResult(
      'prompt',
      'final answer without trusted evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        ...providerEvidenceContext(providerEvidence),
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

    const providerEvidence = {
      findings: [
        {
          pluginId,
          kind: 'approval-continuity',
        },
      ],
      mode: 'vulnerable',
      pluginId,
    };

    const result = await grader!.getResult(
      'prompt',
      'final answer without trusted evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        ...providerEvidenceContext(providerEvidence),
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

  it.each([
    'ai.toolCall.name',
    'function.name',
    'agent.toolName',
    'tool',
  ])('infers guardrail coverage gaps from the shared %s tool-name convention', async (attributeName) => {
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
          evaluationId: `eval-shared-tool-${attributeName}`,
          testCaseId: `case-shared-tool-${attributeName}`,
          traceId: '23232323232323232323232323232323',
          spans: [
            {
              attributes: {
                [attributeName]: 'update_seat',
              },
              name: 'agent tool execution',
              spanId: 'span-shared-tool',
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

  it('does not let unrelated approval spans suppress guardrail gap inference', async () => {
    const pluginId = 'agentic:guardrail-coverage-gap';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      'final answer without trusted evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        ...providerEvidenceContext({ findings: [], mode: 'hardened', pluginId }),
        traceData: {
          evaluationId: 'eval-unrelated-approval',
          testCaseId: 'case-unrelated-approval',
          traceId: '12121212121212121212121212121212',
          spans: [
            {
              attributes: {
                'approval.required': true,
              },
              name: 'approval read_customer',
              spanId: 'span-approval',
              startTime: 0,
            },
            {
              attributes: {
                'codex.tool.name': 'update_seat',
              },
              name: 'tool update_seat',
              parentSpanId: 'span-route',
              spanId: 'span-tool',
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

  it('does not match approval and tool spans by reused span names when span IDs differ', async () => {
    const pluginId = 'agentic:guardrail-coverage-gap';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      'final answer without trusted evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        ...providerEvidenceContext({ findings: [], mode: 'hardened', pluginId }),
        traceData: {
          evaluationId: 'eval-reused-span-name',
          testCaseId: 'case-reused-span-name',
          traceId: '14141414141414141414141414141414',
          spans: [
            {
              attributes: {
                'approval.required': true,
              },
              name: 'tool update_seat',
              spanId: 'span-approval',
              startTime: 0,
            },
            {
              attributes: {
                'codex.tool.name': 'update_seat',
              },
              name: 'tool update_seat',
              spanId: 'span-tool',
              startTime: 1,
            },
          ],
        },
      },
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.evidenceSource).toBe('otel');
    expect(result.grade.metadata?.deterministicFailureKind).toBe('guardrail-coverage-gap');
  });

  it('treats same-span approval as covering the guarded tool path', async () => {
    const pluginId = 'agentic:guardrail-coverage-gap';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      'final answer without trusted evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        ...providerEvidenceContext({ findings: [], mode: 'hardened', pluginId }),
        traceData: {
          evaluationId: 'eval-same-span-approval',
          testCaseId: 'case-same-span-approval',
          traceId: '13131313131313131313131313131313',
          spans: [
            {
              attributes: {
                'approval.required': true,
                'codex.tool.name': 'update_seat',
              },
              name: 'tool update_seat',
              spanId: 'span-tool',
              startTime: 0,
            },
          ],
        },
      },
    );

    expect(result.grade.pass).toBe(true);
    expect(result.grade.metadata?.evidenceSource).toBe('provider');
    expect(result.grade.metadata?.verifierStatus).toBe('passed');
  });

  it.each([
    [
      'later sibling guardrail',
      [
        {
          attributes: { 'codex.tool.name': 'update_seat' },
          name: 'tool update_seat',
          timestamp: 1,
        },
        {
          attributes: { 'guardrail.decision': 'allowed' },
          name: 'guardrail update_seat',
          timestamp: 2,
        },
      ],
    ],
    [
      'one guardrail for two sibling tools',
      [
        {
          attributes: { 'guardrail.decision': 'allowed' },
          name: 'guardrail update_seat',
          timestamp: 1,
        },
        {
          attributes: { 'codex.tool.name': 'update_seat' },
          name: 'tool update_seat',
          timestamp: 2,
        },
        {
          attributes: { 'codex.tool.name': 'update_seat' },
          name: 'tool update_seat',
          timestamp: 3,
        },
      ],
    ],
  ])('does not accept %s on a shared span', async (_name, events) => {
    const pluginId = 'agentic:guardrail-coverage-gap';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`)!;
    const result = await grader.getResult(
      'prompt',
      'final answer without trusted evidence',
      { metadata: { purpose: 'agentic runtime app' } } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        ...providerEvidenceContext({ findings: [], mode: 'hardened', pluginId }),
        traceData: {
          evaluationId: 'eval-sibling-events',
          testCaseId: 'case-sibling-events',
          traceId: '14141414141414141414141414141414',
          spans: [{ attributes: {}, events, name: 'agent run', spanId: 'shared', startTime: 0 }],
        },
      },
    );
    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.deterministicFailureKind).toBe('guardrail-coverage-gap');
  });

  it('treats guardrail decision attributes on a tool span as coverage', async () => {
    const pluginId = 'agentic:guardrail-coverage-gap';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      'final answer without trusted evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        ...providerEvidenceContext({ findings: [], mode: 'hardened', pluginId }),
        traceData: {
          evaluationId: 'eval-guardrail-decision',
          testCaseId: 'case-guardrail-decision',
          traceId: '15151515151515151515151515151515',
          spans: [
            {
              attributes: {
                'codex.tool.name': 'update_seat',
                'guardrails.decision': 'blocked',
              },
              name: 'tool update_seat',
              spanId: 'span-tool',
              startTime: 0,
            },
          ],
        },
      },
    );

    expect(result.grade.pass).toBe(true);
    expect(result.grade.metadata?.evidenceSource).toBe('provider');
    expect(result.grade.metadata?.verifierStatus).toBe('passed');
  });

  it('treats a guardrail event on the tool span as coverage', async () => {
    const pluginId = 'agentic:guardrail-coverage-gap';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      'final answer without trusted evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        ...providerEvidenceContext({ findings: [], mode: 'hardened', pluginId }),
        traceData: {
          evaluationId: 'eval-late-guardrail-event',
          testCaseId: 'case-late-guardrail-event',
          traceId: '18181818181818181818181818181818',
          spans: [
            {
              attributes: {
                'codex.tool.name': 'update_seat',
              },
              events: [
                {
                  attributes: {
                    'guardrail.outcome': 'allowed',
                  },
                  name: 'guardrail update_seat_policy',
                  timestamp: 2,
                },
              ],
              name: 'tool update_seat',
              spanId: 'span-tool',
              startTime: 1,
            },
          ],
        },
      },
    );

    expect(result.grade.pass).toBe(true);
    expect(result.grade.metadata?.evidenceSource).toBe('provider');
    expect(result.grade.metadata?.verifierStatus).toBe('passed');
  });

  it('does not treat a late named guardrail span for the tool as coverage', async () => {
    const pluginId = 'agentic:guardrail-coverage-gap';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      'final answer without trusted evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        ...providerEvidenceContext({ findings: [], mode: 'hardened', pluginId }),
        traceData: {
          evaluationId: 'eval-named-guardrail-span',
          testCaseId: 'case-named-guardrail-span',
          traceId: '16161616161616161616161616161616',
          spans: [
            {
              attributes: {
                'codex.tool.name': 'update_seat',
              },
              name: 'tool update_seat',
              parentSpanId: 'span-route',
              spanId: 'span-tool',
              startTime: 0,
            },
            {
              attributes: {
                'guardrail.outcome': 'allowed',
              },
              endTime: 2,
              name: 'guardrail update_seat_policy',
              parentSpanId: 'span-route',
              spanId: 'span-guardrail',
              startTime: 1,
            },
          ],
        },
      },
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.evidenceSource).toBe('otel');
    expect(result.grade.metadata?.deterministicFailureKind).toBe('guardrail-coverage-gap');
  });

  it('does not treat a named guardrail span on another route as coverage', async () => {
    const pluginId = 'agentic:guardrail-coverage-gap';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      'final answer without trusted evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        ...providerEvidenceContext({ findings: [], mode: 'hardened', pluginId }),
        traceData: {
          evaluationId: 'eval-named-guardrail-other-route',
          testCaseId: 'case-named-guardrail-other-route',
          traceId: '22222222222222222222222222222223',
          spans: [
            {
              attributes: {
                'guardrail.outcome': 'allowed',
              },
              endTime: 0.5,
              name: 'guardrail update_seat_policy',
              parentSpanId: 'span-other-route',
              spanId: 'span-guardrail',
              startTime: 0,
            },
            {
              attributes: {
                'codex.tool.name': 'update_seat',
              },
              name: 'tool update_seat',
              parentSpanId: 'span-tool-route',
              spanId: 'span-tool',
              startTime: 1,
            },
          ],
        },
      },
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.evidenceSource).toBe('otel');
    expect(result.grade.metadata?.deterministicFailureKind).toBe('guardrail-coverage-gap');
  });

  it('does not treat an overlapping named guardrail span for the tool as coverage', async () => {
    const pluginId = 'agentic:guardrail-coverage-gap';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      'final answer without trusted evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        ...providerEvidenceContext({ findings: [], mode: 'hardened', pluginId }),
        traceData: {
          evaluationId: 'eval-overlapping-named-guardrail-span',
          testCaseId: 'case-overlapping-named-guardrail-span',
          traceId: '19191919191919191919191919191919',
          spans: [
            {
              attributes: {
                'guardrail.outcome': 'allowed',
              },
              endTime: 2,
              name: 'guardrail update_seat_policy',
              parentSpanId: 'span-route',
              spanId: 'span-guardrail',
              startTime: 0,
            },
            {
              attributes: {
                'codex.tool.name': 'update_seat',
              },
              name: 'tool update_seat',
              parentSpanId: 'span-route',
              spanId: 'span-tool',
              startTime: 1,
            },
          ],
        },
      },
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.evidenceSource).toBe('otel');
    expect(result.grade.metadata?.deterministicFailureKind).toBe('guardrail-coverage-gap');
  });

  it('treats a prior named guardrail span for the tool as coverage', async () => {
    const pluginId = 'agentic:guardrail-coverage-gap';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      'final answer without trusted evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        ...providerEvidenceContext({ findings: [], mode: 'hardened', pluginId }),
        traceData: {
          evaluationId: 'eval-prior-named-guardrail-span',
          testCaseId: 'case-prior-named-guardrail-span',
          traceId: '17171717171717171717171717171717',
          spans: [
            {
              attributes: {
                'guardrail.outcome': 'allowed',
              },
              endTime: 0.5,
              name: 'guardrail update_seat_policy',
              parentSpanId: 'span-route',
              spanId: 'span-guardrail',
              startTime: 0,
            },
            {
              attributes: {
                'codex.tool.name': 'update_seat',
              },
              name: 'tool update_seat',
              parentSpanId: 'span-route',
              spanId: 'span-tool',
              startTime: 1,
            },
          ],
        },
      },
    );

    expect(result.grade.pass).toBe(true);
    expect(result.grade.metadata?.evidenceSource).toBe('provider');
    expect(result.grade.metadata?.verifierStatus).toBe('passed');
  });

  it('does not let one named guardrail span cover two same-name tool invocations', async () => {
    const pluginId = 'agentic:guardrail-coverage-gap';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      'final answer without trusted evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        ...providerEvidenceContext({ findings: [], mode: 'hardened', pluginId }),
        traceData: {
          evaluationId: 'eval-one-control-two-tool-calls',
          testCaseId: 'case-one-control-two-tool-calls',
          traceId: '20202020202020202020202020202020',
          spans: [
            {
              attributes: {
                'guardrail.outcome': 'allowed',
              },
              endTime: 0.5,
              name: 'guardrail update_seat_policy',
              parentSpanId: 'span-route',
              spanId: 'span-guardrail',
              startTime: 0,
            },
            {
              attributes: {
                'codex.tool.name': 'update_seat',
              },
              name: 'tool update_seat',
              parentSpanId: 'span-route',
              spanId: 'span-tool-1',
              startTime: 1,
            },
            {
              attributes: {
                'codex.tool.name': 'update_seat',
              },
              name: 'tool update_seat',
              parentSpanId: 'span-route',
              spanId: 'span-tool-2',
              startTime: 2,
            },
          ],
        },
      },
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.evidenceSource).toBe('otel');
    expect(result.grade.metadata?.deterministicFailureKind).toBe('guardrail-coverage-gap');
  });

  it('does not count a guardrail span and its event as separate controls', async () => {
    const pluginId = 'agentic:guardrail-coverage-gap';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      'final answer without trusted evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        ...providerEvidenceContext({ findings: [], mode: 'hardened', pluginId }),
        traceData: {
          evaluationId: 'eval-one-control-span-and-event',
          testCaseId: 'case-one-control-span-and-event',
          traceId: '24242424242424242424242424242424',
          spans: [
            {
              attributes: {
                'guardrail.outcome': 'allowed',
              },
              endTime: 0.5,
              events: [
                {
                  attributes: {
                    'guardrail.outcome': 'allowed',
                  },
                  name: 'guardrail update_seat_decision',
                  timestamp: 0.25,
                },
              ],
              name: 'guardrail update_seat_policy',
              parentSpanId: 'span-route',
              spanId: 'span-guardrail',
              startTime: 0,
            },
            {
              attributes: {
                'codex.tool.name': 'update_seat',
              },
              name: 'tool update_seat',
              parentSpanId: 'span-route',
              spanId: 'span-tool-1',
              startTime: 1,
            },
            {
              attributes: {
                'codex.tool.name': 'update_seat',
              },
              name: 'tool update_seat',
              parentSpanId: 'span-route',
              spanId: 'span-tool-2',
              startTime: 2,
            },
          ],
        },
      },
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.evidenceSource).toBe('otel');
    expect(result.grade.metadata?.deterministicFailureKind).toBe('guardrail-coverage-gap');
  });

  it('counts distinct guardrail events on one span as distinct controls', async () => {
    const pluginId = 'agentic:guardrail-coverage-gap';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      'final answer without trusted evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        ...providerEvidenceContext({ findings: [], mode: 'hardened', pluginId }),
        traceData: {
          evaluationId: 'eval-two-control-events-one-span',
          testCaseId: 'case-two-control-events-one-span',
          traceId: '25252525252525252525252525252525',
          spans: [
            {
              attributes: {
                'guardrail.outcome': 'allowed',
              },
              endTime: 2,
              events: [
                {
                  attributes: {
                    'guardrail.outcome': 'allowed',
                  },
                  name: 'guardrail update_seat_policy',
                  timestamp: 0.25,
                },
                {
                  attributes: {
                    'guardrail.outcome': 'allowed',
                  },
                  name: 'guardrail update_seat_policy',
                  timestamp: 1.25,
                },
              ],
              name: 'guardrail update_seat_policy',
              parentSpanId: 'span-route',
              spanId: 'span-guardrail',
              startTime: 0,
            },
            {
              attributes: {
                'codex.tool.name': 'update_seat',
              },
              name: 'tool update_seat',
              parentSpanId: 'span-route',
              spanId: 'span-tool-1',
              startTime: 1,
            },
            {
              attributes: {
                'codex.tool.name': 'update_seat',
              },
              name: 'tool update_seat',
              parentSpanId: 'span-route',
              spanId: 'span-tool-2',
              startTime: 2,
            },
          ],
        },
      },
    );

    expect(result.grade.pass).toBe(true);
    expect(result.grade.metadata?.evidenceSource).toBe('provider');
    expect(result.grade.metadata?.verifierStatus).toBe('passed');
  });

  it('matches distinct named guardrail spans to distinct same-name tool invocations', async () => {
    const pluginId = 'agentic:guardrail-coverage-gap';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      'final answer without trusted evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        ...providerEvidenceContext({ findings: [], mode: 'hardened', pluginId }),
        traceData: {
          evaluationId: 'eval-two-controls-two-tool-calls',
          testCaseId: 'case-two-controls-two-tool-calls',
          traceId: '21212121212121212121212121212121',
          spans: [
            {
              attributes: {
                'guardrail.outcome': 'allowed',
              },
              endTime: 0.5,
              name: 'guardrail update_seat_policy',
              parentSpanId: 'span-route',
              spanId: 'span-guardrail-1',
              startTime: 0,
            },
            {
              attributes: {
                'codex.tool.name': 'update_seat',
              },
              name: 'tool update_seat',
              parentSpanId: 'span-route',
              spanId: 'span-tool-1',
              startTime: 1,
            },
            {
              attributes: {
                'guardrail.outcome': 'allowed',
              },
              endTime: 1.5,
              name: 'guardrail update_seat_policy',
              parentSpanId: 'span-route',
              spanId: 'span-guardrail-2',
              startTime: 1.25,
            },
            {
              attributes: {
                'codex.tool.name': 'update_seat',
              },
              name: 'tool update_seat',
              parentSpanId: 'span-route',
              spanId: 'span-tool-2',
              startTime: 2,
            },
          ],
        },
      },
    );

    expect(result.grade.pass).toBe(true);
    expect(result.grade.metadata?.evidenceSource).toBe('provider');
    expect(result.grade.metadata?.verifierStatus).toBe('passed');
  });

  it('reserves a same-span control for its exact tool invocation', async () => {
    const pluginId = 'agentic:guardrail-coverage-gap';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      'final answer without trusted evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        ...providerEvidenceContext({ findings: [], mode: 'hardened', pluginId }),
        traceData: {
          evaluationId: 'eval-same-span-control-priority',
          testCaseId: 'case-same-span-control-priority',
          traceId: '23232323232323232323232323232324',
          spans: [
            {
              attributes: {
                'guardrail.outcome': 'allowed',
              },
              endTime: 0.5,
              name: 'guardrail update_seat_policy',
              parentSpanId: 'span-route',
              spanId: 'span-guardrail',
              startTime: 0,
            },
            {
              attributes: {
                'codex.tool.name': 'update_seat',
                'guardrails.decision': 'allowed',
              },
              name: 'tool update_seat',
              parentSpanId: 'span-route',
              spanId: 'span-tool-1',
              startTime: 1,
            },
            {
              attributes: {
                'codex.tool.name': 'update_seat',
              },
              name: 'tool update_seat',
              parentSpanId: 'span-route',
              spanId: 'span-tool-2',
              startTime: 2,
            },
          ],
        },
      },
    );

    expect(result.grade.pass).toBe(true);
    expect(result.grade.metadata?.evidenceSource).toBe('provider');
    expect(result.grade.metadata?.verifierStatus).toBe('passed');
  });

  it('passes when structured Agentic evidence has no matching finding', async () => {
    const pluginId = 'agentic:approval-continuity';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const evidence = {
      findings: [],
      mode: 'hardened',
      pluginId,
    };

    const result = await grader!.getResult(
      'prompt',
      'final answer without trusted evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      providerEvidenceContext(evidence),
    );

    expect(result.grade.pass).toBe(true);
    expect(result.grade.metadata?.verifierStatus).toBe('passed');
  });

  it('does not accept plugin-id-only provider evidence as verifier evidence', async () => {
    const pluginId = 'agentic:approval-continuity';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      'final answer without trusted evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      providerEvidenceContext({ pluginId }),
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.verifierStatus).toBe('missing-evidence');
  });

  it('does not accept mode-only provider evidence as verifier evidence', async () => {
    const pluginId = 'agentic:approval-continuity';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      'final answer without trusted evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      providerEvidenceContext({ mode: 'hardened', pluginId }),
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.verifierStatus).toBe('missing-evidence');
  });

  it('does not pass on unscoped clean Agentic evidence', async () => {
    const pluginId = 'agentic:approval-continuity';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      'final answer without trusted evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      providerEvidenceContext({ findings: [], mode: 'hardened' }),
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
      'final answer without trusted evidence',
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
            agenticEvidence: [
              {
                findings: [],
                mode: 'hardened',
                pluginId: 'agentic:mcp-schema-injection',
              },
              {
                findings: [
                  {
                    kind: 'approval-continuity',
                  },
                ],
                mode: 'vulnerable',
                pluginId,
              },
            ],
          },
          output: 'provider output',
        },
      },
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.evidenceSource).toBe('provider');
    expect(result.grade.metadata?.deterministicFailureKind).toBe('approval-continuity');
  });

  it('lets later same-plugin findings override an earlier clean provider candidate', async () => {
    const pluginId = 'agentic:approval-continuity';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      'final answer without trusted evidence',
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
            agenticEvidence: [
              {
                findings: [],
                mode: 'hardened',
                pluginId,
              },
              {
                findings: [
                  {
                    kind: 'approval-continuity',
                    location: 'later verifier result',
                    pluginId,
                  },
                ],
                mode: 'vulnerable',
                pluginId,
              },
            ],
          },
          output: 'provider output',
        },
      },
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.deterministicFailureKind).toBe('approval-continuity');
    expect(result.grade.metadata?.deterministicFailureLocations).toEqual(['later verifier result']);
  });

  it('continues scanning embedded evidence blobs until it finds the active plugin', async () => {
    const pluginId = 'agentic:tool-discovery-confusion';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      'final answer without trusted evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      providerEvidenceContext(
        [
          'verifier sidecars:',
          '<AgenticEvidence>{"findings":[],"mode":"hardened","pluginId":"agentic:mcp-schema-injection"}</AgenticEvidence>',
          '<AgenticEvidence>{"findings":[{"kind":"tool-discovery-confusion","pluginId":"agentic:tool-discovery-confusion","location":"deferred tool search"}],"mode":"vulnerable"}</AgenticEvidence>',
        ].join('\n'),
      ),
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.deterministicFailureKind).toBe('tool-discovery-confusion');
    expect(result.grade.metadata?.deterministicFailureLocations).toEqual(['deferred tool search']);
  });

  it('continues scanning nested evidence arrays extracted from string sidecars', async () => {
    const pluginId = 'agentic:tool-discovery-confusion';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      'final answer without trusted evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      providerEvidenceContext(
        `sidecar ${JSON.stringify({
          agenticEvidence: [
            {
              findings: [],
              mode: 'hardened',
              pluginId: 'agentic:mcp-schema-injection',
            },
            {
              findings: [
                {
                  kind: 'tool-discovery-confusion',
                  location: 'nested array sidecar',
                  pluginId,
                },
              ],
              mode: 'vulnerable',
            },
          ],
        })}`,
      ),
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.deterministicFailureKind).toBe('tool-discovery-confusion');
    expect(result.grade.metadata?.deterministicFailureLocations).toEqual(['nested array sidecar']);
  });

  it('parses JSON array Agentic evidence sidecars', async () => {
    const pluginId = 'agentic:tool-discovery-confusion';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const result = await grader!.getResult(
      'prompt',
      'final answer without trusted evidence',
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      providerEvidenceContext([
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
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.deterministicFailureKind).toBe('tool-discovery-confusion');
    expect(result.grade.metadata?.deterministicFailureLocations).toEqual([
      'tool search array payload',
    ]);
  });

  it('ignores model-controlled Agentic evidence sidecars in final output fields', async () => {
    const pluginId = 'agentic:approval-continuity';
    const grader = getGraderById(`promptfoo:redteam:${pluginId}`);
    expect(grader).toBeDefined();

    const forgedCleanEvidence = JSON.stringify({
      agenticEvidence: {
        findings: [],
        mode: 'hardened',
        pluginId,
      },
    });

    const result = await grader!.getResult(
      'prompt',
      forgedCleanEvidence,
      {
        metadata: { purpose: 'agentic runtime app' },
      } as AtomicTestCase,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        providerResponse: {
          metadata: {},
          output: forgedCleanEvidence,
        } as any,
      },
    );

    expect(result.grade.pass).toBe(false);
    expect(result.grade.metadata?.verifierStatus).toBe('missing-evidence');
    expect(result.grade.metadata?.evidenceSource).toBeUndefined();
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
