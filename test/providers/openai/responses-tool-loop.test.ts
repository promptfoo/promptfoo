import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FunctionCallbackHandler } from '../../../src/providers/functionCallbackUtils';
import {
  aggregateTokenUsage,
  executeFunctionCallbacks,
  extractFunctionCalls,
  hasPendingFunctionCalls,
  runToolCallLoop,
} from '../../../src/providers/openai/responses-tool-loop';

import type { ResponseFunctionCall } from '../../../src/providers/openai/responses-tool-loop';

describe('responses-tool-loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('hasPendingFunctionCalls', () => {
    it('returns true when response has function_call items with matching callbacks', () => {
      const data = {
        output: [
          {
            type: 'function_call',
            name: 'addNumbers',
            call_id: 'call_1',
            arguments: '{"a":1,"b":2}',
          },
        ],
      };
      const callbacks = { addNumbers: 'async (args) => { return "3"; }' };
      expect(hasPendingFunctionCalls(data, callbacks)).toBe(true);
    });

    it('returns false when no callbacks are configured', () => {
      const data = {
        output: [{ type: 'function_call', name: 'addNumbers', call_id: 'call_1', arguments: '{}' }],
      };
      expect(hasPendingFunctionCalls(data, undefined)).toBe(false);
    });

    it('returns false when function_call name does not match any callback', () => {
      const data = {
        output: [
          { type: 'function_call', name: 'unknownFunction', call_id: 'call_1', arguments: '{}' },
        ],
      };
      const callbacks = { addNumbers: 'async (args) => { return "3"; }' };
      expect(hasPendingFunctionCalls(data, callbacks)).toBe(false);
    });

    it('returns false when output has no function_call items', () => {
      const data = {
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Hello' }],
          },
        ],
      };
      const callbacks = { addNumbers: 'async (args) => { return "3"; }' };
      expect(hasPendingFunctionCalls(data, callbacks)).toBe(false);
    });

    it('returns false when data has no output', () => {
      expect(hasPendingFunctionCalls({}, { addNumbers: 'async () => "3"' })).toBe(false);
      expect(hasPendingFunctionCalls(null, { addNumbers: 'async () => "3"' })).toBe(false);
    });
  });

  describe('extractFunctionCalls', () => {
    it('extracts function_call items from output', () => {
      const data = {
        output: [
          { type: 'function_call', name: 'addNumbers', call_id: 'call_1', arguments: '{"a":1}' },
          { type: 'message', role: 'assistant', content: [] },
          { type: 'function_call', name: 'multiply', call_id: 'call_2', arguments: '{"x":3}' },
        ],
      };

      const result = extractFunctionCalls(data);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('addNumbers');
      expect(result[0].call_id).toBe('call_1');
      expect(result[1].name).toBe('multiply');
      expect(result[1].call_id).toBe('call_2');
    });

    it('returns empty array when no function_call items', () => {
      const data = {
        output: [{ type: 'message', role: 'assistant', content: [] }],
      };
      expect(extractFunctionCalls(data)).toEqual([]);
    });

    it('returns empty array when data has no output', () => {
      expect(extractFunctionCalls({})).toEqual([]);
      expect(extractFunctionCalls(null)).toEqual([]);
    });

    it('skips function_call items without call_id', () => {
      const data = {
        output: [
          { type: 'function_call', name: 'addNumbers', arguments: '{}' },
          { type: 'function_call', name: 'multiply', call_id: 'call_2', arguments: '{}' },
        ],
      };
      const result = extractFunctionCalls(data);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('multiply');
    });
  });

  describe('executeFunctionCallbacks', () => {
    it('executes callbacks and returns function_call_output items', async () => {
      const handler = new FunctionCallbackHandler();
      const processSpy = vi.spyOn(handler, 'processCall').mockResolvedValue({
        output: '11',
        isError: false,
      });

      const calls: ResponseFunctionCall[] = [
        {
          type: 'function_call',
          call_id: 'call_1',
          name: 'addNumbers',
          arguments: '{"a":5,"b":6}',
        },
      ];
      const callbacks = {
        addNumbers: async (args: string) => {
          const { a, b } = JSON.parse(args);
          return String(a + b);
        },
      };

      const outputs = await executeFunctionCallbacks(calls, callbacks, handler);

      expect(outputs).toHaveLength(1);
      expect(outputs[0]).toEqual({
        type: 'function_call_output',
        call_id: 'call_1',
        output: '11',
      });
      expect(processSpy).toHaveBeenCalledWith(calls[0], callbacks);
    });

    it('handles multiple function calls', async () => {
      const handler = new FunctionCallbackHandler();
      vi.spyOn(handler, 'processCall')
        .mockResolvedValueOnce({ output: '11', isError: false })
        .mockResolvedValueOnce({ output: '30', isError: false });

      const calls: ResponseFunctionCall[] = [
        { type: 'function_call', call_id: 'call_1', name: 'add', arguments: '{}' },
        { type: 'function_call', call_id: 'call_2', name: 'multiply', arguments: '{}' },
      ];
      const callbacks = { add: vi.fn(), multiply: vi.fn() };

      const outputs = await executeFunctionCallbacks(calls, callbacks, handler);

      expect(outputs).toHaveLength(2);
      expect(outputs[0].call_id).toBe('call_1');
      expect(outputs[0].output).toBe('11');
      expect(outputs[1].call_id).toBe('call_2');
      expect(outputs[1].output).toBe('30');
    });
  });

  describe('aggregateTokenUsage', () => {
    it('sums token usage across multiple rounds', () => {
      const result = aggregateTokenUsage([
        { prompt: 10, completion: 20, total: 30, numRequests: 1 },
        { prompt: 5, completion: 15, total: 20, numRequests: 1 },
      ]);

      expect(result).toEqual({
        prompt: 15,
        completion: 35,
        total: 50,
        numRequests: 2,
      });
    });

    it('handles empty array', () => {
      expect(aggregateTokenUsage([])).toEqual({});
    });

    it('handles partial usage objects', () => {
      const result = aggregateTokenUsage([{ prompt: 10, total: 30 }, { completion: 15 }]);

      expect(result).toEqual({
        prompt: 10,
        completion: 15,
        total: 30,
      });
    });
  });

  describe('runToolCallLoop', () => {
    it('executes callbacks and sends follow-up requests', async () => {
      const handler = new FunctionCallbackHandler();
      vi.spyOn(handler, 'processCall').mockResolvedValue({
        output: '11',
        isError: false,
      });

      const initialData = {
        id: 'resp_1',
        output: [
          {
            type: 'function_call',
            name: 'addNumbers',
            call_id: 'call_1',
            arguments: '{"a":5,"b":6}',
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      const finalData = {
        id: 'resp_2',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'The sum is 11.' }],
          },
        ],
        usage: { input_tokens: 8, output_tokens: 12 },
      };

      const sendRequest = vi.fn().mockResolvedValue({ data: finalData, cached: false });
      const buildFollowUpBody = vi.fn().mockReturnValue({ model: 'gpt-4o', input: [] });

      const callbacks = { addNumbers: async () => '11' };

      const result = await runToolCallLoop({
        initialData,
        callbacks,
        handler,
        sendRequest,
        buildFollowUpBody,
        maxRounds: 5,
      });

      expect(result.toolCallRounds).toBe(1);
      expect(result.finalData).toBe(finalData);
      expect(result.intermediateToolCalls).toHaveLength(1);
      expect(result.intermediateToolCalls[0].calls).toHaveLength(1);
      expect(result.intermediateToolCalls[0].outputs[0].output).toBe('11');

      expect(sendRequest).toHaveBeenCalledOnce();
      expect(buildFollowUpBody).toHaveBeenCalledWith('resp_1', [
        { type: 'function_call_output', call_id: 'call_1', output: '11' },
      ]);

      // Aggregated usage: round 1 (initial) + round 2 (follow-up)
      expect(result.aggregatedUsage.prompt).toBe(18);
      expect(result.aggregatedUsage.completion).toBe(17);
    });

    it('stops when max rounds reached', async () => {
      const handler = new FunctionCallbackHandler();
      vi.spyOn(handler, 'processCall').mockResolvedValue({
        output: '11',
        isError: false,
      });

      // Every response has a function call, so loop would go forever
      const makeResponse = (id: string) => ({
        id,
        output: [
          { type: 'function_call', name: 'addNumbers', call_id: `call_${id}`, arguments: '{}' },
        ],
        usage: { input_tokens: 5, output_tokens: 5 },
      });

      const sendRequest = vi
        .fn()
        .mockResolvedValueOnce({ data: makeResponse('resp_2'), cached: false })
        .mockResolvedValueOnce({ data: makeResponse('resp_3'), cached: false });

      const buildFollowUpBody = vi.fn().mockReturnValue({});

      const result = await runToolCallLoop({
        initialData: makeResponse('resp_1'),
        callbacks: { addNumbers: async () => '11' },
        handler,
        sendRequest,
        buildFollowUpBody,
        maxRounds: 2,
      });

      expect(result.toolCallRounds).toBe(2);
      expect(sendRequest).toHaveBeenCalledTimes(2);
    });

    it('stops immediately when no pending function calls', async () => {
      const handler = new FunctionCallbackHandler();

      const initialData = {
        id: 'resp_1',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Hello' }],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      const sendRequest = vi.fn();
      const buildFollowUpBody = vi.fn();

      const result = await runToolCallLoop({
        initialData,
        callbacks: { addNumbers: async () => '11' },
        handler,
        sendRequest,
        buildFollowUpBody,
        maxRounds: 5,
      });

      expect(result.toolCallRounds).toBe(0);
      expect(result.finalData).toBe(initialData);
      expect(sendRequest).not.toHaveBeenCalled();
    });

    it('handles multiple parallel function calls in one round', async () => {
      const handler = new FunctionCallbackHandler();
      vi.spyOn(handler, 'processCall')
        .mockResolvedValueOnce({ output: '11', isError: false })
        .mockResolvedValueOnce({ output: '30', isError: false });

      const initialData = {
        id: 'resp_1',
        output: [
          { type: 'function_call', name: 'add', call_id: 'call_1', arguments: '{"a":5,"b":6}' },
          {
            type: 'function_call',
            name: 'multiply',
            call_id: 'call_2',
            arguments: '{"a":5,"b":6}',
          },
        ],
        usage: { input_tokens: 10, output_tokens: 10 },
      };

      const finalData = {
        id: 'resp_2',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Done' }],
          },
        ],
        usage: { input_tokens: 15, output_tokens: 5 },
      };

      const sendRequest = vi.fn().mockResolvedValue({ data: finalData, cached: false });
      const buildFollowUpBody = vi.fn().mockReturnValue({});

      const result = await runToolCallLoop({
        initialData,
        callbacks: { add: async () => '11', multiply: async () => '30' },
        handler,
        sendRequest,
        buildFollowUpBody,
        maxRounds: 5,
      });

      expect(result.toolCallRounds).toBe(1);
      expect(result.intermediateToolCalls[0].calls).toHaveLength(2);
      expect(result.intermediateToolCalls[0].outputs).toHaveLength(2);

      // buildFollowUpBody should have been called with both outputs
      expect(buildFollowUpBody).toHaveBeenCalledWith('resp_1', [
        { type: 'function_call_output', call_id: 'call_1', output: '11' },
        { type: 'function_call_output', call_id: 'call_2', output: '30' },
      ]);
    });

    it('stops when response has no id for continuation', async () => {
      const handler = new FunctionCallbackHandler();
      vi.spyOn(handler, 'processCall').mockResolvedValue({
        output: '11',
        isError: false,
      });

      const initialData = {
        // No id field
        output: [{ type: 'function_call', name: 'add', call_id: 'call_1', arguments: '{}' }],
        usage: { input_tokens: 5, output_tokens: 5 },
      };

      const sendRequest = vi.fn();
      const buildFollowUpBody = vi.fn();

      await runToolCallLoop({
        initialData,
        callbacks: { add: async () => '11' },
        handler,
        sendRequest,
        buildFollowUpBody,
        maxRounds: 5,
      });

      // Should stop because no response ID
      expect(sendRequest).not.toHaveBeenCalled();
    });
  });
});
