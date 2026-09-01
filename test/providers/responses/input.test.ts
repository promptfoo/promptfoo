import { describe, expect, it } from 'vitest';
import { normalizeResponsesInput } from '../../../src/providers/responses/input';

describe('normalizeResponsesInput', () => {
  it('returns non-array input unchanged', () => {
    expect(normalizeResponsesInput('a plain string prompt')).toBe('a plain string prompt');
    expect(normalizeResponsesInput(undefined)).toBeUndefined();
    expect(normalizeResponsesInput(null)).toBeNull();
  });

  it('rewrites chat-format text parts to input_text', () => {
    // The Responses API rejects `type: "text"` outright (xAI 422, OpenAI 400), so a prompt
    // authored in the chat format must be translated rather than passed through.
    expect(
      normalizeResponsesInput([{ role: 'user', content: [{ type: 'text', text: 'hello' }] }]),
    ).toEqual([{ role: 'user', content: [{ type: 'input_text', text: 'hello' }] }]);
  });

  it('uses output_text for assistant turns', () => {
    expect(
      normalizeResponsesInput([
        { role: 'assistant', content: [{ type: 'text', text: 'prior reply' }] },
      ]),
    ).toEqual([{ role: 'assistant', content: [{ type: 'output_text', text: 'prior reply' }] }]);
  });

  it('flattens nested chat image_url parts into input_image', () => {
    expect(
      normalizeResponsesInput([
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }],
        },
      ]),
    ).toEqual([
      {
        role: 'user',
        content: [{ type: 'input_image', image_url: 'data:image/png;base64,AAAA' }],
      },
    ]);
  });

  it('preserves the image detail hint from either nesting level', () => {
    expect(
      normalizeResponsesInput([
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: 'https://x/y.png', detail: 'low' } }],
        },
      ]),
    ).toEqual([
      {
        role: 'user',
        content: [{ type: 'input_image', image_url: 'https://x/y.png', detail: 'low' }],
      },
    ]);
  });

  it('accepts an already-flat image_url string', () => {
    expect(
      normalizeResponsesInput([
        { role: 'user', content: [{ type: 'image_url', image_url: 'https://x/y.png' }] },
      ]),
    ).toEqual([{ role: 'user', content: [{ type: 'input_image', image_url: 'https://x/y.png' }] }]);
  });

  it('leaves parts that already use Responses types untouched', () => {
    const input = [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'hi' },
          { type: 'input_image', image_url: 'https://x/y.png' },
          { type: 'input_file', file_id: 'file_123' },
        ],
      },
    ];
    expect(normalizeResponsesInput(input)).toEqual(input);
  });

  it('does not touch non-message items that carry their own type', () => {
    // Function calls, tool outputs and reasoning items are input items, not chat messages;
    // rewriting their shape would corrupt the request.
    const input = [
      { type: 'function_call', call_id: 'call_1', name: 'lookup', arguments: '{}' },
      { type: 'function_call_output', call_id: 'call_1', output: 'done' },
      { type: 'message', role: 'user', content: [{ type: 'text', text: 'untouched' }] },
    ];
    expect(normalizeResponsesInput(input)).toEqual(input);
  });

  it('leaves string content and unrecognized parts alone', () => {
    const input = [
      { role: 'user', content: 'plain string content' },
      { role: 'user', content: [{ type: 'something_new', value: 1 }] },
      { role: 'user', content: [{ type: 'text' }] },
      { role: 'user' },
      'not an object',
      null,
    ];
    expect(normalizeResponsesInput(input)).toEqual(input);
  });

  it('normalizes a mixed multimodal turn end to end', () => {
    expect(
      normalizeResponsesInput([
        { role: 'system', content: [{ type: 'text', text: 'be terse' }] },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What color is this?' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,BBBB' } },
          ],
        },
      ]),
    ).toEqual([
      { role: 'system', content: [{ type: 'input_text', text: 'be terse' }] },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'What color is this?' },
          { type: 'input_image', image_url: 'data:image/png;base64,BBBB' },
        ],
      },
    ]);
  });
});
