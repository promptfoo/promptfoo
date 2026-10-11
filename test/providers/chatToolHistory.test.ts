import { describe, expect, it } from 'vitest';
import { parseMessages } from '../../src/providers/anthropic/util';
import { maybeCoerceToGeminiFormat } from '../../src/providers/google/util';

const call = (id = 'call_1', name = 'read_file', args: unknown = { path: 'config.yml' }) => ({
  id,
  type: 'function',
  function: { name, arguments: args },
});
const history = () => [
  { role: 'user', content: 'Read the configuration' },
  { role: 'assistant', content: '', tool_calls: [call()] },
  { role: 'user', tool_call_id: 'call_1', name: 'read_file', content: 'file contents' },
];
const anthropic = (messages: unknown) => parseMessages(JSON.stringify(messages));

describe('OpenAI tool history in provider requests', () => {
  it('retains the completed tool turn from #10973 in Gemini', () => {
    const result = maybeCoerceToGeminiFormat(history());
    expect(result.contents).toEqual([
      { role: 'user', parts: [{ text: 'Read the configuration' }] },
      {
        role: 'model',
        parts: [
          {
            functionCall: { id: 'call_1', name: 'read_file', args: { path: 'config.yml' } },
            thoughtSignature: 'skip_thought_signature_validator',
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'call_1',
              name: 'read_file',
              response: { result: 'file contents' },
            },
          },
        ],
      },
    ]);
    expect(result.coerced).toBe(true);
  });

  it('retains the completed tool turn from #10973 in Anthropic', () => {
    expect(anthropic(history()).extractedMessages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Read the configuration' }] },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'call_1', name: 'read_file', input: { path: 'config.yml' } },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'file contents' }],
      },
    ]);
  });

  it('keeps parallel results grouped and matched by id without explicit result names', () => {
    const messages = [
      {
        role: 'assistant',
        content: null,
        tool_calls: [call('one', 'first', '{"a":1}'), call('two', 'second', {})],
      },
      { role: 'tool', tool_call_id: 'one', content: 'first result' },
      { role: 'tool', tool_call_id: 'two', content: 'second result' },
    ];
    const gemini = maybeCoerceToGeminiFormat(messages).contents;
    expect(gemini).toHaveLength(2);
    expect(gemini[0].parts[0].functionCall?.args).toEqual({ a: 1 });
    expect(gemini[1].parts.map((part) => part.functionResponse)).toEqual([
      { id: 'one', name: 'first', response: { result: 'first result' } },
      { id: 'two', name: 'second', response: { result: 'second result' } },
    ]);
    expect(anthropic(messages).extractedMessages[1].content).toEqual([
      { type: 'tool_result', tool_use_id: 'one', content: 'first result' },
      { type: 'tool_result', tool_use_id: 'two', content: 'second result' },
    ]);
  });

  it('preserves system and developer instructions alongside tool history', () => {
    const messages = [
      { role: 'system', content: 'system instruction' },
      { role: 'developer', content: 'developer instruction' },
      ...history(),
    ];
    expect(maybeCoerceToGeminiFormat(messages).systemInstruction?.parts).toEqual([
      { text: 'system instruction' },
      { text: 'developer instruction' },
    ]);
    expect(anthropic(messages).system).toEqual([
      { type: 'text', text: 'system instruction' },
      { type: 'text', text: 'developer instruction' },
    ]);
  });

  it('preserves Gemini signatures and native parts in assistant array content', () => {
    const toolCall = {
      ...call(),
      extra_content: { google: { thought_signature: 'original-signature' } },
    };
    const parts = [
      { type: 'text', text: 'Checking' },
      { inlineData: { mimeType: 'image/png', data: 'aGVsbG8=' } },
    ];
    const result = maybeCoerceToGeminiFormat([
      { role: 'assistant', content: parts, tool_calls: [toolCall] },
    ]);
    expect(result.contents[0].parts).toEqual([
      { text: 'Checking' },
      parts[1],
      {
        functionCall: { id: 'call_1', name: 'read_file', args: { path: 'config.yml' } },
        thoughtSignature: 'original-signature',
      },
    ]);
  });

  it('preserves Anthropic native image and thinking blocks alongside imported calls', () => {
    const content = [
      { type: 'thinking', thinking: 'reasoning', signature: 'native-signature' },
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: 'data:image/png;base64,aGVsbG8=' },
      },
    ];
    const result = anthropic([{ role: 'assistant', content, tool_calls: [call()] }]);
    expect(result.extractedMessages[0].content).toEqual([
      content[0],
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aGVsbG8=' } },
      { type: 'tool_use', id: 'call_1', name: 'read_file', input: { path: 'config.yml' } },
    ]);
  });

  it('leaves native Gemini and Anthropic tool history intact', () => {
    const gemini = [
      {
        role: 'model',
        parts: [{ functionCall: { name: 'read_file', args: {} }, thoughtSignature: 'original' }],
      },
    ];
    expect(maybeCoerceToGeminiFormat(gemini).contents).toEqual(gemini);
    const native = [
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'one', name: 'read_file', input: {} }],
      },
    ];
    expect(anthropic(native).extractedMessages).toEqual(native);
  });

  it.each(['{', '[]', 'null', '"text"', null, 42])(
    'rejects malformed arguments instead of replacing %j with {}',
    (args) => {
      const messages = [
        { role: 'assistant', content: '', tool_calls: [call('one', 'read_file', args)] },
      ];
      expect(() => maybeCoerceToGeminiFormat(messages)).toThrow();
      expect(() => anthropic(messages)).toThrow();
    },
  );

  it('rejects missing or mismatched result associations', () => {
    expect(() => anthropic([{ role: 'tool', content: 'result' }])).toThrow('tool_call_id');
    expect(() =>
      maybeCoerceToGeminiFormat([{ role: 'tool', tool_call_id: 'unknown', content: 'result' }]),
    ).toThrow('matching function name');
    expect(() =>
      maybeCoerceToGeminiFormat([
        ...history().slice(0, 2),
        { role: 'tool', tool_call_id: 'call_1', name: 'wrong', content: 'result' },
      ]),
    ).toThrow('matching function name');
  });

  it('retains the plain-text fallback for JSON arrays with null entries', () => {
    expect(anthropic([null]).extractedMessages).toEqual([
      { role: 'user', content: [{ type: 'text', text: '[null]' }] },
    ]);
  });

  it('never invents tool call names or Anthropic tool ids', () => {
    const noName = [
      { role: 'assistant', tool_calls: [{ id: 'one', function: { arguments: '{}' } }] },
    ];
    expect(() => maybeCoerceToGeminiFormat(noName)).toThrow('function name');
    expect(() => anthropic(noName)).toThrow('function name');
    expect(() =>
      anthropic([
        { role: 'assistant', tool_calls: [{ function: { name: 'read_file', arguments: '{}' } }] },
      ]),
    ).toThrow('id');
    const gemini = maybeCoerceToGeminiFormat([
      { role: 'assistant', tool_calls: [{ function: { name: 'read_file', arguments: '{}' } }] },
    ]);
    expect(gemini.contents[0].parts[0].functionCall).not.toHaveProperty('id');
  });
});
