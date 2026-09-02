import { describe, expect, it } from 'vitest';
import { resolveClassifierPrompt } from '../../src/assertions/classifierPrompt';

describe('resolveClassifierPrompt', () => {
  it('returns the original prompt when the response carries none', () => {
    expect(resolveClassifierPrompt({ output: 'out' }, 'original prompt')).toBe('original prompt');
  });

  it('prefers a provider-reported string prompt over the original', () => {
    expect(
      resolveClassifierPrompt({ output: 'out', prompt: 'provider prompt' }, 'original prompt'),
    ).toBe('provider prompt');
  });

  it('falls back to redteamFinalPrompt when response.prompt is absent', () => {
    expect(
      resolveClassifierPrompt(
        { output: 'out', metadata: { redteamFinalPrompt: 'redteam prompt' } },
        'original prompt',
      ),
    ).toBe('redteam prompt');
  });

  it('falls back to the original prompt when response.prompt is an empty string', () => {
    expect(resolveClassifierPrompt({ output: 'out', prompt: '' }, 'original prompt')).toBe(
      'original prompt',
    );
  });

  it('handles an undefined provider response', () => {
    expect(resolveClassifierPrompt(undefined, 'original prompt')).toBe('original prompt');
  });

  it('extracts the last user message from a serialized JSON chat prompt', () => {
    const prompt = JSON.stringify([
      { role: 'system', content: 'ignore me' },
      { role: 'user', content: 'classify this' },
      { role: 'assistant', content: 'ignore me too' },
    ]);
    expect(resolveClassifierPrompt({ output: 'out' }, prompt)).toBe('classify this');
  });

  it('extracts the last user message from a YAML chat prompt', () => {
    const prompt = [
      '- role: system',
      '  content: ignore me',
      '- role: user',
      '  content: classify this yaml',
    ].join('\n');
    expect(resolveClassifierPrompt({ output: 'out' }, prompt)).toBe('classify this yaml');
  });

  it('picks the LAST user message when several are present', () => {
    const prompt = JSON.stringify([
      { role: 'user', content: 'first turn' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'second turn' },
    ]);
    expect(resolveClassifierPrompt({ output: 'out' }, prompt)).toBe('second turn');
  });

  it('joins multimodal user content parts into text', () => {
    const prompt = JSON.stringify([
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'describe this' },
          { type: 'input_image', image_url: 'https://example.test/x.png' },
        ],
      },
    ]);
    expect(resolveClassifierPrompt({ output: 'out' }, prompt)).toBe('describe this');
  });

  it('joins multiple text parts with newlines', () => {
    const prompt = JSON.stringify([
      {
        role: 'user',
        content: [{ text: 'part one' }, { text: 'part two' }],
      },
    ]);
    expect(resolveClassifierPrompt({ output: 'out' }, prompt)).toBe('part one\npart two');
  });

  it('unwraps a nested content object', () => {
    const prompt = JSON.stringify([{ role: 'user', content: { content: 'nested text' } }]);
    expect(resolveClassifierPrompt({ output: 'out' }, prompt)).toBe('nested text');
  });

  it('falls back to a non-user message when no user turn has usable text', () => {
    const prompt = JSON.stringify([
      { role: 'system', content: 'only system text' },
      { role: 'assistant', content: 'assistant text' },
    ]);
    expect(resolveClassifierPrompt({ output: 'out' }, prompt)).toBe('assistant text');
  });

  it('returns the raw prompt when no message yields any text', () => {
    const prompt = JSON.stringify([{ role: 'user', content: null }]);
    expect(resolveClassifierPrompt({ output: 'out' }, prompt)).toBe(prompt);
  });

  it('returns the raw prompt for an empty chat array', () => {
    expect(resolveClassifierPrompt({ output: 'out' }, '[]')).toBe('[]');
  });

  it('returns plain text prompts unchanged', () => {
    expect(resolveClassifierPrompt({ output: 'out' }, 'just a plain prompt')).toBe(
      'just a plain prompt',
    );
  });

  it('returns the raw prompt when parsing throws', () => {
    // Unbalanced braces: not valid JSON or YAML.
    const prompt = '{ this is not: [valid';
    expect(resolveClassifierPrompt({ output: 'out' }, prompt)).toBe(prompt);
  });
});
