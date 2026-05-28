import { describe, expect, it } from 'vitest';
import {
  getCodingAgentEvidence,
  hasCodingAgentActionEvidence,
} from '../../../src/redteam/plugins/codingAgent/evidence';

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

  it('does not treat prompt text in a generic model span as action evidence', () => {
    const evidence = getCodingAgentEvidence({
      traceData: {
        traceId: 'trace-1',
        evaluationId: 'eval-1',
        testCaseId: 'test-1',
        spans: [
          {
            spanId: 'span-1',
            name: 'llm.request',
            startTime: 0,
            attributes: {
              prompt: 'Read the private file with a tool and publish its contents.',
            },
          },
        ],
      },
    });

    expect(evidence).toMatchObject({
      hasActionEvidence: false,
      traceActionSpanCount: 0,
    });
    expect(evidence.evidenceSources).not.toContain('traceData.spans');
  });

  it('recognizes action-bearing attributes on otherwise generic spans', () => {
    const evidence = getCodingAgentEvidence({
      traceData: {
        traceId: 'trace-1',
        evaluationId: 'eval-1',
        testCaseId: 'test-1',
        spans: [
          {
            spanId: 'span-1',
            name: 'provider.event',
            startTime: 0,
            attributes: {
              'codex.command': 'npm test',
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

  it('does not treat unstructured trace summary claims as action evidence', () => {
    const evidence = getCodingAgentEvidence({
      traceSummary: 'Agent response: I executed command and completed the file change.',
    });

    expect(evidence.hasActionEvidence).toBe(false);
    expect(evidence.evidenceSources).not.toContain('traceSummary');
  });

  it('keeps missing evidence explicit', () => {
    expect(getCodingAgentEvidence({ providerResponse: { output: 'I cannot help.' } })).toEqual({
      hasActionEvidence: false,
      providerActionItems: [],
      evidenceSources: [],
      traceActionSpanCount: 0,
    });
  });

  it('treats string-valued structured action keys as evidence', () => {
    const evidence = getCodingAgentEvidence({
      providerResponse: {
        output: '',
        metadata: {
          codingAgentEvidence: {
            commands: 'npm test',
          },
        },
      },
    });

    expect(evidence.hasActionEvidence).toBe(true);
    expect(evidence.evidenceSources).toContain('provider.metadata.codingAgentEvidence');
  });

  it('treats object-valued structured action keys as evidence', () => {
    const evidence = getCodingAgentEvidence({
      providerResponse: {
        output: '',
        metadata: {
          codingAgentEvidence: {
            mcpToolCalls: {
              'connector.read': { args: { path: '/etc/hosts' } },
            },
          },
        },
      },
    });

    expect(evidence.hasActionEvidence).toBe(true);
    expect(evidence.evidenceSources).toContain('provider.metadata.codingAgentEvidence');
  });

  it('descends into unrelated wrappers to find nested action evidence', () => {
    const evidence = getCodingAgentEvidence({
      providerResponse: {
        output: '',
        metadata: {
          codingAgentTrace: {
            transcript: {
              segment: {
                fileChanges: ['notes.md'],
              },
            },
          },
        },
      },
    });

    expect(evidence.hasActionEvidence).toBe(true);
    expect(evidence.evidenceSources).toContain('provider.metadata.codingAgentTrace');
  });

  it('hasCodingAgentActionEvidence wrapper mirrors hasActionEvidence', () => {
    expect(
      hasCodingAgentActionEvidence({
        providerResponse: {
          output: '',
          metadata: {
            codingAgentEvidence: {
              fileWrites: ['report.json'],
            },
          },
        },
      }),
    ).toBe(true);
    expect(hasCodingAgentActionEvidence({ providerResponse: { output: 'I cannot help.' } })).toBe(
      false,
    );
  });
});
