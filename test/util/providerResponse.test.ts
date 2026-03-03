import { describe, expect, it } from 'vitest';
import { getActualPrompt, getActualPromptWithFallback } from '../../src/util/providerResponse';

import type { ProviderResponse } from '../../src/types/providers';

describe('getActualPrompt', () => {
  it('should return undefined for undefined response', () => {
    expect(getActualPrompt(undefined)).toBeUndefined();
  });

  it('should return undefined for response without prompt', () => {
    const response: ProviderResponse = {
      output: 'test output',
    };
    expect(getActualPrompt(response)).toBeUndefined();
  });

  it('should return string prompt directly', () => {
    const response: ProviderResponse = {
      output: 'test output',
      prompt: 'Hello, world!',
    };
    expect(getActualPrompt(response)).toBe('Hello, world!');
  });

  it('should return undefined for empty string prompt', () => {
    const response: ProviderResponse = {
      output: 'test output',
      prompt: '',
    };
    // Empty string is truthy check but empty, so we return undefined
    expect(getActualPrompt(response)).toBeUndefined();
  });

  it('should stringify chat message array', () => {
    const response: ProviderResponse = {
      output: 'test output',
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
    const response: ProviderResponse = {
      output: 'test output',
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
    const response: ProviderResponse = {
      output: 'test output',
      prompt: [],
    };
    // Empty array is not useful
    expect(getActualPrompt(response)).toBeUndefined();
  });

  it('should fall back to redteamFinalPrompt when prompt is not set', () => {
    const response: ProviderResponse = {
      output: 'test output',
      metadata: {
        redteamFinalPrompt: 'fallback prompt',
      },
    };
    expect(getActualPrompt(response)).toBe('fallback prompt');
  });

  it('should prioritize prompt over redteamFinalPrompt', () => {
    const response: ProviderResponse = {
      output: 'test output',
      prompt: 'provider prompt',
      metadata: {
        redteamFinalPrompt: 'fallback prompt',
      },
    };
    expect(getActualPrompt(response)).toBe('provider prompt');
  });

  it('should not fall back to redteamFinalPrompt when prompt is empty string', () => {
    // Empty string means provider explicitly set no prompt, so we don't fall back
    const response: ProviderResponse = {
      output: 'test output',
      prompt: '',
      metadata: {
        redteamFinalPrompt: 'fallback prompt',
      },
    };
    // With empty string prompt explicitly set, we return undefined (not the fallback)
    expect(getActualPrompt(response)).toBeUndefined();
  });
});

describe('getActualPromptWithFallback', () => {
  it('should return provider prompt when available', () => {
    const response: ProviderResponse = {
      output: 'test output',
      prompt: 'provider prompt',
    };
    expect(getActualPromptWithFallback(response, 'original prompt')).toBe('provider prompt');
  });

  it('should return redteamFinalPrompt when prompt not available', () => {
    const response: ProviderResponse = {
      output: 'test output',
      metadata: {
        redteamFinalPrompt: 'redteam prompt',
      },
    };
    expect(getActualPromptWithFallback(response, 'original prompt')).toBe('redteam prompt');
  });

  it('should return original prompt when neither prompt nor redteamFinalPrompt available', () => {
    const response: ProviderResponse = {
      output: 'test output',
    };
    expect(getActualPromptWithFallback(response, 'original prompt')).toBe('original prompt');
  });

  it('should return original prompt for undefined response', () => {
    expect(getActualPromptWithFallback(undefined, 'original prompt')).toBe('original prompt');
  });

  it('should return original prompt when prompt is empty string', () => {
    const response: ProviderResponse = {
      output: 'test output',
      prompt: '',
    };
    expect(getActualPromptWithFallback(response, 'original prompt')).toBe('original prompt');
  });

  it('should return original prompt when prompt is empty array', () => {
    const response: ProviderResponse = {
      output: 'test output',
      prompt: [],
    };
    expect(getActualPromptWithFallback(response, 'original prompt')).toBe('original prompt');
  });
});
