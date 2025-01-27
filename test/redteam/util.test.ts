import type { Strategy } from '../../src/redteam/constants';
import type { RedteamPluginObject, RedteamStrategyObject } from '../../src/redteam/types';
import { removePrefix, getEstimatedProbes } from '../../src/redteam/util';

describe('removePrefix', () => {
  it('should remove a simple prefix', () => {
    expect(removePrefix('Prompt: Hello world', 'Prompt')).toBe('Hello world');
  });

  it('should be case insensitive', () => {
    expect(removePrefix('PROMPT: Hello world', 'prompt')).toBe('Hello world');
  });

  it('should remove asterisks from the prefix', () => {
    expect(removePrefix('**Prompt:** Hello world', 'Prompt')).toBe('Hello world');
  });

  it('should handle multiple asterisks', () => {
    expect(removePrefix('***Prompt:*** Hello world', 'Prompt')).toBe('Hello world');
  });

  it('should return the same string if prefix is not found', () => {
    expect(removePrefix('Hello world', 'Prefix')).toBe('Hello world');
  });

  it('should handle empty strings', () => {
    expect(removePrefix('', 'Prefix')).toBe('');
  });

  it('should handle prefix that is the entire string', () => {
    expect(removePrefix('Prompt:', 'Prompt')).toBe('');
  });
});

describe('getEstimatedProbes', () => {
  const mockPlugins: RedteamPluginObject[] = [{ id: 'plugin1' }, { id: 'plugin2' }];

  it('calculates base probes with no strategies', () => {
    const result = getEstimatedProbes(mockPlugins, [], 5);
    expect(result).toBe(10); // 5 tests * 2 plugins
  });

  it('calculates probes with single strategy', () => {
    const strategies: RedteamStrategyObject[] = [{ id: 'base64' as Strategy }];
    const result = getEstimatedProbes(mockPlugins, strategies, 5);
    expect(result).toBe(20); // 5 tests * 2 plugins + (2 * 5 * base64 multiplier)
  });

  it('calculates probes with multiple strategies', () => {
    const strategies: RedteamStrategyObject[] = [
      { id: 'base64' as Strategy },
      { id: 'gcg' as Strategy },
    ];
    const result = getEstimatedProbes(mockPlugins, strategies, 5);
    expect(result).toBe(30); // 5 tests * 2 plugins * (base64 + gcg multipliers * 10)
  });

  it('handles multilingual strategy with specified languages', () => {
    const strategies: RedteamStrategyObject[] = [
      {
        id: 'multilingual' as Strategy,
        config: {
          languages: {
            es: true,
            fr: true,
            de: true,
          },
        },
      },
    ];
    const result = getEstimatedProbes(mockPlugins, strategies, 5);
    expect(result).toBe(30); // 5 tests * 2 plugins * 3 languages
  });

  it('handles multilingual strategy without specified languages', () => {
    const strategies: RedteamStrategyObject[] = [
      {
        id: 'multilingual' as Strategy,
        config: {},
      },
    ];
    const result = getEstimatedProbes(mockPlugins, strategies, 5);
    expect(result).toBe(30); // 5 tests * 2 plugins * default 3 languages
  });

  it('handles empty plugins array', () => {
    const result = getEstimatedProbes([], [], 5);
    expect(result).toBe(0);
  });

  it('combines multiple strategies with multilingual', () => {
    const strategies: RedteamStrategyObject[] = [
      { id: 'base64' as Strategy },
      {
        id: 'multilingual' as Strategy,
        config: {
          languages: ['es', 'fr'],
        },
      },
    ];
    const result = getEstimatedProbes(mockPlugins, strategies, 5);
    expect(result).toBe(40); // 5 tests * 2 plugins * base64 multiplier * 2 languages
  });
});
