import { describe, expect, it } from 'vitest';
import { parseMessages } from '../../src/providers/anthropic/util';
import { maybeCoerceToGeminiFormat } from '../../src/providers/google/util';
import {
  hasOpenAIToolMessages,
  openaiChatToAnthropic,
  openaiChatToBedrock,
  openaiChatToGoogle,
  transformChatMessages,
} from '../../src/providers/shared';

// Mirrors the OpenAI-style history from promptfoo#10973.
const ISSUE_HISTORY = [
  { role: 'user', content: 'do the thing' },
  {
    role: 'assistant',
    content: '',
    tool_calls: [
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'read_file', arguments: { path: '.smart.ai/config.yml' } },
      },
    ],
  },
  {
    role: 'user',
    tool_call_id: 'call_1',
    name: 'read_file',
    content: 'file-contents-here',
  },
];

describe('chat history with tool calls (#10973)', () => {
  describe('hasOpenAIToolMessages', () => {
    it('detects assistant tool_calls', () => {
      expect(hasOpenAIToolMessages(ISSUE_HISTORY)).toBe(true);
    });

    it('detects role: tool messages', () => {
      expect(hasOpenAIToolMessages([{ role: 'tool', content: 'x' }])).toBe(true);
    });

    it('returns false for plain history and non-arrays', () => {
      expect(
        hasOpenAIToolMessages([
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
        ]),
      ).toBe(false);
      expect(hasOpenAIToolMessages([])).toBe(false);
      expect(hasOpenAIToolMessages('string')).toBe(false);
      expect(hasOpenAIToolMessages(null)).toBe(false);
    });

    it('returns false for native Gemini format', () => {
      expect(hasOpenAIToolMessages([{ role: 'user', parts: [{ text: 'hi' }] }])).toBe(false);
    });
  });

  describe('openaiChatToGoogle', () => {
    it('maps the issue history to functionCall/functionResponse parts', () => {
      const result = openaiChatToGoogle(ISSUE_HISTORY as any);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ role: 'user', parts: [{ text: 'do the thing' }] });
      expect(result[1]).toEqual({
        role: 'model',
        parts: [
          {
            functionCall: {
              id: 'call_1',
              name: 'read_file',
              args: { path: '.smart.ai/config.yml' },
            },
          },
        ],
      });
      expect(result[2]).toEqual({
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'call_1',
              name: 'read_file',
              response: { result: 'file-contents-here' },
            },
          },
        ],
      });
    });

    it('parses JSON-string arguments and keeps assistant text', () => {
      const result = openaiChatToGoogle([
        {
          role: 'assistant',
          content: 'calling now',
          tool_calls: [
            { id: 'a', function: { name: 'f', arguments: '{"x":1}' } },
            { function: { name: 'g' } },
          ],
        },
      ] as any);
      expect(result[0].parts).toEqual([
        { text: 'calling now' },
        { functionCall: { id: 'a', name: 'f', args: { x: 1 } } },
        { functionCall: { name: 'g', args: {} } },
      ]);
    });

    it('maps assistant role when useAssistantRole is set', () => {
      const result = openaiChatToGoogle([{ role: 'assistant', content: 'hi' }] as any, true);
      expect(result[0].role).toBe('assistant');
    });

    it('keeps system messages so downstream extraction builds systemInstruction', () => {
      const result = openaiChatToGoogle([
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hi', tool_call_id: 't', name: 'f' },
      ] as any);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ role: 'system', parts: [{ text: 'sys' }] });
    });

    it('resolves tool-result names from the matching tool_calls entry', () => {
      const result = openaiChatToGoogle([
        {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_1', function: { name: 'read_file', arguments: {} } }],
        },
        { role: 'tool', tool_call_id: 'call_1', content: 'data' },
      ] as any);
      expect(result[1]).toEqual({
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'call_1',
              name: 'read_file',
              response: { result: 'data' },
            },
          },
        ],
      });
    });

    it('batches consecutive tool results into a single user turn', () => {
      const result = openaiChatToGoogle([
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id: 'a', function: { name: 'f', arguments: {} } },
            { id: 'b', function: { name: 'g', arguments: {} } },
          ],
        },
        { role: 'tool', tool_call_id: 'a', content: 'one' },
        { role: 'tool', tool_call_id: 'b', content: 'two' },
        { role: 'user', content: 'thanks' },
      ] as any);
      expect(result).toHaveLength(3);
      expect(result[1]).toEqual({
        role: 'user',
        parts: [
          { functionResponse: { id: 'a', name: 'f', response: { result: 'one' } } },
          { functionResponse: { id: 'b', name: 'g', response: { result: 'two' } } },
        ],
      });
      expect(result[2]).toEqual({ role: 'user', parts: [{ text: 'thanks' }] });
    });

    it('maps array content item-wise instead of stringifying it', () => {
      const result = openaiChatToGoogle([
        {
          role: 'user',
          content: ['hello', { type: 'text', text: 'world' }],
          tool_call_id: undefined,
        },
      ] as any);
      expect(result[0]).toEqual({
        role: 'user',
        parts: [{ text: 'hello' }, { text: 'world' }],
      });
    });
  });

  describe('openaiChatToAnthropic', () => {
    it('maps the issue history to tool_use/tool_result blocks', () => {
      const result = openaiChatToAnthropic(ISSUE_HISTORY as any);
      expect(result).toHaveLength(3);
      expect(result[1]).toEqual({
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'call_1',
            name: 'read_file',
            input: { path: '.smart.ai/config.yml' },
          },
        ],
      });
      expect(result[2]).toEqual({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'file-contents-here' }],
      });
    });

    it('keeps assistant text alongside tool_use and maps role: tool', () => {
      const result = openaiChatToAnthropic([
        {
          role: 'assistant',
          content: 'one moment',
          tool_calls: [{ id: 'a', function: { name: 'f', arguments: '{"x":1}' } }],
        },
        { role: 'tool', content: 'done' },
      ] as any);
      expect(result[0].content).toEqual([
        { type: 'text', text: 'one moment' },
        { type: 'tool_use', id: 'a', name: 'f', input: { x: 1 } },
      ]);
      expect(result[1].content[0].type).toBe('tool_result');
    });
  });

  describe('openaiChatToBedrock / transformChatMessages', () => {
    it('bedrock mirrors the anthropic blocks', () => {
      expect(openaiChatToBedrock(ISSUE_HISTORY as any)).toEqual(
        openaiChatToAnthropic(ISSUE_HISTORY as any),
      );
    });

    it('passes plain history and native formats through untouched', () => {
      const plain = [{ role: 'user', content: 'hi' }];
      expect(transformChatMessages(plain, 'google')).toBe(plain);
      expect(transformChatMessages(plain, 'anthropic')).toBe(plain);
      const native = [{ role: 'user', parts: [{ text: 'hi' }] }];
      expect(transformChatMessages(native, 'google')).toBe(native);
    });

    it('transforms tool history per target format', () => {
      const google = transformChatMessages(ISSUE_HISTORY, 'google') as any[];
      expect(google[1].parts[0].functionCall.name).toBe('read_file');
      const anthropic = transformChatMessages(ISSUE_HISTORY, 'anthropic') as any[];
      expect(anthropic[1].content[0].type).toBe('tool_use');
      expect(transformChatMessages(ISSUE_HISTORY, 'openai')).toBe(ISSUE_HISTORY);
    });
  });

  describe('provider integration', () => {
    it('maybeCoerceToGeminiFormat preserves tool history instead of dropping it', () => {
      const { contents, coerced } = maybeCoerceToGeminiFormat(ISSUE_HISTORY);
      expect(coerced).toBe(true);
      expect(contents[1].parts).toEqual([
        {
          functionCall: { id: 'call_1', name: 'read_file', args: { path: '.smart.ai/config.yml' } },
        },
      ]);
      expect(contents[2]).toEqual({
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'call_1',
              name: 'read_file',
              response: { result: 'file-contents-here' },
            },
          },
        ],
      });
    });

    it('parseMessages preserves tool history as tool_use/tool_result', () => {
      const { extractedMessages } = parseMessages(JSON.stringify(ISSUE_HISTORY));
      expect(extractedMessages[1]).toMatchObject({
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'call_1', name: 'read_file' }],
      });
      expect(extractedMessages[2]).toMatchObject({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'call_1' }],
      });
    });

    it('parseMessages preserves structured array content in tool histories', () => {
      const history = [
        ...ISSUE_HISTORY,
        {
          role: 'user',
          content: [
            { type: 'text', text: 'look' },
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: 'aGk=' },
            },
          ],
        },
      ];
      const { extractedMessages } = parseMessages(JSON.stringify(history));
      const last = extractedMessages[extractedMessages.length - 1] as any;
      expect(last.role).toBe('user');
      expect(last.content).toEqual([
        { type: 'text', text: 'look' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aGk=' } },
      ]);
    });

    it('maybeCoerceToGeminiFormat extracts systemInstruction from tool histories', () => {
      const { contents, systemInstruction } = maybeCoerceToGeminiFormat([
        { role: 'system', content: 'behave' },
        ...ISSUE_HISTORY,
      ]);
      expect(systemInstruction).toEqual({ parts: [{ text: 'behave' }] });
      expect(contents.some((c: any) => c.role === 'system')).toBe(false);
      expect(contents).toHaveLength(3);
    });
  });
});
