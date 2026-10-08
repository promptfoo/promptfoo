import { describe, expect, it } from 'vitest';
import {
  novaNormalizeContent,
  novaOutputFromMessage,
  novaParseMessages,
} from '../../../src/providers/bedrock/util';

describe('novaOutputFromMessage', () => {
  it('should handle tool use blocks', () => {
    const response = {
      output: {
        message: {
          role: 'assistant',
          content: [
            { text: 'Wrapper text' },
            { toolUse: { name: 'tool1', toolUseId: '123', input: { foo: 'bar' } } },
            { text: 'More text' },
            { toolUse: { name: 'tool2', toolUseId: '456', input: { baz: 'qux' } } },
          ],
        },
      },
    };

    const result = novaOutputFromMessage(response);
    expect(result).toBe(
      '{"name":"tool1","toolUseId":"123","input":{"foo":"bar"}}\n\n{"name":"tool2","toolUseId":"456","input":{"baz":"qux"}}',
    );
  });

  it('should handle text-only blocks', () => {
    const response = {
      output: {
        message: {
          role: 'assistant',
          content: [{ text: 'First message' }, { text: 'Second message' }],
        },
      },
    };

    const result = novaOutputFromMessage(response);
    expect(result).toBe('First message\n\nSecond message');
  });

  it('should handle empty response', () => {
    const response = {};
    const result = novaOutputFromMessage(response);
    expect(result).toBeUndefined();
  });
});

describe('novaParseMessages', () => {
  it('should parse JSON messages', () => {
    const messages = JSON.stringify([
      { role: 'system', content: 'System message' },
      { role: 'user', content: 'User message' },
      { role: 'assistant', content: 'Assistant message' },
    ]);

    const result = novaParseMessages(messages);

    expect(result.system).toEqual([{ text: 'System message' }]);
    expect(result.extractedMessages).toEqual([
      { role: 'user', content: [{ text: 'User message' }] },
      { role: 'assistant', content: [{ text: 'Assistant message' }] },
    ]);
  });

  it('should parse plain text messages', () => {
    const messages = `
      system: System instruction
      user: Hello
      assistant: Hi there
      How are you?
      user: I'm good
    `;

    const result = novaParseMessages(messages);

    expect(result.system).toEqual([{ text: 'System instruction' }]);
    expect(result.extractedMessages).toEqual([
      { role: 'user', content: [{ text: 'Hello' }] },
      { role: 'assistant', content: [{ text: 'Hi there\nHow are you?' }] },
      { role: 'user', content: [{ text: "I'm good" }] },
    ]);
  });

  it('should handle single line input as user message', () => {
    const messages = 'Simple message';
    const result = novaParseMessages(messages);

    expect(result.system).toBeUndefined();
    expect(result.extractedMessages).toEqual([
      { role: 'user', content: [{ text: 'Simple message' }] },
    ]);
  });

  it('should handle JSON messages with array content', () => {
    const messages = JSON.stringify([
      {
        role: 'user',
        content: [{ text: 'Message 1' }, { text: 'Message 2' }],
      },
    ]);

    const result = novaParseMessages(messages);
    expect(result.extractedMessages).toEqual([
      {
        role: 'user',
        content: [{ text: 'Message 1' }, { text: 'Message 2' }],
      },
    ]);
  });

  it('should convert OpenAI image_url content parts to Nova image blocks', () => {
    const messages = JSON.stringify([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,aGVsbG8=' } },
        ],
      },
    ]);

    const result = novaParseMessages(messages);
    expect(result.extractedMessages).toEqual([
      {
        role: 'user',
        content: [
          { text: 'Describe this' },
          { image: { format: 'png', source: { bytes: 'aGVsbG8=' } } },
        ],
      },
    ]);
  });
});

describe('novaNormalizeContent', () => {
  it('wraps string content as a single text block', () => {
    expect(novaNormalizeContent('hello')).toEqual([{ text: 'hello' }]);
  });

  it('converts OpenAI text and image_url parts', () => {
    expect(
      novaNormalizeContent([
        { type: 'text', text: 'hi' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/' } },
      ]),
    ).toEqual([{ text: 'hi' }, { image: { format: 'jpeg', source: { bytes: '/9j/' } } }]);
  });

  it('converts Responses input_text and input_image parts', () => {
    expect(
      novaNormalizeContent([
        { type: 'input_text', text: 'hi' },
        { type: 'input_image', image_url: 'data:image/webp;base64,UklGRg==' },
      ]),
    ).toEqual([{ text: 'hi' }, { image: { format: 'webp', source: { bytes: 'UklGRg==' } } }]);
  });

  it('converts Anthropic image source parts', () => {
    expect(
      novaNormalizeContent([
        { type: 'image', source: { type: 'base64', media_type: 'image/gif', data: 'R0lGOD' } },
      ]),
    ).toEqual([{ image: { format: 'gif', source: { bytes: 'R0lGOD' } } }]);
  });

  it('converts Google inlineData parts', () => {
    expect(
      novaNormalizeContent([{ inlineData: { mimeType: 'image/png', data: 'aGVsbG8=' } }]),
    ).toEqual([{ image: { format: 'png', source: { bytes: 'aGVsbG8=' } } }]);
  });

  it('converts Google REST-style inline_data parts', () => {
    expect(
      novaNormalizeContent([{ inline_data: { mime_type: 'image/jpeg', data: '/9j/' } }]),
    ).toEqual([{ image: { format: 'jpeg', source: { bytes: '/9j/' } } }]);
  });

  it('passes through parts already in Nova shape and tool blocks', () => {
    const content = [
      { text: 'plain' },
      { image: { format: 'png', source: { bytes: 'abc' } } },
      { toolUse: { name: 't', toolUseId: '1', input: {} } },
    ];
    expect(novaNormalizeContent(content)).toEqual(content);
  });

  it('leaves unsupported image formats untouched so existing behavior is preserved', () => {
    const svg = { type: 'image_url', image_url: { url: 'data:image/svg+xml;base64,PHN2Zz4=' } };
    expect(novaNormalizeContent([svg])).toEqual([svg]);
  });
});
