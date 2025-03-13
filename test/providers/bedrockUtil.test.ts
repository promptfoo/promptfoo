import { novaOutputFromMessage, novaParseMessages } from '../../src/providers/bedrockUtil';

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
});
