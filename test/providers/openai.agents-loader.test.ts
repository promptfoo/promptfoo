import { jest } from '@jest/globals';
import type { Agent } from '@openai/agents';
import {
  loadAgentDefinition,
  loadTools,
  loadHandoffs,
} from '../../src/providers/openai/agents-loader';

// Mock dependencies
jest.mock('../../src/esm', () => ({
  importModule: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  default: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../src/cliState', () => ({
  default: {
    basePath: '/test/base/path',
  },
}));

describe('agents-loader', () => {
  const { importModule } = require('../../src/esm');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('loadAgentDefinition', () => {
    it('should return Agent instance as-is', async () => {
      const mockAgent = {
        name: 'Test Agent',
        instructions: 'Test instructions',
      } as Agent<any, any>;

      const result = await loadAgentDefinition(mockAgent);

      expect(result).toBe(mockAgent);
      expect(importModule).not.toHaveBeenCalled();
    });

    it('should load agent from file path', async () => {
      const mockAgent = {
        name: 'File Agent',
        instructions: 'Loaded from file',
      } as Agent<any, any>;

      importModule.mockResolvedValue({ default: mockAgent });

      const result = await loadAgentDefinition('file://./agents/test-agent.ts');

      expect(result).toEqual(mockAgent);
      expect(importModule).toHaveBeenCalledWith(
        expect.stringContaining('agents/test-agent.ts'),
      );
    });

    it('should load agent from module export', async () => {
      const mockAgent = {
        name: 'Module Agent',
        instructions: 'From module',
      } as Agent<any, any>;

      importModule.mockResolvedValue(mockAgent);

      const result = await loadAgentDefinition('file://./agents/test-agent.ts');

      expect(result).toEqual(mockAgent);
    });

    it('should create agent from inline definition', async () => {
      const mockAgentClass = jest.fn().mockImplementation((config) => config);
      jest.doMock('@openai/agents', () => ({
        Agent: mockAgentClass,
      }));

      const agentDef = {
        name: 'Inline Agent',
        instructions: 'Test instructions',
        model: 'gpt-4o-mini',
      };

      const result = await loadAgentDefinition(agentDef);

      expect(result).toMatchObject({
        name: 'Inline Agent',
        instructions: 'Test instructions',
        model: 'gpt-4o-mini',
      });
    });

    it('should throw error for invalid configuration', async () => {
      await expect(loadAgentDefinition(123 as any)).rejects.toThrow(
        'Invalid agent configuration',
      );
    });

    it('should throw error if file does not export Agent', async () => {
      importModule.mockResolvedValue({ default: { notAnAgent: true } });

      await expect(loadAgentDefinition('file://./invalid.ts')).rejects.toThrow(
        'does not export an Agent instance',
      );
    });

    it('should handle absolute file paths', async () => {
      const mockAgent = {
        name: 'Absolute Path Agent',
        instructions: 'Test',
      } as Agent<any, any>;

      importModule.mockResolvedValue({ default: mockAgent });

      const result = await loadAgentDefinition('file:///absolute/path/agent.ts');

      expect(result).toEqual(mockAgent);
      expect(importModule).toHaveBeenCalledWith('/absolute/path/agent.ts');
    });

    it('should resolve relative paths from basePath', async () => {
      const mockAgent = {
        name: 'Relative Agent',
        instructions: 'Test',
      } as Agent<any, any>;

      importModule.mockResolvedValue({ default: mockAgent });

      await loadAgentDefinition('file://./relative/agent.ts');

      expect(importModule).toHaveBeenCalledWith(
        expect.stringContaining('test/base/path'),
      );
    });
  });

  describe('loadTools', () => {
    it('should return undefined if no tools config provided', async () => {
      const result = await loadTools(undefined);
      expect(result).toBeUndefined();
    });

    it('should return inline tool array as-is', async () => {
      const tools = [
        { name: 'tool1', description: 'Test tool', parameters: {}, execute: async () => {} },
      ];

      const result = await loadTools(tools);

      expect(result).toBe(tools);
      expect(importModule).not.toHaveBeenCalled();
    });

    it('should load tools from file path', async () => {
      const mockTools = [
        { name: 'tool1', description: 'Tool from file', parameters: {}, execute: async () => {} },
        { name: 'tool2', description: 'Another tool', parameters: {}, execute: async () => {} },
      ];

      importModule.mockResolvedValue({ default: mockTools });

      const result = await loadTools('file://./tools/tools.ts');

      expect(result).toEqual(mockTools);
      expect(importModule).toHaveBeenCalledWith(expect.stringContaining('tools/tools.ts'));
    });

    it('should load tools from module export', async () => {
      const mockTools = [
        { name: 'tool1', description: 'Tool', parameters: {}, execute: async () => {} },
      ];

      importModule.mockResolvedValue(mockTools);

      const result = await loadTools('file://./tools.ts');

      expect(result).toEqual(mockTools);
    });

    it('should throw error if file does not export array', async () => {
      importModule.mockResolvedValue({ default: { notAnArray: true } });

      await expect(loadTools('file://./invalid.ts')).rejects.toThrow(
        'does not export an array of tools',
      );
    });

    it('should throw error for invalid configuration', async () => {
      await expect(loadTools('not-a-file-path' as any)).rejects.toThrow(
        'Invalid tools configuration',
      );
    });
  });

  describe('loadHandoffs', () => {
    it('should return undefined if no handoffs config provided', async () => {
      const result = await loadHandoffs(undefined);
      expect(result).toBeUndefined();
    });

    it('should return inline handoff array as-is', async () => {
      const handoffs = [
        {
          agent: { name: 'Agent', instructions: 'Test' } as Agent<any, any>,
          description: 'Handoff to agent',
        },
      ];

      const result = await loadHandoffs(handoffs);

      expect(result).toBe(handoffs);
      expect(importModule).not.toHaveBeenCalled();
    });

    it('should load handoffs from file path', async () => {
      const mockHandoffs = [
        {
          agent: { name: 'Agent1', instructions: 'Test' } as Agent<any, any>,
          description: 'First handoff',
        },
      ];

      importModule.mockResolvedValue({ default: mockHandoffs });

      const result = await loadHandoffs('file://./handoffs/handoffs.ts');

      expect(result).toEqual(mockHandoffs);
      expect(importModule).toHaveBeenCalledWith(expect.stringContaining('handoffs/handoffs.ts'));
    });

    it('should throw error if file does not export array', async () => {
      importModule.mockResolvedValue({ default: 'not-an-array' });

      await expect(loadHandoffs('file://./invalid.ts')).rejects.toThrow(
        'does not export an array of handoffs',
      );
    });

    it('should throw error for invalid configuration', async () => {
      await expect(loadHandoffs(123 as any)).rejects.toThrow(
        'Invalid handoffs configuration',
      );
    });
  });
});
