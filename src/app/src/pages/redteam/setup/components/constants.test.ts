import { describe, expect, it } from 'vitest';
import { findPredefinedTarget, predefinedTargets } from './constants';

describe('predefinedTargets', () => {
  it('offers supported Anthropic targets instead of retired Opus 4.1', () => {
    const values = predefinedTargets.map((target) => target.value);

    expect(values).toContain('claude-opus-4-6');
    expect(values).not.toContain('claude-opus-4-1-20250805');
  });

  it('still resolves retired targets saved in existing configurations', () => {
    expect(findPredefinedTarget('claude-opus-4-1-20250805')).toEqual({
      value: 'claude-opus-4-1-20250805',
      label: 'Anthropic Claude 4.1 Opus',
    });
  });
});
