import { describe, expect, it } from 'vitest';
import { getActualPrompt, type ProviderResponsePrompt } from './providerResponse';

describe('getActualPrompt', () => {
  it('should return undefined for undefined response', () => {
    expect(getActualPrompt(undefined)).toBeUndefined();
  });

  it('should return undefined for response without prompt', () => {
    const response: ProviderResponsePrompt = {};
    expect(getActualPrompt(response)).toBeUndefined();
  });

  it('should return string prompt directly', () => {
    const response: ProviderResponsePrompt = {
      prompt: 'Hello, world!',
    };
    expect(getActualPrompt(response)).toBe('Hello, world!');
  });

  it('should return undefined for empty string prompt', () => {
    const response: ProviderResponsePrompt = {
      prompt: '',
    };
    expect(getActualPrompt(response)).toBeUndefined();
  });

  it('should stringify chat message array', () => {
    const response: ProviderResponsePrompt = {
      prompt: [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
      ],
    };
    expect(getActualPrompt(response)).toBe(
      '[{"role":"system","content":"You are helpful"},{"role":"user","content":"Hello"}]',
    );
  });

  it('should format chat message array when formatted option is true', () => {
    const response: ProviderResponsePrompt = {
      prompt: [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
      ],
    };
    const result = getActualPrompt(response, { formatted: true });
    expect(result).toContain('\n');
    expect(result).toContain('  ');
  });

  it('should return undefined for empty array prompt', () => {
    const response: ProviderResponsePrompt = {
      prompt: [],
    };
    expect(getActualPrompt(response)).toBeUndefined();
  });

  it('should fall back to redteamFinalPrompt when prompt is not set', () => {
    const response: ProviderResponsePrompt = {
      metadata: {
        redteamFinalPrompt: 'fallback prompt',
      },
    };
    expect(getActualPrompt(response)).toBe('fallback prompt');
  });

  it('should prioritize prompt over redteamFinalPrompt', () => {
    const response: ProviderResponsePrompt = {
      prompt: 'provider prompt',
      metadata: {
        redteamFinalPrompt: 'fallback prompt',
      },
    };
    expect(getActualPrompt(response)).toBe('provider prompt');
  });
});
