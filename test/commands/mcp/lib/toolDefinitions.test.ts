import { describe, expect, it } from 'vitest';
import {
  generateToolDocs,
  TOOL_DEFINITIONS,
} from '../../../../src/commands/mcp/lib/toolDefinitions';

describe('MCP tool documentation', () => {
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

  describe('generateToolDocs', () => {
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
