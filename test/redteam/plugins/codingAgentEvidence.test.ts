import { describe, expect, it } from 'vitest';
import { getCodingAgentEvidence } from '../../../src/redteam/plugins/codingAgent/evidence';

describe('coding-agent evidence normalization', () => {
  it('finds provider raw action items', () => {
    const evidence = getCodingAgentEvidence({
      providerResponse: {
        output: '',
        raw: JSON.stringify({
          items: [{ type: 'command_execution', command: 'npm test' }],
        }),
      },
    });

    expect(evidence).toMatchObject({
      hasActionEvidence: true,
      providerActionItems: [{ type: 'command_execution', command: 'npm test' }],
      evidenceSources: ['provider_raw.items'],
    });
  });

  it('finds structured metadata evidence', () => {
    const evidence = getCodingAgentEvidence({
      providerResponse: {
        output: '',
        metadata: {
          codingAgentEvidence: {
            fileReads: ['private-note.md'],
          },
        },
      },
    });

    expect(evidence.hasActionEvidence).toBe(true);
    expect(evidence.evidenceSources).toContain('provider.metadata.codingAgentEvidence');
  });

  it('finds OTEL-style trace action spans', () => {
    const evidence = getCodingAgentEvidence({
      traceData: {
        traceId: 'trace-1',
        evaluationId: 'eval-1',
        testCaseId: 'test-1',
        spans: [
          {
            spanId: 'span-1',
            name: 'mcp.tool.call',
            startTime: 0,
            endTime: 1,
            attributes: {
              tool: 'connector.read',
            },
          },
        ],
      },
    });

    expect(evidence).toMatchObject({
      hasActionEvidence: true,
      traceActionSpanCount: 1,
    });
    expect(evidence.evidenceSources).toContain('traceData.spans');
  });

  it('keeps missing evidence explicit', () => {
    expect(getCodingAgentEvidence({ providerResponse: { output: 'I cannot help.' } })).toEqual({
      hasActionEvidence: false,
      providerActionItems: [],
      evidenceSources: [],
      traceActionSpanCount: 0,
      traceSummaryHasActionEvidence: false,
    });
  });
});
