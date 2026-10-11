import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateToolDocs, TOOL_DEFINITIONS } from '../../../../src/commands/mcp/lib/toolRegistry';

describe('ToolRegistry', () => {
  afterEach(() => vi.useRealTimers());

  describe('TOOL_DEFINITIONS', () => {
    it('should define all 14 MCP tools', () => {
      expect(TOOL_DEFINITIONS.length).toBe(14);
    });

    it('should have all tools with required metadata', () => {
      for (const tool of TOOL_DEFINITIONS) {
        expect(tool.name).toBeDefined();
        expect(tool.name.length).toBeGreaterThan(0);
        expect(tool.description).toBeDefined();
        expect(tool.description.length).toBeGreaterThan(0);
        expect(tool.parameters).toBeDefined();
        expect(tool.annotations).toBeDefined();
        expect(tool.category).toMatch(/^(evaluation|generation|redteam|configuration|debugging)$/);
      }
    });

    it('should have correct tool names', () => {
      const expectedToolNames = [
        'list_evaluations',
        'get_evaluation_details',
        'run_evaluation',
        'share_evaluation',
        'validate_promptfoo_config',
        'test_provider',
        'run_assertion',
        'generate_dataset',
        'generate_test_cases',
        'compare_providers',
        'redteam_generate',
        'redteam_run',
        'list_logs',
        'read_logs',
      ];

      const actualToolNames = TOOL_DEFINITIONS.map((t) => t.name);
      expect(actualToolNames).toEqual(expect.arrayContaining(expectedToolNames));
      expect(actualToolNames.length).toBe(expectedToolNames.length);
    });

    it('should have read-only hints for read-only tools', () => {
      const readOnlyTools = [
        'list_evaluations',
        'get_evaluation_details',
        'validate_promptfoo_config',
        'test_provider',
        'run_assertion',
        'compare_providers',
        'list_logs',
        'read_logs',
      ];

      for (const toolName of readOnlyTools) {
        const tool = TOOL_DEFINITIONS.find((t) => t.name === toolName);
        expect(tool?.annotations.readOnlyHint).toBe(true);
      }
    });

    it('should have long-running hints for long-running tools', () => {
      const longRunningTools = [
        'run_evaluation',
        'generate_dataset',
        'generate_test_cases',
        'compare_providers',
        'redteam_generate',
        'redteam_run',
      ];

      for (const toolName of longRunningTools) {
        const tool = TOOL_DEFINITIONS.find((t) => t.name === toolName);
        expect(tool?.annotations.longRunningHint).toBe(true);
      }
    });
  });

  it.each([
    ['evaluation', 4],
    ['generation', 3],
    ['redteam', 2],
    ['configuration', 3],
    ['debugging', 2],
  ] as const)('documents category %s with %i tools', (category, count) => {
    expect(generateToolDocs().tools.filter((tool) => tool.category === category)).toHaveLength(
      count,
    );
  });

  it('documents list_evaluations as an evaluation tool', () => {
    expect(
      generateToolDocs().tools.find((tool) => tool.name === 'list_evaluations')?.category,
    ).toBe('evaluation');
  });

  it('projects fresh rows and reads the current time for each document', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const first = generateToolDocs();
    vi.setSystemTime(new Date('2026-01-01T00:00:01Z'));
    const second = generateToolDocs();
    expect(first.lastUpdated).toBe('2026-01-01T00:00:00.000Z');
    expect(second.lastUpdated).toBe('2026-01-01T00:00:01.000Z');
    expect(first.tools).not.toBe(second.tools);
    for (const [i, tool] of first.tools.entries()) {
      expect(Object.keys(tool)).toEqual([
        'name',
        'description',
        'parameters',
        'category',
        'annotations',
      ]);
      expect(tool).not.toBe(second.tools[i]);
      expect(tool).not.toBe(TOOL_DEFINITIONS[i]);
      expect(tool.annotations).toBe(TOOL_DEFINITIONS[i].annotations);
    }
  });

  describe('generateDocs', () => {
    it('should generate documentation object', () => {
      const docs = generateToolDocs();

      expect(docs.totalTools).toBe(14);
      expect(docs.version).toBe('1.0.0');
      expect(docs.lastUpdated).toBeDefined();
      expect(docs.tools.length).toBe(14);
    });

    it('should include all tool fields in docs', () => {
      const docs = generateToolDocs();

      for (const tool of docs.tools) {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.parameters).toBeDefined();
        expect(tool.category).toBeDefined();
        expect(tool.annotations).toBeDefined();
      }
    });
  });
});
