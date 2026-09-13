import { describe, expect, it } from 'vitest';
import { getGraderById } from '../../../src/redteam/graders';

import type { RedteamGradingContext } from '../../../src/redteam/grading/types';
import type { TraceData } from '../../../src/types/tracing';

const active = 'agentic:approval-continuity';
const other = 'agentic:tool-discovery-confusion';

function grade(
  spans: TraceData['spans'],
  evidence: unknown = { pluginId: active, findings: [] },
  pluginId = active,
) {
  return getGraderById(`promptfoo:redteam:${pluginId}`)!.getResult(
    'Inspect the run.',
    'Done.',
    {},
    undefined,
    undefined,
    undefined,
    undefined,
    {
      providerResponse: { output: 'Done.', metadata: { agenticEvidence: evidence } },
      traceData: { traceId: 'boundary', evaluationId: 'eval', testCaseId: 'case', spans },
    } as RedteamGradingContext,
  );
}

describe('Agentic evidence boundaries', () => {
  it.each([
    ['agentic.plugin_id', 'agentic.pluginId', 'agentic.evidence_json'],
    ['agent.sdk.plugin_id', 'agentSdk.pluginId', 'agent.sdk.evidence_json'],
  ])(
    'preserves enclosing scope with mixed valid and malformed %s aliases',
    async (id, alias, json) => {
      for (const inherited of [active, other]) {
        const result = await grade([
          {
            spanId: 'verifier',
            name: 'verifier',
            startTime: 1,
            attributes: { [id]: inherited },
            events: [
              {
                name: 'verifier result',
                timestamp: 2,
                attributes: {
                  [id]: 42,
                  [alias]: other,
                  [json]: JSON.stringify({ findings: [{ kind: 'approval-bypass' }] }),
                },
              },
            ],
          },
        ]);
        expect(result.grade.pass).toBe(inherited !== active);
        if (inherited === active) {
          expect(result.grade.metadata?.verifierStatus).toBe('failed');
        }
      }
    },
  );

  it.each(['provider', 'span', 'event'])(
    'retains malformed %s evidence beside a clean verifier',
    async (source) => {
      const cleanOther = JSON.stringify({ pluginId: other, findings: [] });
      for (const malformed of [
        `[broken, ${cleanOther}]`,
        `<AgenticEvidence>] ${cleanOther}</AgenticEvidence>`,
        `<AgenticEvidence>junk ${cleanOther}</AgenticEvidence>`,
        `<AgenticEvidence>${cleanOther} "unterminated</AgenticEvidence>`,
        `<AgenticEvidence>${cleanOther} }</AgenticEvidence>`,
        [null, { findings: [] }],
      ]) {
        for (const pluginId of [active, other]) {
          const envelope = { pluginId, agenticEvidence: malformed };
          const attributes = {
            'agentic.plugin_id': pluginId,
            'agentic.evidence_json': JSON.stringify(malformed),
          };
          const result = await grade(
            source === 'provider'
              ? []
              : [
                  {
                    spanId: 'verifier',
                    name: 'verifier',
                    startTime: 1,
                    statusCode: 1,
                    attributes: source === 'span' ? attributes : {},
                    events:
                      source === 'event' ? [{ name: 'result', timestamp: 2, attributes }] : [],
                  },
                ],
            source === 'provider' ? [{ pluginId: active, findings: [] }, envelope] : undefined,
          );
          expect(result.grade.pass, `${pluginId}: ${JSON.stringify(malformed)}`).toBe(
            pluginId !== active,
          );
          if (pluginId === active) {
            expect(result.grade.metadata?.verifierStatus).toBe('failed');
          }
        }
      }
    },
  );

  it.each(['guardrail', 'approval'])(
    'keeps enclosing call scope when a %s event has an invalid call ID',
    async (kind) => {
      const pluginId = 'agentic:guardrail-coverage-gap';
      for (const callId of [undefined, null, 42, false, '', '   ', 'call-a']) {
        const result = await grade(
          [
            {
              spanId: 'agent',
              name: 'agent',
              startTime: 1,
              endTime: 4,
              attributes: { 'gen_ai.tool.call.id': 'call-b' },
              events: [
                {
                  name: `${kind} update_seat`,
                  timestamp: 2,
                  attributes: { [`${kind}.outcome`]: 'allowed', 'gen_ai.tool.call.id': callId },
                },
                {
                  name: 'tool update_seat',
                  timestamp: 3,
                  attributes: { 'tool.name': 'update_seat', 'gen_ai.tool.call.id': 'call-a' },
                },
              ],
            },
          ],
          { pluginId, findings: [] },
          pluginId,
        );
        expect(result.grade.pass, JSON.stringify(callId)).toBe(callId === 'call-a');
      }
    },
  );

  it.each(['guardrail', 'approval'])(
    'requires a same-span %s event to precede tool execution',
    async (kind) => {
      const pluginId = 'agentic:guardrail-coverage-gap';
      for (const timestamp of [0, 1, 2, 3]) {
        const result = await grade(
          [
            {
              spanId: 'tool',
              name: 'tool update_seat',
              startTime: 2,
              endTime: 4,
              attributes: { 'tool.name': 'update_seat' },
              events: [
                {
                  name: `${kind} update_seat`,
                  timestamp,
                  attributes: { [`${kind}.outcome`]: 'allowed' },
                },
              ],
            },
          ],
          { pluginId, findings: [] },
          pluginId,
        );
        expect(result.grade.pass, String(timestamp)).toBe(timestamp === 1);
      }
    },
  );
});
