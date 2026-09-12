import { describe, expect, it } from 'vitest';
import {
  getCodingAgentEvidence,
  hasCodingAgentActionEvidence,
} from '../../../src/redteam/plugins/codingAgent/evidence';

describe('coding-agent evidence normalization', () => {
  it.each(['actions', 'approvals'])('does not credit status text in %s', (key) => {
    for (const value of ['pending', 'none', 'not_started', 'blocked by policy']) {
      for (const child of [value, [value]]) {
        expect(
          getCodingAgentEvidence({
            providerResponse: { metadata: { codingAgentEvidence: { [key]: child } } },
          }).hasActionEvidence,
        ).toBe(false);
      }
    }
  });

  it.each([
    'command_execution',
    'file_change',
    'mcp_tool_call',
    'tool',
    'tool_call',
    'function_call',
    'dynamic_tool_call',
  ])('does not credit an empty %s record in raw or structured evidence', (type) => {
    for (const providerResponse of [
      { raw: { items: [{ type }] } },
      { metadata: { codingAgentEvidence: { actions: [{ type }] } } },
    ]) {
      expect(getCodingAgentEvidence({ providerResponse }).hasActionEvidence).toBe(false);
    }
  });

  it.each([
    { type: 'command_execution', command: 'npm test' },
    { type: 'file_change', path: 'report.json' },
    { type: 'file_change', changes: [{ path: 'report.json', kind: 'add' }] },
    { type: 'dynamic_tool_call', tool: 'write_report' },
  ])('retains populated action records: $type', (item) => {
    expect(
      getCodingAgentEvidence({ providerResponse: { raw: { items: [item] } } }).hasActionEvidence,
    ).toBe(true);
  });

  it.each([{ status: 'pending' }, { count: 1 }, { type: '' }, { command: ' ' }, { path: '' }])(
    'rejects untyped records without an action payload: %j',
    (item) => {
      for (const child of [item, [item]]) {
        expect(
          getCodingAgentEvidence({
            providerResponse: {
              metadata: {
                codingAgentEvidence: { actions: child },
              },
            },
          }).hasActionEvidence,
        ).toBe(false);
      }
    },
  );

  it.each([
    { command: 'npm test' },
    { path: 'result.md' },
    { tool: 'read_file' },
    { connector: 'gmail', operation: 'createDraft' },
    { url: 'https://example.test' },
  ])('retains untyped action payloads: %j', (item) => {
    expect(
      getCodingAgentEvidence({
        providerResponse: {
          metadata: {
            codingAgentEvidence: { actions: [item] },
          },
        },
      }).hasActionEvidence,
    ).toBe(true);
  });

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
      evidenceSources: ['provider_raw.actions'],
    });
  });

  it('finds top-level provider raw action arrays', () => {
    const evidence = getCodingAgentEvidence({
      providerResponse: { raw: [{ type: 'command_execution', command: 'npm test' }] },
    });

    expect(evidence.providerActionItems).toHaveLength(1);
    expect(evidence.evidenceSources).toContain('provider_raw.actions');
  });

  it('finds Responses API output action items', () => {
    const evidence = getCodingAgentEvidence({
      providerResponse: {
        raw: JSON.stringify({
          output: [{ type: 'function_call', name: 'read_file', arguments: '{}' }],
        }),
      },
    });

    expect(evidence.providerActionItems).toHaveLength(1);
    expect(evidence.evidenceSources).toContain('provider_raw.actions');
  });

  it('finds Codex dynamic tool calls', () => {
    const evidence = getCodingAgentEvidence({
      providerResponse: {
        raw: JSON.stringify({ items: [{ type: 'dynamic_tool_call', tool: 'create_issue' }] }),
      },
    });

    expect(evidence.providerActionItems).toHaveLength(1);
  });

  it('finds OpenCode parts and Claude tool metadata', () => {
    const openCode = getCodingAgentEvidence({
      providerResponse: {
        output: '',
        raw: JSON.stringify({ data: { parts: [{ type: 'tool', tool: 'bash' }] } }),
      },
    });
    const claude = getCodingAgentEvidence({
      providerResponse: {
        output: '',
        metadata: { toolCalls: [{ name: 'Write', input: { path: 'result.md' } }] },
      },
    });

    expect(openCode.providerActionItems).toEqual([{ type: 'tool', tool: 'bash' }]);
    expect(openCode.evidenceSources).toContain('provider_raw.actions');
    expect(claude.evidenceSources).toContain('provider.metadata.toolCalls');
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
    expect(evidence.providerActionItems).toContainEqual({ fileReads: ['private-note.md'] });
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

  it('recognizes standard OTEL tool attributes', () => {
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
            attributes: { 'gen_ai.tool.name': 'Write' },
          },
        ],
      },
    });

    expect(evidence.traceActionSpanCount).toBe(1);
  });

  it('uses adaptive traceContext spans without trusting trace metadata vars', () => {
    const evidence = getCodingAgentEvidence({
      traceContext: {
        metadata: { vars: { commands: ['pretend action'] } },
        spans: [
          {
            spanId: 'span-1',
            name: 'tool write_file',
            startTime: 0,
            attributes: {},
          },
        ],
      } as any,
      traceData: { traceId: 'trace-1', evaluationId: 'eval-1', testCaseId: 'test-1', spans: [] },
    });

    expect(evidence.traceActionSpanCount).toBe(1);
    expect(evidence.evidenceSources).not.toContain('traceData.metadata');
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
