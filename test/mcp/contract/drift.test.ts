import { describe, expect, it } from 'vitest';
import {
  buildServerContract,
  canonicalizeValue,
  compareContracts,
  formatConsoleReport,
  formatMarkdownReport,
  normalizeJsonSchema,
  normalizeTool,
  runContractDriftGate,
} from '../../../src/mcp/contract';
import type { McpToolDefinition } from '../../../src/mcp/contract/types';

describe('MCP Contract Normalizer & Deterministic Fingerprinting', () => {
  it('produces identical fingerprints regardless of JSON Schema key order', () => {
    const schemaA = {
      type: 'object',
      properties: {
        b: { type: 'string' },
        a: { type: 'number' },
      },
      required: ['b', 'a'],
    };

    const schemaB = {
      required: ['a', 'b'],
      properties: {
        a: { type: 'number' },
        b: { type: 'string' },
      },
      type: 'object',
    };

    const normA = normalizeJsonSchema(schemaA);
    const normB = normalizeJsonSchema(schemaB);

    expect(JSON.stringify(normA)).toBe(JSON.stringify(normB));
  });

  it('sorts enum values deterministically', () => {
    const schema1 = { enum: ['zebra', 'apple', 'mango'] };
    const schema2 = { enum: ['mango', 'zebra', 'apple'] };

    const norm1 = normalizeJsonSchema(schema1);
    const norm2 = normalizeJsonSchema(schema2);

    expect(norm1.enum).toEqual(['apple', 'mango', 'zebra']);
    expect(norm1.enum).toEqual(norm2.enum);
  });

  it('generates consistent SHA-256 fingerprint for identical tool definitions', () => {
    const toolA: McpToolDefinition = {
      name: 'query_database',
      description: 'Executes SQL query',
      inputSchema: {
        type: 'object',
        properties: {
          sql: { type: 'string' },
          timeoutMs: { type: 'number' },
        },
        required: ['sql'],
      },
    };

    const toolB: McpToolDefinition = {
      name: 'query_database',
      description: 'Executes SQL query',
      inputSchema: {
        required: ['sql'],
        properties: {
          timeoutMs: { type: 'number' },
          sql: { type: 'string' },
        },
        type: 'object',
      },
    };

    const contractA = normalizeTool(toolA);
    const contractB = normalizeTool(toolB);

    expect(contractA.schemaFingerprint).toBe(contractB.schemaFingerprint);
    expect(contractA.fullFingerprint).toBe(contractB.fullFingerprint);
  });
});

describe('MCP Tool Contract Drift Detection & Classification', () => {
  const baseTools: McpToolDefinition[] = [
    {
      name: 'search_docs',
      description: 'Searches knowledge base for documents',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number', minimum: 1, maximum: 50 },
          filter: { type: 'string', enum: ['code', 'guide', 'api'] },
        },
        required: ['query'],
      },
    },
    {
      name: 'fetch_url',
      description: 'Fetches content from an HTTP URL',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', minLength: 5 },
        },
        required: ['url'],
      },
    },
  ];

  it('classifies exact match as IDENTICAL with 0 changes', () => {
    const base = buildServerContract('test-server', baseTools);
    const current = buildServerContract('test-server', baseTools);

    const diff = compareContracts(base, current);
    expect(diff.status).toBe('IDENTICAL');
    expect(diff.hasBreakingChanges).toBe(false);
    expect(diff.totalChanges).toBe(0);
    expect(diff.breakingCount).toBe(0);
  });

  it('detects BREAKING change when a tool is removed', () => {
    const base = buildServerContract('test-server', baseTools);
    const currentTools = [baseTools[0]]; // removed fetch_url
    const current = buildServerContract('test-server', currentTools);

    const diff = compareContracts(base, current);
    expect(diff.status).toBe('BREAKING');
    expect(diff.hasBreakingChanges).toBe(true);
    expect(diff.changes.some((c) => c.code === 'TOOL_REMOVED' && c.toolName === 'fetch_url')).toBe(
      true,
    );
  });

  it('detects NON_BREAKING change when a new tool is added', () => {
    const base = buildServerContract('test-server', baseTools);
    const newTool: McpToolDefinition = {
      name: 'summarize_text',
      description: 'Summarizes long markdown',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
        },
        required: ['text'],
      },
    };
    const current = buildServerContract('test-server', [...baseTools, newTool]);

    const diff = compareContracts(base, current);
    expect(diff.status).toBe('NON_BREAKING');
    expect(diff.hasBreakingChanges).toBe(false);
    expect(
      diff.changes.some((c) => c.code === 'TOOL_ADDED' && c.toolName === 'summarize_text'),
    ).toBe(true);
  });

  it('detects BREAKING change when a new REQUIRED property is added to an existing tool', () => {
    const base = buildServerContract('test-server', baseTools);
    const modifiedTools: McpToolDefinition[] = [
      {
        name: 'search_docs',
        description: 'Searches knowledge base for documents',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'number' },
            apiKey: { type: 'string' }, // New required property!
          },
          required: ['query', 'apiKey'],
        },
      },
      baseTools[1],
    ];
    const current = buildServerContract('test-server', modifiedTools);

    const diff = compareContracts(base, current);
    expect(diff.status).toBe('BREAKING');
    expect(diff.hasBreakingChanges).toBe(true);
    const breakingChange = diff.changes.find((c) => c.code === 'REQUIRED_PROPERTY_ADDED');
    expect(breakingChange).toBeDefined();
    expect(breakingChange?.toolName).toBe('search_docs');
    expect(breakingChange?.message).toContain('apiKey');
  });

  it('detects NON_BREAKING change when an OPTIONAL property is added', () => {
    const base = buildServerContract('test-server', baseTools);
    const modifiedTools: McpToolDefinition[] = [
      {
        name: 'search_docs',
        description: 'Searches knowledge base for documents',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'number' },
            filter: { type: 'string', enum: ['code', 'guide', 'api'] },
            author: { type: 'string' }, // Optional!
          },
          required: ['query'],
        },
      },
      baseTools[1],
    ];
    const current = buildServerContract('test-server', modifiedTools);

    const diff = compareContracts(base, current);
    expect(diff.status).toBe('NON_BREAKING');
    expect(diff.hasBreakingChanges).toBe(false);
    expect(diff.changes.some((c) => c.code === 'OPTIONAL_PROPERTY_ADDED')).toBe(true);
  });

  it('detects BREAKING change when input parameter type mutates (e.g. number to string)', () => {
    const base = buildServerContract('test-server', baseTools);
    const modifiedTools: McpToolDefinition[] = [
      {
        name: 'search_docs',
        description: 'Searches knowledge base for documents',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'string' }, // Changed from number to string!
            filter: { type: 'string', enum: ['code', 'guide', 'api'] },
          },
          required: ['query'],
        },
      },
      baseTools[1],
    ];
    const current = buildServerContract('test-server', modifiedTools);

    const diff = compareContracts(base, current);
    expect(diff.status).toBe('BREAKING');
    expect(diff.changes.some((c) => c.code === 'PROPERTY_TYPE_CHANGED')).toBe(true);
  });

  it('detects BREAKING change when enum values are restricted (removed)', () => {
    const base = buildServerContract('test-server', baseTools);
    const modifiedTools: McpToolDefinition[] = [
      {
        name: 'search_docs',
        description: 'Searches knowledge base for documents',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            filter: { type: 'string', enum: ['code', 'guide'] }, // 'api' was removed!
          },
          required: ['query'],
        },
      },
      baseTools[1],
    ];
    const current = buildServerContract('test-server', modifiedTools);

    const diff = compareContracts(base, current);
    expect(diff.status).toBe('BREAKING');
    expect(diff.changes.some((c) => c.code === 'ENUM_RESTRICTED')).toBe(true);
  });

  it('detects NON_BREAKING change when enum values are expanded', () => {
    const base = buildServerContract('test-server', baseTools);
    const modifiedTools: McpToolDefinition[] = [
      {
        name: 'search_docs',
        description: 'Searches knowledge base for documents',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            filter: { type: 'string', enum: ['code', 'guide', 'api', 'tutorial'] }, // 'tutorial' added!
          },
          required: ['query'],
        },
      },
      baseTools[1],
    ];
    const current = buildServerContract('test-server', modifiedTools);

    const diff = compareContracts(base, current);
    expect(diff.status).toBe('NON_BREAKING');
    expect(diff.changes.some((c) => c.code === 'ENUM_EXPANDED')).toBe(true);
  });

  it('detects DESCRIPTION_ONLY changes when only documentation text is updated', () => {
    const base = buildServerContract('test-server', baseTools);
    const modifiedTools: McpToolDefinition[] = [
      {
        ...baseTools[0],
        description: 'Updated comprehensive documentation search',
      },
      baseTools[1],
    ];
    const current = buildServerContract('test-server', modifiedTools);

    const diff = compareContracts(base, current);
    expect(diff.status).toBe('DESCRIPTION_ONLY');
    expect(diff.hasBreakingChanges).toBe(false);
    expect(diff.changes.some((c) => c.code === 'DESCRIPTION_CHANGED')).toBe(true);
  });

  it('detects heuristic tool rename when parameter overlap is high', () => {
    const base = buildServerContract('test-server', [baseTools[0]]);
    const renamedTool: McpToolDefinition = {
      name: 'search_documentation_v2', // renamed from search_docs
      description: 'Searches knowledge base for documents',
      inputSchema: baseTools[0].inputSchema,
    };
    const current = buildServerContract('test-server', [renamedTool]);

    const diff = compareContracts(base, current);
    expect(diff.status).toBe('BREAKING');
    expect(diff.changes.some((c) => c.code === 'TOOL_RENAMED')).toBe(true);
  });

  it('handles empty tool lists gracefully without errors', () => {
    const emptyBase = buildServerContract('empty-server', []);
    const emptyCurrent = buildServerContract('empty-server', []);

    const diff = compareContracts(emptyBase, emptyCurrent);
    expect(diff.status).toBe('IDENTICAL');
    expect(emptyBase.toolCount).toBe(0);
    expect(diff.totalChanges).toBe(0);

    // Transition from empty to populated server
    const populated = buildServerContract('empty-server', baseTools);
    const diffAdd = compareContracts(emptyBase, populated);
    expect(diffAdd.status).toBe('NON_BREAKING');
    expect(diffAdd.hasBreakingChanges).toBe(false);
    expect(diffAdd.changes.filter((c) => c.code === 'TOOL_ADDED').length).toBe(2);

    // Transition from populated to empty server
    const diffRemove = compareContracts(populated, emptyBase);
    expect(diffRemove.status).toBe('BREAKING');
    expect(diffRemove.hasBreakingChanges).toBe(true);
    expect(diffRemove.changes.filter((c) => c.code === 'TOOL_REMOVED').length).toBe(2);
  });

  it('handles malformed or sparse schemas safely without crashing', () => {
    const sparseTool: McpToolDefinition = {
      name: 'sparse_tool',
      // inputSchema omitted or minimal
      inputSchema: {} as any,
    };
    const contract = normalizeTool(sparseTool);
    expect(contract.name).toBe('sparse_tool');
    expect(contract.schemaFingerprint).toBeDefined();

    const malformedTools: McpToolDefinition[] = [
      {
        name: 'null_schema_tool',
        inputSchema: null as any,
      },
      {
        name: 'undefined_properties_tool',
        inputSchema: { type: 'object', properties: undefined } as any,
      },
    ];

    const serverContract = buildServerContract('sparse-server', malformedTools);
    expect(serverContract.toolCount).toBe(2);
    expect(serverContract.overallFingerprint).toBeDefined();

    const diff = compareContracts(serverContract, serverContract);
    expect(diff.status).toBe('IDENTICAL');
  });
});

describe('CI Regression Gate & Reporting', () => {
  const baseTools: McpToolDefinition[] = [
    {
      name: 'ping',
      description: 'Healthcheck ping',
      inputSchema: { type: 'object' },
    },
  ];

  it('fails CI gate with exitCode 1 when breaking changes are detected', () => {
    const base = buildServerContract('service-x', baseTools);
    const brokenTools: McpToolDefinition[] = [
      {
        name: 'ping',
        description: 'Healthcheck ping',
        inputSchema: {
          type: 'object',
          properties: { authNonce: { type: 'string' } },
          required: ['authNonce'],
        },
      },
    ];
    const current = buildServerContract('service-x', brokenTools);

    const result = runContractDriftGate(base, current);
    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.reportMarkdown).toContain('BREAKING DRIFT');
    expect(result.reportConsole).toContain('[FAIL-BREAKING]');
  });

  it('passes CI gate when allowBreakingChanges flag is set', () => {
    const base = buildServerContract('service-x', baseTools);
    const brokenTools: McpToolDefinition[] = [];
    const current = buildServerContract('service-x', brokenTools);

    const result = runContractDriftGate(base, current, { allowBreakingChanges: true });
    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it('passes CI gate with exitCode 0 when changes are compatible', () => {
    const base = buildServerContract('service-x', baseTools);
    const enhancedTools: McpToolDefinition[] = [
      baseTools[0],
      {
        name: 'status',
        description: 'Get cluster status',
        inputSchema: { type: 'object' },
      },
    ];
    const current = buildServerContract('service-x', enhancedTools);

    const result = runContractDriftGate(base, current);
    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
  });
});

