import { describe, expect, it } from 'vitest';
import {
  findingsFromObservations,
  observationsFromGradingContext,
} from '../../../src/redteam/agentic/observations';

import type { RedteamGradingContext } from '../../../src/redteam/grading/types';

describe('agentic run observations', () => {
  it('normalizes final output, provider raw Codex items, trace spans, and Agentic Runtime findings', () => {
    const gradingContext: RedteamGradingContext = {
      providerResponse: {
        output: 'provider summary',
        raw: JSON.stringify({
          finalResponse: 'raw final message',
          items: [
            {
              aggregatedOutput: 'command output marker',
              command: 'cat ../outside/.receipt',
              type: 'commandExecution',
            },
            {
              server: 'github',
              tool: 'create_issue',
              type: 'mcpToolCall',
              arguments: { title: 'diagnostic' },
              output: 'created issue',
            },
            {
              changes: [{ path: 'src/example.ts' }],
              type: 'fileChange',
            },
          ],
        }),
      },
      traceData: {
        evaluationId: 'eval-1',
        testCaseId: 'case-1',
        traceId: 'trace-1',
        spans: [
          {
            attributes: {
              'codex.command': 'npm test',
              'codex.mcp.tool': 'lookup_customer',
              'codex.output': 'failing test output',
              'codex.message': 'I fixed the test',
            },
            name: 'exec npm',
            spanId: 'span-1',
            startTime: 1,
          },
          {
            attributes: {
              'promptfoo.agent_sdk.finding.evidence': 'guardrail missed side effect',
              'promptfoo.agent_sdk.finding.kind': 'guardrail-coverage-gap',
              'promptfoo.agent_sdk.finding.location': 'tool update_seat',
              'promptfoo.agent_sdk.plugin_id': 'agentic:guardrail-coverage-gap',
            },
            name: 'agentic finding',
            spanId: 'span-2',
            startTime: 2,
          },
        ],
      },
    };

    const observations = observationsFromGradingContext({
      gradingContext,
      llmOutput: 'final response',
    });

    expect(observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'message', source: 'final', text: 'final response' }),
        expect.objectContaining({
          command: 'cat ../outside/.receipt',
          kind: 'command',
          output: 'command output marker',
          source: 'provider-raw',
        }),
        expect.objectContaining({
          connector: 'github',
          kind: 'connector_call',
          operation: 'create_issue',
        }),
        expect.objectContaining({
          kind: 'file_write',
          path: 'src/example.ts',
        }),
        expect.objectContaining({
          command: 'npm test',
          kind: 'command',
          source: 'trace',
        }),
        expect.objectContaining({
          kind: 'tool_call',
          source: 'trace',
          tool: 'lookup_customer',
        }),
        expect.objectContaining({
          kind: 'finding',
          pluginId: 'agentic:guardrail-coverage-gap',
        }),
      ]),
    );

    expect(findingsFromObservations(observations)).toEqual([
      expect.objectContaining({
        evidence: 'guardrail missed side effect',
        kind: 'guardrail-coverage-gap',
        pluginId: 'agentic:guardrail-coverage-gap',
      }),
    ]);
  });

  it('does not treat clean Agentic Runtime trace markers as findings', () => {
    const observations = observationsFromGradingContext({
      gradingContext: {
        traceData: {
          evaluationId: 'eval-clean-marker',
          testCaseId: 'case-clean-marker',
          traceId: 'trace-clean-marker',
          spans: [
            {
              attributes: {
                'promptfoo.agent_sdk.plugin_id': 'agentic:approval-continuity',
                'promptfoo.agent_sdk.status': 'passed',
              },
              name: 'agentic verifier marker',
              spanId: 'span-clean',
              startTime: 1,
            },
          ],
        },
      },
    });

    expect(findingsFromObservations(observations)).toEqual([]);
  });

  it('normalizes singular and plural guardrail decision attributes as control evidence', () => {
    const observations = observationsFromGradingContext({
      gradingContext: {
        traceData: {
          evaluationId: 'eval-guardrail-decisions',
          testCaseId: 'case-guardrail-decisions',
          traceId: 'trace-guardrail-decisions',
          spans: [
            {
              attributes: { 'guardrails.decision': 'blocked' },
              name: 'tool update_seat',
              spanId: 'span-plural',
              startTime: 1,
            },
            {
              attributes: { 'guardrail.decision': 'allowed' },
              name: 'tool read_customer',
              spanId: 'span-singular',
              startTime: 2,
            },
          ],
        },
      },
    });

    expect(observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'guardrail',
          outcome: 'blocked',
          spanId: 'span-plural',
        }),
        expect.objectContaining({
          kind: 'guardrail',
          outcome: 'allowed',
          spanId: 'span-singular',
        }),
      ]),
    );
  });

  it('continues scanning embedded trace evidence blobs until it finds findings', () => {
    const observations = observationsFromGradingContext({
      gradingContext: {
        traceData: {
          evaluationId: 'eval-mixed-evidence',
          testCaseId: 'case-mixed-evidence',
          traceId: 'trace-mixed-evidence',
          spans: [
            {
              attributes: {
                agenticEvidence: [
                  '<AgenticEvidence>{"findings":[],"pluginId":"agentic:mcp-schema-injection"}</AgenticEvidence>',
                  '<AgenticEvidence>{"findings":[{"evidence":"loaded hidden tool","kind":"tool-discovery-confusion","pluginId":"agentic:tool-discovery-confusion"}]}</AgenticEvidence>',
                ].join('\n'),
              },
              name: 'agentic verifier marker',
              spanId: 'span-mixed',
              startTime: 1,
            },
          ],
        },
      },
    });

    expect(findingsFromObservations(observations)).toEqual([
      expect.objectContaining({
        evidence: 'loaded hidden tool',
        kind: 'tool-discovery-confusion',
        pluginId: 'agentic:tool-discovery-confusion',
      }),
    ]);
  });

  it('parses JSON array trace evidence payloads', () => {
    const observations = observationsFromGradingContext({
      gradingContext: {
        traceData: {
          evaluationId: 'eval-array-evidence',
          testCaseId: 'case-array-evidence',
          traceId: 'trace-array-evidence',
          spans: [
            {
              attributes: {
                agenticEvidence: JSON.stringify([
                  {
                    findings: [],
                    pluginId: 'agentic:mcp-schema-injection',
                  },
                  {
                    findings: [
                      {
                        evidence: 'loaded hidden tool from array payload',
                        kind: 'tool-discovery-confusion',
                        pluginId: 'agentic:tool-discovery-confusion',
                      },
                    ],
                  },
                ]),
              },
              name: 'agentic verifier marker',
              spanId: 'span-array',
              startTime: 1,
            },
          ],
        },
      },
    });

    expect(findingsFromObservations(observations)).toEqual([
      expect.objectContaining({
        evidence: 'loaded hidden tool from array payload',
        kind: 'tool-discovery-confusion',
        pluginId: 'agentic:tool-discovery-confusion',
      }),
    ]);
  });

  it('falls back to flat finding attributes after empty evidence_json findings', () => {
    const observations = observationsFromGradingContext({
      gradingContext: {
        traceData: {
          evaluationId: 'eval-flat-after-empty',
          testCaseId: 'case-flat-after-empty',
          traceId: 'trace-flat-after-empty',
          spans: [
            {
              attributes: {
                'promptfoo.agentic.evidence_json': JSON.stringify({
                  findings: [],
                  pluginId: 'agentic:tool-error-feedback-injection',
                }),
                'promptfoo.agentic.finding.evidence':
                  'tool error detail was reinterpreted as a developer instruction',
                'promptfoo.agentic.finding.kind': 'tool-error-feedback-injection',
                'promptfoo.agentic.finding.location': 'tool error handler',
                'promptfoo.agentic.plugin_id': 'agentic:tool-error-feedback-injection',
              },
              name: 'agentic verifier marker',
              spanId: 'span-flat',
              startTime: 1,
            },
          ],
        },
      },
    });

    expect(findingsFromObservations(observations)).toEqual([
      expect.objectContaining({
        evidence: 'tool error detail was reinterpreted as a developer instruction',
        kind: 'tool-error-feedback-injection',
        pluginId: 'agentic:tool-error-feedback-injection',
      }),
    ]);
  });
});
