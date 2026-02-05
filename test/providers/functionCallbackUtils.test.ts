import path from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importModule } from '../../src/esm';
import logger from '../../src/logger';
import { FunctionCallbackHandler } from '../../src/providers/functionCallbackUtils';
import { isJavascriptFile } from '../../src/util/fileExtensions';

import type { FunctionCallbackConfig } from '../../src/providers/functionCallbackTypes';

// Mock dependencies
vi.mock('../../src/cliState', () => ({ default: { basePath: '/test/basePath' } }));
vi.mock('../../src/esm', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    importModule: vi.fn(),
  };
});
vi.mock('../../src/logger', () => ({
  default: { debug: vi.fn() },
}));
vi.mock('../../src/util/fileExtensions', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    isJavascriptFile: vi.fn().mockReturnValue(true),
  };
});

const mockImportModule = vi.mocked(importModule);
const mockLogger = vi.mocked(logger);
vi.mocked(isJavascriptFile);

describe('FunctionCallbackHandler', () => {
  let handler: FunctionCallbackHandler;

  beforeEach(() => {
    handler = new FunctionCallbackHandler();
    vi.clearAllMocks();
  });

  describe('processCall', () => {
    it('should return stringified call when no callback is available', async () => {
      const call = { name: 'testFunction', arguments: '{"param": "value"}' };
      const result = await handler.processCall(call, {});

      expect(result).toEqual({
        output: JSON.stringify(call),
        isError: false,
      });
    });

    it('should return stringified call when callbacks config is undefined', async () => {
      const call = { name: 'testFunction', arguments: '{"param": "value"}' };
      const result = await handler.processCall(call);

      expect(result).toEqual({
        output: JSON.stringify(call),
        isError: false,
      });
    });

    it('should return string call as-is when no callback available', async () => {
      const call = 'some string call';
      const result = await handler.processCall(call, {});

      expect(result).toEqual({
        output: call,
        isError: false,
      });
    });

    it('should execute function callback successfully', async () => {
      const mockCallback = vi.fn().mockResolvedValue('callback result');
      const callbacks: FunctionCallbackConfig = {
        testFunction: mockCallback,
      };
      const call = { name: 'testFunction', arguments: '{"param": "value"}' };

      const result = await handler.processCall(call, callbacks);

      expect(result).toEqual({
        output: 'callback result',
        isError: false,
      });
      expect(mockCallback).toHaveBeenCalledWith('{"param": "value"}', undefined);
    });

    it('should pass context to callback', async () => {
      const mockCallback = vi.fn().mockResolvedValue('callback result');
      const callbacks: FunctionCallbackConfig = {
        testFunction: mockCallback,
      };
      const call = { name: 'testFunction', arguments: '{"param": "value"}' };
      const context = { threadId: 'thread-123', runId: 'run-456' };

      const result = await handler.processCall(call, callbacks, context);

      expect(result).toEqual({
        output: 'callback result',
        isError: false,
      });
      expect(mockCallback).toHaveBeenCalledWith('{"param": "value"}', context);
    });

    it('should handle tool call format', async () => {
      const mockCallback = vi.fn().mockResolvedValue('tool result');
      const callbacks: FunctionCallbackConfig = {
        testTool: mockCallback,
      };
      const call = {
        type: 'function',
        function: {
          name: 'testTool',
          arguments: '{"toolParam": "toolValue"}',
        },
      };

      const result = await handler.processCall(call, callbacks);

      expect(result).toEqual({
        output: 'tool result',
        isError: false,
      });
      expect(mockCallback).toHaveBeenCalledWith('{"toolParam": "toolValue"}', undefined);
    });

    it('should stringify non-string callback results', async () => {
      const mockCallback = vi.fn().mockResolvedValue({ result: 'object' });
      const callbacks: FunctionCallbackConfig = {
        testFunction: mockCallback,
      };
      const call = { name: 'testFunction', arguments: '{}' };

      const result = await handler.processCall(call, callbacks);

      expect(result).toEqual({
        output: '{"result":"object"}',
        isError: false,
      });
    });

    it('should return original call on callback error', async () => {
      const mockCallback = vi.fn().mockRejectedValue(new Error('Callback failed'));
      const callbacks: FunctionCallbackConfig = {
        testFunction: mockCallback,
      };
      const call = { name: 'testFunction', arguments: '{"param": "value"}' };

      const result = await handler.processCall(call, callbacks);

      expect(result).toEqual({
        output: JSON.stringify(call),
        isError: true,
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Function callback failed for testFunction: Error: Callback failed',
      );
    });

    it('should handle calls with no function information', async () => {
      const callbacks: FunctionCallbackConfig = {
        testFunction: vi.fn() as any,
      };
      const call = { notAFunction: true };

      const result = await handler.processCall(call, callbacks);

      expect(result).toEqual({
        output: JSON.stringify(call),
        isError: false,
      });
    });
  });

  describe('processCalls', () => {
    it('should return null/undefined calls as-is', async () => {
      expect(await handler.processCalls(null)).toBeNull();
      expect(await handler.processCalls(undefined)).toBeUndefined();
    });

    it('should process single call and return output directly', async () => {
      const mockCallback = vi.fn().mockResolvedValue('single result');
      const callbacks: FunctionCallbackConfig = {
        testFunction: mockCallback,
      };
      const call = { name: 'testFunction', arguments: '{}' };

      const result = await handler.processCalls(call, callbacks);

      expect(result).toBe('single result');
    });

    it('should process array of calls and join string results', async () => {
      const mockCallback1 = vi.fn().mockResolvedValue('result1');
      const mockCallback2 = vi.fn().mockResolvedValue('result2');
      const callbacks: FunctionCallbackConfig = {
        func1: mockCallback1,
        func2: mockCallback2,
      };
      const calls = [
        { name: 'func1', arguments: '{}' },
        { name: 'func2', arguments: '{}' },
      ];

      const result = await handler.processCalls(calls, callbacks);

      expect(result).toBe('result1\nresult2');
    });

    it('should return output array when results are not all strings', async () => {
      const mockCallback1 = vi.fn().mockResolvedValue('string result');
      const mockCallback2 = vi.fn().mockResolvedValue({ object: 'result' });
      const callbacks: FunctionCallbackConfig = {
        func1: mockCallback1,
        func2: mockCallback2,
      };
      const calls = [
        { name: 'func1', arguments: '{}' },
        { name: 'func2', arguments: '{}' },
      ];

      const result = await handler.processCalls(calls, callbacks);

      // The second callback returns an object, which gets stringified, so both are strings
      // and should be joined with newlines
      expect(result).toBe('string result\n{"object":"result"}');
    });

    it('should return original calls when no callbacks succeed', async () => {
      const callbacks: FunctionCallbackConfig = {};
      const calls = [
        { name: 'unknownFunc1', arguments: '{}' },
        { name: 'unknownFunc2', arguments: '{}' },
      ];

      const result = await handler.processCalls(calls, callbacks);

      expect(result).toEqual(calls);
    });

    it('should return stringified single call when no callback succeeds', async () => {
      const callbacks: FunctionCallbackConfig = {};
      const call = { name: 'unknownFunc', arguments: '{}' };

      const result = await handler.processCalls(call, callbacks);

      expect(result).toBe(JSON.stringify(call));
    });
  });

  describe('executeCallback', () => {
    it('should cache and reuse loaded callbacks', async () => {
      const mockCallback = vi.fn().mockResolvedValue('cached result');
      const callbacks: FunctionCallbackConfig = {
        testFunction: mockCallback,
      };

      // Call multiple times
      await handler.processCall({ name: 'testFunction', arguments: '{}' }, callbacks);
      await handler.processCall({ name: 'testFunction', arguments: '{}' }, callbacks);

      expect(mockCallback).toHaveBeenCalledTimes(2);
    });

    it('should load external file-based callbacks', async () => {
      const mockExternalFunction = vi.fn().mockResolvedValue('external result');
      mockImportModule.mockResolvedValue({ default: mockExternalFunction });

      const callbacks: FunctionCallbackConfig = {
        testFunction: 'file://path/to/function.js',
      };
      const call = { name: 'testFunction', arguments: '{"param": "value"}' };

      const result = await handler.processCall(call, callbacks);

      expect(result).toEqual({
        output: 'external result',
        isError: false,
      });
      expect(mockImportModule).toHaveBeenCalledWith(
        path.resolve('/test/basePath', 'path/to/function.js'),
      );
      expect(mockExternalFunction).toHaveBeenCalledWith('{"param": "value"}', undefined);
    });

    it('should load specific function from external file', async () => {
      const mockSpecificFunction = vi.fn().mockResolvedValue('specific result');
      const mockModule = {
        default: vi.fn(),
        specificFunction: mockSpecificFunction,
      };
      mockImportModule.mockResolvedValue(mockModule);

      const callbacks: FunctionCallbackConfig = {
        testFunction: 'file://path/to/functions.js:specificFunction',
      };
      const call = { name: 'testFunction', arguments: '{}' };

      const result = await handler.processCall(call, callbacks);

      expect(result).toEqual({
        output: 'specific result',
        isError: false,
      });
      expect(mockSpecificFunction).toHaveBeenCalledWith('{}', undefined);
    });

    it('should handle inline function strings', async () => {
      const callbacks: FunctionCallbackConfig = {
        testFunction: '() => "inline result"',
      };
      const call = { name: 'testFunction', arguments: '{}' };

      const result = await handler.processCall(call, callbacks);

      expect(result).toEqual({
        output: 'inline result',
        isError: false,
      });
    });

    it('should throw error for invalid callback configuration', async () => {
      const callbacks: FunctionCallbackConfig = {
        testFunction: 123 as any, // Invalid callback type
      };
      const call = { name: 'testFunction', arguments: '{}' };

      const result = await handler.processCall(call, callbacks);

      expect(result.isError).toBe(true);
      expect(result.output).toBe(JSON.stringify(call));
    });

    it('should handle errors when loading external functions', async () => {
      mockImportModule.mockRejectedValue(new Error('Module not found'));

      const callbacks: FunctionCallbackConfig = {
        testFunction: 'file://nonexistent/function.js',
      };
      const call = { name: 'testFunction', arguments: '{}' };

      const result = await handler.processCall(call, callbacks);

      expect(result.isError).toBe(true);
      expect(result.output).toBe(JSON.stringify(call));
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Function callback failed for testFunction'),
      );
    });

    it('should handle non-function exports from external files', async () => {
      mockImportModule.mockResolvedValue({ default: 'not a function' });

      const callbacks: FunctionCallbackConfig = {
        testFunction: 'file://path/to/invalid.js',
      };
      const call = { name: 'testFunction', arguments: '{}' };

      const result = await handler.processCall(call, callbacks);

      expect(result.isError).toBe(true);
      expect(result.output).toBe(JSON.stringify(call));
    });
  });

  describe('clearCache', () => {
    it('should clear cached callbacks', async () => {
      const mockCallback = vi.fn().mockResolvedValue('result');
      const callbacks: FunctionCallbackConfig = {
        testFunction: mockCallback,
      };

      // Load callback into cache
      await handler.processCall({ name: 'testFunction', arguments: '{}' }, callbacks);

      // Clear cache
      handler.clearCache();

      // Mock a different implementation
      const newMockCallback = vi.fn().mockResolvedValue('new result');
      const newCallbacks: FunctionCallbackConfig = {
        testFunction: newMockCallback,
      };

      // This should use the new callback, not the cached one
      const result = await handler.processCall(
        { name: 'testFunction', arguments: '{}' },
        newCallbacks,
      );

      expect(result.output).toBe('new result');
      expect(newMockCallback).toHaveBeenCalled();
    });
  });

  describe('extractFunctionInfo', () => {
    it('should extract info from direct function call format', async () => {
      const call = { name: 'testFunc', arguments: '{"key": "value"}' };
      const result = await handler.processCall(call, {});

      // Should return stringified since no callback available
      expect(result.output).toBe(JSON.stringify(call));
    });

    it('should extract info from tool call format', async () => {
      const call = {
        type: 'function',
        function: {
          name: 'testTool',
          arguments: '{"key": "value"}',
        },
      };
      const result = await handler.processCall(call, {});

      // Should return stringified since no callback available
      expect(result.output).toBe(JSON.stringify(call));
    });

    it('should return null for invalid call formats', async () => {
      const invalidCalls = [null, undefined, 'string', 123, { invalidFormat: true }];

      for (const call of invalidCalls) {
        const result = await handler.processCall(call, {});
        if (typeof call === 'string') {
          expect(result.output).toBe(call);
        } else {
          expect(result.output).toBe(JSON.stringify(call));
        }
      }
    });
  });

  describe('MCP Integration', () => {
    let mockMCPClient: {
      getAllTools: ReturnType<typeof vi.fn>;
      callTool: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockMCPClient = {
        getAllTools: vi.fn(),
        callTool: vi.fn(),
      };
      handler = new FunctionCallbackHandler(mockMCPClient as any);
    });

    it('should execute MCP tool when tool name matches available MCP tools', async () => {
      mockMCPClient.getAllTools.mockReturnValue([
        { name: 'list_resources', description: 'List available resources' },
        { name: 'get_resource', description: 'Get specific resource' },
      ]);
      mockMCPClient.callTool.mockResolvedValue({
        content: 'Resource list: [file1.txt, file2.txt]',
      });

      const call = { name: 'list_resources', arguments: '{}' };
      const result = await handler.processCall(call, {});

      expect(mockMCPClient.callTool).toHaveBeenCalledWith('list_resources', {});
      expect(result).toEqual({
        output: 'MCP Tool Result (list_resources): Resource list: [file1.txt, file2.txt]',
        isError: false,
      });
    });

    it('should handle MCP tool errors gracefully', async () => {
      mockMCPClient.getAllTools.mockReturnValue([
        { name: 'failing_tool', description: 'A tool that fails' },
      ]);
      mockMCPClient.callTool.mockResolvedValue({
        content: '',
        error: 'Tool execution failed: Invalid arguments',
      });

      const call = { name: 'failing_tool', arguments: '{"invalid": true}' };
      const result = await handler.processCall(call, {});

      expect(result).toEqual({
        output: 'MCP Tool Error (failing_tool): Tool execution failed: Invalid arguments',
        isError: true,
      });
    });

    it('should handle MCP client exceptions', async () => {
      mockMCPClient.getAllTools.mockReturnValue([
        { name: 'error_tool', description: 'A tool that throws' },
      ]);
      mockMCPClient.callTool.mockRejectedValue(new Error('Connection lost'));

      const call = { name: 'error_tool', arguments: '{}' };
      const result = await handler.processCall(call, {});

      expect(result).toEqual({
        output: 'MCP Tool Error (error_tool): Connection lost',
        isError: true,
      });
    });

    it('should handle invalid JSON arguments in MCP tools', async () => {
      mockMCPClient.getAllTools.mockReturnValue([
        { name: 'json_tool', description: 'A tool requiring JSON args' },
      ]);

      const call = { name: 'json_tool', arguments: 'invalid-json' };
      const result = await handler.processCall(call, {});

      expect(result.isError).toBe(true);
      expect(result.output).toContain('MCP Tool Error (json_tool)');
    });

    it('should fall back to function callbacks when tool is not an MCP tool', async () => {
      mockMCPClient.getAllTools.mockReturnValue([{ name: 'mcp_tool', description: 'An MCP tool' }]);

      const callbacks: FunctionCallbackConfig = {
        regular_function: async (_args: string) => 'callback result',
      };
      const call = { name: 'regular_function', arguments: '{}' };
      const result = await handler.processCall(call, callbacks);

      expect(mockMCPClient.callTool).not.toHaveBeenCalled();
      expect(result).toEqual({
        output: 'callback result',
        isError: false,
      });
    });

    it('should prioritize MCP tools over function callbacks when both exist', async () => {
      mockMCPClient.getAllTools.mockReturnValue([
        { name: 'shared_name', description: 'MCP tool with same name as callback' },
      ]);
      mockMCPClient.callTool.mockResolvedValue({
        content: 'MCP tool result',
      });

      const callbacks: FunctionCallbackConfig = {
        shared_name: async (_args: string) => 'callback result',
      };
      const call = { name: 'shared_name', arguments: '{}' };
      const result = await handler.processCall(call, callbacks);

      expect(mockMCPClient.callTool).toHaveBeenCalledWith('shared_name', {});
      expect(result).toEqual({
        output: 'MCP Tool Result (shared_name): MCP tool result',
        isError: false,
      });
    });

    it('should work without MCP client (backwards compatibility)', async () => {
      const handlerWithoutMCP = new FunctionCallbackHandler();
      const callbacks: FunctionCallbackConfig = {
        test_function: async (_args: string) => 'no MCP result',
      };
      const call = { name: 'test_function', arguments: '{}' };
      const result = await handlerWithoutMCP.processCall(call, callbacks);

      expect(result).toEqual({
        output: 'no MCP result',
        isError: false,
      });
    });

    it('should handle empty arguments string for MCP tools', async () => {
      mockMCPClient.getAllTools.mockReturnValue([
        { name: 'no_args_tool', description: 'Tool with no arguments' },
      ]);
      mockMCPClient.callTool.mockResolvedValue({
        content: 'success with no args',
      });

      const call = { name: 'no_args_tool', arguments: '' };
      const result = await handler.processCall(call, {});

      expect(mockMCPClient.callTool).toHaveBeenCalledWith('no_args_tool', {});
      expect(result).toEqual({
        output: 'MCP Tool Result (no_args_tool): success with no args',
        isError: false,
      });
    });

    it('should handle missing arguments property for MCP tools', async () => {
      mockMCPClient.getAllTools.mockReturnValue([
        { name: 'missing_args_tool', description: 'Tool with missing args property' },
      ]);
      mockMCPClient.callTool.mockResolvedValue({
        content: 'success with missing args',
      });

      const call = { name: 'missing_args_tool' }; // No arguments property
      const result = await handler.processCall(call, {});

      expect(mockMCPClient.callTool).toHaveBeenCalledWith('missing_args_tool', {});
      expect(result).toEqual({
        output: 'MCP Tool Result (missing_args_tool): success with missing args',
        isError: false,
      });
    });

    it('should format non-string MCP content without [object Object]', async () => {
      mockMCPClient.getAllTools.mockReturnValue([
        { name: 'rich_tool', description: 'Tool with rich content' },
      ]);
      mockMCPClient.callTool.mockResolvedValue({
        content: [
          { type: 'text', text: 'Part A' },
          { type: 'json', json: { foo: 'bar' } },
          { type: 'data', data: { key: 'value' } },
          { type: 'unknown', other: 'stuff' },
          'plain string part',
          null,
          undefined,
        ],
      });

      const call = { name: 'rich_tool', arguments: '{}' };
      const result = await handler.processCall(call, {});

      expect(result.isError).toBe(false);
      expect(result.output).toContain('Part A');
      expect(result.output).toContain('"foo":"bar"');
      expect(result.output).toContain('"key":"value"');
      expect(result.output).toContain('plain string part');
      expect(result.output).not.toContain('[object Object]');
    });

    it('should handle object MCP content without [object Object]', async () => {
      mockMCPClient.getAllTools.mockReturnValue([
        { name: 'object_tool', description: 'Tool returning object' },
      ]);
      mockMCPClient.callTool.mockResolvedValue({
        content: { type: 'response', data: { result: 'success', count: 42 } },
      });

      const call = { name: 'object_tool', arguments: '{}' };
      const result = await handler.processCall(call, {});

      expect(result.isError).toBe(false);
      expect(result.output).toContain('"result":"success"');
      expect(result.output).toContain('"count":42');
      expect(result.output).not.toContain('[object Object]');
    });

    it('should handle null/undefined MCP content gracefully', async () => {
      mockMCPClient.getAllTools.mockReturnValue([
        { name: 'empty_tool', description: 'Tool with empty content' },
      ]);
      mockMCPClient.callTool.mockResolvedValue({
        content: null,
      });

      const call = { name: 'empty_tool', arguments: '{}' };
      const result = await handler.processCall(call, {});

      expect(result.isError).toBe(false);
      expect(result.output).toBe('MCP Tool Result (empty_tool): ');
    });

    it('should handle non-object arguments passed directly', async () => {
      mockMCPClient.getAllTools.mockReturnValue([
        { name: 'direct_args_tool', description: 'Tool with direct args' },
      ]);
      mockMCPClient.callTool.mockResolvedValue({
        content: 'success with direct args',
      });

      const call = { name: 'direct_args_tool', arguments: { param: 'value' } }; // Direct object, not string
      const result = await handler.processCall(call, {});

      expect(mockMCPClient.callTool).toHaveBeenCalledWith('direct_args_tool', { param: 'value' });
      expect(result).toEqual({
        output: 'MCP Tool Result (direct_args_tool): success with direct args',
        isError: false,
      });
    });
  });
});
